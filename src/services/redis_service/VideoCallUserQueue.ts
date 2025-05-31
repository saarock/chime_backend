/**
 * VideoCallUserQueue
 *
 * Manages a queue of users waiting for a video‐call match using Redis.
 * Implements Omegle-style random pairing with optional strict mutual filter enforcement,
 * and now supports progressive “partial” matching (two‐attribute, one‐attribute) before random fallback.
 */

import { client } from "../../configs/redis.js";

export interface Filters {
  country?: string | null;
  gender?: string | null;
  age?: string | null;
  isStrict?: boolean;
}

export interface UserDetails {
  country?: string | null;
  gender?: string | null;
  age?: string | null;
}

export default class VideoCallUserQueue {
  // ────────────────
  // Helper / Utility
  // ────────────────

  /** Normalize any string (or null/undefined) into a lowercase, trimmed string; default to "any". */
  private static normalizeAttr(attr: string | null | undefined): string {
    return !attr ? "any" : String(attr).trim().toLowerCase();
  }

  /** Given a userId, build the Redis key where their metadata is stored. */
  private static metadataKey(userId: string): string {
    return `chime-video-user:${userId}`;
  }

  /**
   * Normalize a Redis hash (all fields as strings) into a JS object
   * where each value is lowercase—and fallback to "any" if missing/empty.
   */
  private static normalize(raw: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key in raw) {
      const value = raw[key]?.toString().trim().toLowerCase();
      out[key] = value || "any";
    }
    return out;
  }

  // ─────────────────────────
  // Public: Add & Remove Users
  // ─────────────────────────

  /**
   * Add a user into the waiting pool.
   *
   * 1. Stores their metadata (country/gender/age + preferences).
   * 2. Sets a 5-minute expiry on the metadata (so stale entries auto-expire).
   * 3. Adds the user ID to the global "waiting:all" set.
   * 4. If the user has a concrete country/gender/age (not "any"), it also
   *    adds them to the corresponding "waiting:country:...", "waiting:gender:...", etc.
   */
  static async addUser(
    userId: string,
    filters: Filters = {},
    userDetails: UserDetails = {}
  ): Promise<void> {
    if (!userId) {
      throw new Error("addUser: userId is required");
    }

    const metaKey = this.metadataKey(userId);
    const EXPIRY_SECONDS = 60 * 5; // 5 minutes

    // Normalize both the user’s own attributes and their preferences
    const country = this.normalizeAttr(userDetails.country);
    const gender = this.normalizeAttr(userDetails.gender);
    const age = this.normalizeAttr(userDetails.age);

    const prefCountry = this.normalizeAttr(filters.country);
    const prefGender = this.normalizeAttr(filters.gender);
    const prefAge = this.normalizeAttr(filters.age);
    const isStrictStr = filters.isStrict ? "true" : "false";

    // 1) Store metadata and set expire
    // 2) Add userId to the global waiting set
    await client
      .multi()
      .hSet(metaKey, {
        country,
        gender,
        age,
        pref_country: prefCountry,
        pref_gender: prefGender,
        pref_age: prefAge,
        isStrict: isStrictStr,
      })
      .expire(metaKey, EXPIRY_SECONDS)
      .sAdd("waiting:all", userId)
      .exec();

    // 3) Add user to attribute-specific sets (unless they are "any").
    if (country !== "any") {
      await client.sAdd(`waiting:country:${country}`, userId);
    }
    if (gender !== "any") {
      await client.sAdd(`waiting:gender:${gender}`, userId);
    }
    if (age !== "any") {
      await client.sAdd(`waiting:age:${age}`, userId);
    }
  }

  /**
   * Fully remove a user from all Redis sets and delete their metadata key.
   * This is used when a user leaves the queue or after a successful match.
   */
  static async removeUser(userId: string): Promise<void> {
    if (!userId) return;

    const metaKey = this.metadataKey(userId);
    const raw = await client.hGetAll(metaKey);
    const meta = this.normalize(raw);

    // Remove from global set
    await client.sRem("waiting:all", userId);

    // Remove from attribute-specific sets (only if not "any")
    if (meta.country !== "any") {
      await client.sRem(`waiting:country:${meta.country}`, userId);
    }
    if (meta.gender !== "any") {
      await client.sRem(`waiting:gender:${meta.gender}`, userId);
    }
    if (meta.age !== "any") {
      await client.sRem(`waiting:age:${meta.age}`, userId);
    }

    // Finally, delete their metadata hash
    await client.del(metaKey);
  }

  // ───────────────────────────
  // Public: Reserve & Match
  // ───────────────────────────

  /**
   * Atomically remove a user (candidateId) from all waiting sets and delete their metadata.
   * Returns true if the metadata still existed (i.e., the user was actually waiting),
   * and false if the metadata had already expired or been removed.
   *
   * This is used to “reserve” a candidate just before actually matching them,
   * to prevent race-conditions where two different callers match the same candidate.
   */
  static async reserveMatch(candidateId: string): Promise<boolean> {
    const metaKey = this.metadataKey(candidateId);

    // 1) Check if the user’s metadata still exists
    const exists = await client.exists(metaKey);
    if (!exists) {
      return false; // Already expired or removed
    }

    // 2) Read their metadata so we know which attribute sets to remove from
    const raw = await client.hGetAll(metaKey);
    const meta = this.normalize(raw);

    // 3) Atomically remove from all sets + delete metadata
    await client
      .multi()
      .sRem("waiting:all", candidateId)
      .sRem(`waiting:country:${meta.country}`, candidateId)
      .sRem(`waiting:gender:${meta.gender}`, candidateId)
      .sRem(`waiting:age:${meta.age}`, candidateId)
      .del(metaKey)
      .exec();

    return true;
  }

  /**
   * Core matching entry point.
   *
   * 1) Loads the caller’s metadata (attributes + preferences).
   * 2) Builds a list of “filtered candidates” via Redis set intersection.
   * 3) Tries strict matching first (if isStrict=true).
   * 4) If strict fails (or not strict), tries progressive partial-match tiers:
   *    a) Two-attribute combinations
   *    b) Single-attribute combinations
   * 5) Finally, falls back to the full “everyone waiting” random match.
   *
   * Returns the matched userId, or null if no one is available.
   */
  static async findMatch(userId: string): Promise<string | null> {
    if (!userId) {
      throw new Error("findMatch: userId is required");
    }

    // 1) Load caller’s metadata
    const rawCaller = await client.hGetAll(this.metadataKey(userId));
    const caller = this.normalize(rawCaller);

    const callerPrefs = {
      country: caller.pref_country,
      gender: caller.pref_gender,
      age: caller.pref_age,
      isStrict: caller.isStrict === "true",
    };
    const callerAttrs = {
      country: caller.country,
      gender: caller.gender,
      age: caller.age,
    };

    // 2) Build Redis keys array based on caller’s preferences (for set-intersection)
    const prefKeys: string[] = ["waiting:all"];
    if (callerPrefs.country !== "any") {
      prefKeys.push(`waiting:country:${callerPrefs.country}`);
    }
    if (callerPrefs.gender !== "any") {
      prefKeys.push(`waiting:gender:${callerPrefs.gender}`);
    }
    if (callerPrefs.age !== "any") {
      prefKeys.push(`waiting:age:${callerPrefs.age}`);
    }

    // 3) Intersect sets to get “strictly filtered” candidates, then remove callerId
    let candidates: string[] =
      prefKeys.length === 1
        ? await client.sMembers(prefKeys[0])
        : await client.sInter(prefKeys);
    candidates = candidates.filter((id) => id !== userId);

    // 4) If strict mode is on, attempt mutual strict match
    if (callerPrefs.isStrict) {
      const strictMatchId = await this.findMutualStrictMatch(
        userId,
        candidates,
        callerPrefs,
        callerAttrs
      );
      if (strictMatchId) {
        return strictMatchId;
      }
      // If strict‐only is enforced, we now move on to **partial** match tiers
      // rather than bail out immediately.
    }

    // 5) Progressive partial‐match tiers (only if not already matched strictly)

    // 5a) Two‐attribute combinations
    const twoAttrMatch = await this.findTwoAttributeMatch(
      userId,
      callerPrefs,
      callerAttrs
    );
    if (twoAttrMatch) {
      return twoAttrMatch;
    }

    // 5b) Single‐attribute combinations
    const oneAttrMatch = await this.findSingleAttributeMatch(
      userId,
      callerPrefs,
      callerAttrs
    );

    if (oneAttrMatch) {
      return oneAttrMatch;
    }

    // 6) Finally, full “everyone waiting” fallback (random / age‐closest)
    const fallbackId = await this.looseFallbackAll(
      userId,
      callerPrefs,
      callerAttrs
    );
    return fallbackId;
  }

  // ───────────────────────────────────────────────────
  // Private: Strict Matching Logic
  // ───────────────────────────────────────────────────

  /**
   * Among the given `candidates`, find one that satisfies mutual strict preferences.
   * 
   * Steps:
   *  1. For each candidateId, load their metadata (attributes + prefs).
   *  2. Check mutual strict match on all three fields.
   *  3. If both sides match, reserve that candidate and return.
   * If none qualify, return null.
   */
  private static async findMutualStrictMatch(
    callerId: string,
    candidates: string[],
    callerPrefs: {
      country: string;
      gender: string;
      age: string;
      isStrict: boolean;
    },
    callerAttrs: {
      country: string;
      gender: string;
      age: string;
    }
  ): Promise<string | null> {
    for (const candidateId of candidates) {
      // Load candidate’s metadata
      const rawCand = await client.hGetAll(this.metadataKey(candidateId));
      const candMeta = this.normalize(rawCand);

      const candPrefs = {
        country: candMeta.pref_country,
        gender: candMeta.pref_gender,
        age: candMeta.pref_age,
        isStrict: candMeta.isStrict === "true",
      };
      const candAttrs = {
        country: candMeta.country,
        gender: candMeta.gender,
        age: candMeta.age,
      };

      // Mutual strict match: all three fields must match exactly if either side demands strict or cares about age
      const callerMatchesCand = this.matchesStrict(callerPrefs, candAttrs);
      const candMatchesCaller = this.matchesStrict(candPrefs, callerAttrs);

      if (callerMatchesCand && candMatchesCaller) {
        const reserved = await this.reserveMatch(candidateId);
        if (reserved) {
          return candidateId;
        }
      }
    }
    return null;
  }

  /**
   * Checks strict filter logic:
   *  - If isStrict OR age preference is concrete (not "any"), then require all three to match exactly.
   *  - Otherwise, allow any‐or‐exact for each field.
   */
  private static matchesStrict(
    prefs: { country: string; gender: string; age: string; isStrict: boolean },
    attrs: { country: string; gender: string; age: string }
  ): boolean {
    if (prefs.isStrict || prefs.age !== "any") {
      // All three must match exactly
      return (
        prefs.country === attrs.country &&
        prefs.gender === attrs.gender &&
        prefs.age === attrs.age
      );
    }

    // Otherwise “any” acts as wildcard
    return (
      (prefs.country === "any" || prefs.country === attrs.country) &&
      (prefs.gender === "any" || prefs.gender === attrs.gender) &&
      (prefs.age === "any" || prefs.age === attrs.age)
    );
  }

  // ───────────────────────────────────────────────────
  // Private: Two‐Attribute Partial Matching
  // ───────────────────────────────────────────────────

  /**
   * Attempt to find any candidate who matches two attributes (“pair match”),
   * in this priority order:
   *   1. country + gender
   *   2. country + age
   *   3. gender + age
   *
   * For each pair, we:
   *  1. Build Redis keys for the caller’s two preferences (if not "any").
   *  2. Intersect those sets, filter out callerId, then check mutual compatibility
   *     (i.e. candidate’s preferences shouldn’t contradict).
   *  3. If found, reserveMatch() on that candidate and return their ID. Otherwise, move on.
   */
  private static async findTwoAttributeMatch(
    callerId: string,
    callerPrefs: { country: string; gender: string; age: string; isStrict: boolean },
    callerAttrs: { country: string; gender: string; age: string }
  ): Promise<string | null> {
    // Define the three two-attribute tiers:
    const tiers: Array<["country" | "gender" | "age", "country" | "gender" | "age"]> = [
      ["country", "gender"],
      ["country", "age"],
      ["gender", "age"],
    ];

    for (const [attrA, attrB] of tiers) {
      const prefA = callerPrefs[attrA];
      const prefB = callerPrefs[attrB];
      if (prefA === "any" || prefB === "any") {
        // If caller didn’t specify both of these preferences, skip this tier
        continue;
      }

      // Build Redis keys: waiting:attrA:<prefA> ∩ waiting:attrB:<prefB>
      const keyA = `waiting:${attrA}:${prefA}`;
      const keyB = `waiting:${attrB}:${prefB}`;

      let candidates: string[] = [];
      try {
        candidates = await client.sInter([keyA, keyB]);
      } catch {
        candidates = [];
      }
      // Exclude caller
      candidates = candidates.filter((id) => id !== callerId);
      if (candidates.length === 0) {
        continue;
      }

      // Check each candidate for mutual compatibility on these two fields
      for (const candId of candidates) {
        // Load candidate metadata
        const rawCand = await client.hGetAll(this.metadataKey(candId));
        const candMeta = this.normalize(rawCand);

        // Candidate’s own preferences:
        const candPrefs = {
          country: candMeta.pref_country,
          gender: candMeta.pref_gender,
          age: candMeta.pref_age,
          isStrict: candMeta.isStrict === "true",
        };

        // Candidate’s attributes:
        const candAttrs = {
          country: candMeta.country,
          gender: candMeta.gender,
          age: candMeta.age,
        };

        // We only need to check that candidate’s preferences do not contradict
        // these two fields. In other words, candidatePrefs[attrA] must be
        // either “any” or exactly callerAttrs[attrA], and same for attrB.

        const candPrefA = candPrefs[attrA];
        const candPrefB = candPrefs[attrB];
        const callerAttrA = callerAttrs[attrA];
        const callerAttrB = callerAttrs[attrB];

        const mutualA = candPrefA === "any" || candPrefA === callerAttrA;
        const mutualB = candPrefB === "any" || candPrefB === callerAttrB;

        if (!mutualA || !mutualB) {
          continue;
        }

        // If mutual compatibility stands, reserve and return
        const reserved = await this.reserveMatch(candId);
        if (reserved) {
          return candId;
        }
      }
      // If no one in this tier worked out, move to the next pair of attributes
    }

    return null;
  }

  // ───────────────────────────────────────────────────
  // Private: Single‐Attribute Partial Matching
  // ───────────────────────────────────────────────────

  /**
   * Attempt to find any candidate who matches exactly one attribute,
   * in this priority order:
   *   1. country
   *   2. gender
   *   3. age
   *
   * For each attribute:
   *  1. If caller’s preference on that attribute ≠ "any", intersect waiting:<attr>:<pref>
   *  2. Exclude callerId and check that candidate’s preference on that attribute
   *     is “any” or matches caller’s attribute.
   *  3. If found, reserveMatch() on that candidate and return their ID.
   */
  private static async findSingleAttributeMatch(
    callerId: string,
    callerPrefs: { country: string; gender: string; age: string; isStrict: boolean },
    callerAttrs: { country: string; gender: string; age: string }
  ): Promise<string | null> {
    const singleTiers: Array<"country" | "gender" | "age"> = ["country", "gender", "age"];

    for (const attr of singleTiers) {
      const prefValue = callerPrefs[attr];
      if (prefValue === "any") {
        continue; // Caller doesn’t care about this attribute
      }

      // Look up waiting set for exactly that preference
      const key = `waiting:${attr}:${prefValue}`;
      let candidates: string[] = [];
      try {
        candidates = await client.sMembers(key);
      } catch {
        candidates = [];
      }
      // Exclude caller
      candidates = candidates.filter((id) => id !== callerId);
      if (candidates.length === 0) {
        continue;
      }

      // For each candidate, check that their preference on THIS attribute
      // is “any” or exactly matches callerAttrs[attr].
      for (const candId of candidates) {
        const rawCand = await client.hGetAll(this.metadataKey(candId));
        const candMeta = this.normalize(rawCand);

        const candPref = candMeta[`pref_${attr}`]; // “pref_country”, “pref_gender” or “pref_age”
        const callerAttr = callerAttrs[attr];

        if (candPref !== "any" && candPref !== callerAttr) {
          continue;
        }

        // We’ve found a candidate who matches on this single attribute,
        // and who isn’t too picky on that same attribute.
        const reserved = await this.reserveMatch(candId);
        if (reserved) {
          return candId;
        }
      }
      // If none in this single‐attribute tier worked out, keep going
    }

    return null;
  }

  // ───────────────────────────────────────────────────
  // Private: Full “Everyone Waiting” Fallback
  // ───────────────────────────────────────────────────

  /**
   * If no one in the previous tiers matched, attempt a broader "everyone waiting" fallback.
   * 1. Get full "waiting:all" (minus caller).
   * 2. If caller has an age preference, find the closest‐age waiting user, reserve, and return.
   * 3. Otherwise, pick a random waiting user, reserve, and return.
   * 4. If no one’s left, return null.
   */
  private static async looseFallbackAll(
    callerId: string,
    callerPrefs: { country: string; gender: string; age: string; isStrict: boolean },
    callerAttrs: { country: string; gender: string; age: string }
  ): Promise<string | null> {
    // 1) Load everyone currently waiting
    let allWaiting = await client.sMembers("waiting:all");
    allWaiting = allWaiting.filter((id) => id !== callerId);

    if (allWaiting.length === 0) {
      return null;
    }

    // 2) If caller has an age preference, try closest‐age match
    if (callerPrefs.age !== "any") {
      const callerAgeNum = parseInt(callerAttrs.age, 10);
      if (!isNaN(callerAgeNum)) {
        const diffs: { id: string; diff: number }[] = [];
        for (const candId of allWaiting) {
          const raw = await client.hGetAll(this.metadataKey(candId));
          const meta = this.normalize(raw);
          const candAgeNum = parseInt(meta.age, 10);
          if (!isNaN(candAgeNum)) {
            diffs.push({ id: candId, diff: Math.abs(callerAgeNum - candAgeNum) });
          }
        }
        if (diffs.length > 0) {
          const minDiff = Math.min(...diffs.map((d) => d.diff));
          const closestIds = diffs.filter((d) => d.diff === minDiff).map((d) => d.id);
          const pick = closestIds[Math.floor(Math.random() * closestIds.length)];
          const reserved = await this.reserveMatch(pick);
          if (reserved) {
            return pick;
          }
        }
      }
    }

    // 3) Otherwise, random pick
    const randomPick = allWaiting[Math.floor(Math.random() * allWaiting.length)];
    const reserved = await this.reserveMatch(randomPick);
    if (reserved) {
      return randomPick;
    }

    return null;
  }
}

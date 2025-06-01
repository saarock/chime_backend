import { videoClient } from "../../configs/redis.js";
import { sendMessage } from "../../kafka/producer.js";


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
   * 2. Sets a 5-minute expiry on the metadata.
   * 3. Adds the user ID to the global "waiting:all" set.
   * 4. Adds them to single‐attribute sets if concrete.
   * 5. Adds them to compound sets for each pair/triple of their own attributes.
   * 6. If age is numeric, adds them to a sorted set by age for proximity queries.
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

    // Normalize user’s own attributes
    const country = this.normalizeAttr(userDetails.country);
    const gender = this.normalizeAttr(userDetails.gender);

    const age = this.normalizeAttr(userDetails.age);

    // Normalize preferences
    const prefCountry = this.normalizeAttr(filters.country);
    const prefGender = this.normalizeAttr(filters.gender);
    const prefAge = this.normalizeAttr(filters.age);
    const isStrictStr = filters.isStrict ? "true" : "false";

    const pipeline = videoClient.multi();

    // 1) Store metadata, set expiry, add to global waiting set
    pipeline.hSet(metaKey, {
      country,
      gender,
      age,
      pref_country: prefCountry,
      pref_gender: prefGender,
      pref_age: prefAge,
      isStrict: isStrictStr,
    });
    pipeline.expire(metaKey, EXPIRY_SECONDS);
    pipeline.sAdd("waiting:all", userId);

    // 2) Add to single‐attribute sets if not "any"
    if (country !== "any") {
      pipeline.sAdd(`waiting:country:${country}`, userId);
    }
    if (gender !== "any") {
      pipeline.sAdd(`waiting:gender:${gender}`, userId);
    }
    if (age !== "any") {
      pipeline.sAdd(`waiting:age:${age}`, userId);
    }

    // 3) Add to compound sets (pairs + triple) based on own attributes
    if (country !== "any" && gender !== "any") {
      pipeline.sAdd(`waiting:combo:country:${country}:gender:${gender}`, userId);
    }
    if (country !== "any" && age !== "any") {
      pipeline.sAdd(`waiting:combo:country:${country}:age:${age}`, userId);
    }
    if (gender !== "any" && age !== "any") {
      pipeline.sAdd(`waiting:combo:gender:${gender}:age:${age}`, userId);
    }
    if (country !== "any" && gender !== "any" && age !== "any") {
      pipeline.sAdd(
        `waiting:combo:country:${country}:gender:${gender}:age:${age}`,
        userId
      );
    }

    // 4) If age is numeric, add to sorted set for age-based queries
    const ageNum = parseInt(age, 10);
    if (!isNaN(ageNum)) {
      pipeline.zAdd("waiting:age_sorted", { score: ageNum, value: userId });
    }

    await pipeline.exec();
    console.log("added the user ");

  }

  /**
   * Fully remove a user from all Redis sets and delete their metadata key.
   * This is used when a user leaves the queue or after a successful match.
   */
  static async removeUser(userId: string): Promise<void> {
    if (!userId) return;

    const metaKey = this.metadataKey(userId);
    const raw = await videoClient.hGetAll(metaKey);
    const meta = this.normalize(raw);

    const pipeline = videoClient.multi();

    // Remove from global set
    pipeline.sRem("waiting:all", userId);

    // Remove from single‐attribute sets if not "any"
    if (meta.country !== "any") {
      pipeline.sRem(`waiting:country:${meta.country}`, userId);
    }
    if (meta.gender !== "any") {
      pipeline.sRem(`waiting:gender:${meta.gender}`, userId);
    }
    if (meta.age !== "any") {
      pipeline.sRem(`waiting:age:${meta.age}`, userId);
    }

    // Remove from compound sets
    if (meta.country !== "any" && meta.gender !== "any") {
      pipeline.sRem(
        `waiting:combo:country:${meta.country}:gender:${meta.gender}`,
        userId
      );
    }
    if (meta.country !== "any" && meta.age !== "any") {
      pipeline.sRem(`waiting:combo:country:${meta.country}:age:${meta.age}`, userId);
    }
    if (meta.gender !== "any" && meta.age !== "any") {
      pipeline.sRem(`waiting:combo:gender:${meta.gender}:age:${meta.age}`, userId);
    }
    if (meta.country !== "any" && meta.gender !== "any" && meta.age !== "any") {
      pipeline.sRem(
        `waiting:combo:country:${meta.country}:gender:${meta.gender}:age:${meta.age}`,
        userId
      );
    }

    // Remove from sorted set if age numeric
    const ageNum = parseInt(meta.age, 10);
    if (!isNaN(ageNum)) {
      pipeline.zRem("waiting:age_sorted", userId);
    }

    // Delete metadata hash
    pipeline.del(metaKey);

    await pipeline.exec();
  }

  // ───────────────────────────
  // Public: Reserve & Match
  // ───────────────────────────

  /**
   * Atomically remove a user (candidateId) from all waiting sets and delete their metadata.
   * Returns true if the metadata still existed (the user was actually waiting),
   * and false if the metadata had already expired or been removed.
   *
   * Used to “reserve” a candidate just before matching, preventing races.
   */
  static async reserveMatch(candidateId: string): Promise<boolean> {

    const metaKey = this.metadataKey(candidateId);


    // 1) Check existence
    const exists = await videoClient.exists(metaKey);
    if (!exists) {
      return false; // Already expired or removed
    }

    // 2) Read metadata
    const raw = await videoClient.hGetAll(metaKey);
    const meta = this.normalize(raw);

    const pipeline = videoClient.multi();

    // 3) Remove from global sets
    pipeline.sRem("waiting:all", candidateId);
    if (meta.country !== "any") {
      pipeline.sRem(`waiting:country:${meta.country}`, candidateId);
    }
    if (meta.gender !== "any") {
      pipeline.sRem(`waiting:gender:${meta.gender}`, candidateId);
    }
    if (meta.age !== "any") {
      pipeline.sRem(`waiting:age:${meta.age}`, candidateId);
    }

    // 4) Remove from compound sets
    if (meta.country !== "any" && meta.gender !== "any") {
      pipeline.sRem(
        `waiting:combo:country:${meta.country}:gender:${meta.gender}`,
        candidateId
      );
    }
    if (meta.country !== "any" && meta.age !== "any") {
      pipeline.sRem(`waiting:combo:country:${meta.country}:age:${meta.age}`, candidateId);
    }
    if (meta.gender !== "any" && meta.age !== "any") {
      pipeline.sRem(`waiting:combo:gender:${meta.gender}:age:${meta.age}`, candidateId);
    }
    if (meta.country !== "any" && meta.gender !== "any" && meta.age !== "any") {
      pipeline.sRem(
        `waiting:combo:country:${meta.country}:gender:${meta.gender}:age:${meta.age}`,
        candidateId
      );
    }

    // 5) Remove from sorted set if age numeric
    const ageNum = parseInt(meta.age, 10);
    if (!isNaN(ageNum)) {
      pipeline.zRem("waiting:age_sorted", candidateId);
    }

    // 6) Delete metadata hash
    pipeline.del(metaKey);

    await pipeline.exec();
    return true;
  }

  /**
   * Core matching entry point.
   *
   * 1) Loads caller’s metadata (attributes + preferences).
   * 2) Tries strict matching via a direct compound‐set lookup.
   * 3) If strict fails (or not strict), tries two‐attribute compound sets.
   * 4) If that fails, tries single‐attribute sets.
   * 5) Finally, falls back to age‐proximity via a sorted set or a random pick.
   * 6) Upon matching, reserves both users and publishes a KAFKA producer for the caller.
   *
   * Returns matched userId, or null if none available.
   */
  static async findMatch(userId: string): Promise<string | null> {
    if (!userId) {
      throw new Error("findMatch: userId is required");
    }



    // 1) Load caller’s metadata
    const rawCaller = await videoClient.hGetAll(this.metadataKey(userId));
    if (Object.keys(rawCaller).length === 0) {
      // Already expired or removed
      return null;
    }
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

    // 1.1) Now “reserve” the caller so they won’t be matched by someone else
    const callerReserved = await this.reserveMatch(userId);
    if (!callerReserved) {
      // If this ever returns false, it means the hash vanished in the meantime
      return null;
    }

    // Helper: Once we pick a candidateId, reserve both sides and publish events
    const finalizeMatch = async (candId: string): Promise<string> => {
      try {
        await this.reserveMatch(userId);
        await this.reserveMatch(candId);

        // send Message to the caller only caller through the kafka
        await sendMessage("match-user", {
          callerId: userId,
          calleeId: candId,
          isCaller: true,
        });

        return candId;
      } catch (error) {
        throw error;
      }
    };

    // ───────────────────────────────────────────────────
    // 2) Strict Match via triple‐combo if all prefs concrete
    // ───────────────────────────────────────────────────
    if (
      callerPrefs.country !== "any" &&
      callerPrefs.gender !== "any" &&
      callerPrefs.age !== "any"
    ) {

      const keyTriple = `waiting:combo:country:${callerPrefs.country}:gender:${callerPrefs.gender}:age:${callerPrefs.age}`;
      let candidates = await videoClient.sMembers(keyTriple);
      candidates = candidates.filter((id) => id !== userId);

      if (candidates.length > 0) {
        // Pipeline: fetch metadata for all strict‐candidates
        const pipeline = videoClient.multi();
        for (const cid of candidates) {
          pipeline.hGetAll(this.metadataKey(cid));
        }
        // TS‐safe cast: pipeline.exec() → unknown → desired tuple type[]
        const rawResults: any[] = await pipeline.exec()
        for (let i = 0; i < candidates.length; i++) {
          const candId = candidates[i];
          const rawCand = rawResults[i];
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

          // Both sides must match exactly all three fields
          const mutualStrict =
            callerPrefs.country === candAttrs.country &&
            callerPrefs.gender === candAttrs.gender &&
            callerPrefs.age === candAttrs.age &&
            candPrefs.country === callerAttrs.country &&
            candPrefs.gender === callerAttrs.gender &&
            candPrefs.age === callerAttrs.age;

          if (mutualStrict) {
            return finalizeMatch(candId);
          }
        }
      }
    }

    // If caller isStrict but we didn’t find a strict triple match, proceed to partial
    // ───────────────────────────────────────────────────
    // 3) Two‐Attribute Partial Match via compound sets
    // ───────────────────────────────────────────────────
    const twoAttrTiers: Array<["country" | "gender" | "age", "country" | "gender" | "age"]> = [
      ["country", "gender"],
      ["country", "age"],
      ["gender", "age"],
    ];
    for (const [attrA, attrB] of twoAttrTiers) {

      const prefA = callerPrefs[attrA];
      const prefB = callerPrefs[attrB];

      if (prefA === "any" || prefB === "any") {
        continue;
      }

      // Build the compound key for those two prefs
      const keyPair = `waiting:combo:${attrA}:${prefA}:${attrB}:${prefB}`;
      let candidates = await videoClient.sMembers(keyPair);

      candidates = candidates.filter((id) => id !== userId);
      if (candidates.length === 0) {
        continue;
      }

      // Pipeline: fetch metadata for all candidates in this tier
      const pipeline = videoClient.multi();
      for (const candId of candidates) {
        pipeline.hGetAll(this.metadataKey(candId));
      }
      const rawResults: any[] = await pipeline.exec();

      for (let i = 0; i < candidates.length; i++) {
        const candId = candidates[i];
        const rawCand = rawResults[i];
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

        // Check mutual compatibility on these two fields:
        const mutualA = candPrefs[attrA] === "any" || candPrefs[attrA] === callerAttrs[attrA];
        const mutualB = candPrefs[attrB] === "any" || candPrefs[attrB] === callerAttrs[attrB];
        if (!mutualA || !mutualB) {
          continue;
        }

        return finalizeMatch(candId);
      }
    }

    // ───────────────────────────────────────────────────
    // 4) Single‐Attribute Partial Match
    // ───────────────────────────────────────────────────


    const singleTiers: Array<"country" | "gender" | "age"> = ["country", "gender", "age"];
    for (const attr of singleTiers) {
      const prefValue = callerPrefs[attr]; // Prefer value by the caller
      if (prefValue === "any") {
        continue;
      }


      const keySingle = `waiting:${attr}:${prefValue}`;
      let candidates = await videoClient.sMembers(keySingle);




      candidates = candidates.filter((id) => id !== userId); // User own from the list
      if (candidates.length === 0) {
        continue;
      }

      // Pipeline: fetch metadata for all candidates in this tier
      const pipeline = videoClient.multi();
      for (const candId of candidates) {
        pipeline.hGetAll(this.metadataKey(candId));
      }




      const rawResults: any[] = await pipeline.exec();

      for (let i = 0; i < candidates.length; i++) {
        const candId = candidates[i];


        // rawResults[i] is an array like [ { ...metadata... } ]
        const rawCand = rawResults[i];  // extract the user metadata object



        const candMeta = this.normalize(rawCand);

        const candPref = candMeta[`pref_${attr}`]; // e.g. "pref_country"

        const callerAttr = callerAttrs[attr];

        if (candPref !== "any" && candPref !== callerAttr) {
          continue;
        }


        return finalizeMatch(candId);
      }



    }

    // ───────────────────────────────────────────────────
    // 5) Fallback: Age‐Proximity via Sorted Set or Random
    // ───────────────────────────────────────────────────
    // Remove caller from waiting:all to avoid picking self
    await videoClient.sRem("waiting:all", userId);

    if (callerPrefs.age !== "any") {
      const callerAgeNum = parseInt(callerAttrs.age, 10);
      if (!isNaN(callerAgeNum)) {
        const windowSize = 5; // years
        const minScore = callerAgeNum - windowSize - 2;
        const maxScore = callerAgeNum + windowSize;
        const nearbyIds = await videoClient.zRangeByScore(
          "waiting:age_sorted",
          minScore,
          maxScore
        );



        const candidates = nearbyIds.filter((id) => id !== userId);

        if (candidates.length > 0) {
          // Pipeline: fetch metadata
          const pipeline = videoClient.multi();
          for (const cid of candidates) {
            pipeline.hGetAll(this.metadataKey(cid));
          }
          const rawResults: any[] = await pipeline.exec();


          let bestId: string | null = null;
          let bestDiff = Infinity;
          for (let i = 0; i < candidates.length; i++) {
            const cid = candidates[i];
            const rawCand = rawResults[i];
            const meta = this.normalize(rawCand);
            const candAgeNum = parseInt(meta.age, 10);
            if (isNaN(candAgeNum)) continue;
            const diff = Math.abs(callerAgeNum - candAgeNum);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestId = cid;
            }
          }

          if (bestId) {
            return finalizeMatch(bestId);
          }
        }
      }
    }

    // 6) Random fallback
    const allWaiting = await videoClient.sMembers("waiting:all");
    const others = allWaiting.filter((id) => id !== userId);

    if (others.length === 0) {
      return null; // no one else to match
    }

    const randomIndex = Math.floor(Math.random() * others.length);
    const randomPick = others[randomIndex];
    return finalizeMatch(randomPick);

    // No match found
    return null;
  }
}

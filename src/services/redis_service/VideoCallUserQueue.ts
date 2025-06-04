// Import all the necessary dependencies here
import { fisherShuffle } from "../../utils/fisherShuffle.js";
import { videoClient } from "../../configs/redis.js";
import { redisLock, RedisLockKeyStore } from "./index.js";
import type { Filters, UserDetails, UserMetaData } from "../../types/index.js";


/**
 * 1. VideoCallUserQueue servive which is responsible for adding the user to the redis accoriding the data types and attribute based indexing
 * 2. Responsible for removing the user from the queue after two user get matched and locked is get success 
 * 3. Responsible for filtering different types of filtering are in use here 
 * 4. Lock mechanism to handle the rance-condition
 */
export default class VideoCallUserQueue {


  // ─────────────────────────
  // Private: Helpers
  // ─────────────────────────


  // VideoCallUserQueue readonly constant variables
  private static readonly MAX_RETRIES_MULTIPLIER = 5;
  private static readonly VIDEO_CALL_LOCK_PREFIX = "video:call:lock:for:video:call";
  private static readonly ADDING_LOCK_PREFIX = "video:call:user:lock:while:adding";
  private static readonly REMOVING_LOCK_PREFIX = "video:call:user:lock:while:removing";


  /** Normalize any string (or null/undefined) into a lowercase, trimmed string; default to "any". */
  private static normalizeAttr(attr: string | number | null | undefined): string {
    if (attr === null || attr === undefined) return "any";
    return String(attr).trim().toLowerCase() || "any";
  }

  /** Normalize raw Redis hash object into UserMetaData with proper types */
  private static normalizeObject(rawMeta: Record<string, any>): UserMetaData {
    const meta = Object.fromEntries(Object.entries(rawMeta));
    return {
      country: meta.country || null,
      gender: meta.gender || null,
      age: meta.age ? Number(meta.age) : null,
      pref_country: meta.pref_country || "any",
      pref_gender: meta.pref_gender || "any",
      pref_age:
        meta.pref_age === undefined ||
          meta.pref_age === null ||
          meta.pref_age === "any"
          ? "any"
          : Number(meta.pref_age),
      isStrict: meta.isStrict === "true",
    };
  }

  /** Given a userId, build the Redis key where their metadata is stored. */
  private static metadataKey(userId: string): string {
    return `chime-video-user:${userId}`;
  }

  /**
   * This method is responsible for the lock the both caller and callee as candidate if the lock 
   * @param {string} param0.callerId - CallerId  
   * @param candidateId 
   * @returns {Promise<string | null>} If isLocked done then return the candidate id if not then return the null
   */
  private static async finalizeMatch(callerId: string, candidateId: string): Promise<string | null> {
    const isLocked = await redisLock.lockPair(callerId, candidateId, this.VIDEO_CALL_LOCK_PREFIX);
    if (isLocked) {
      try {
        // Clean-up
        await Promise.all([
          VideoCallUserQueue.removeUser(callerId),
          VideoCallUserQueue.removeUser(candidateId),
          redisLock.unlockPair(callerId, candidateId, this.VIDEO_CALL_LOCK_PREFIX),
          RedisLockKeyStore.deleteStoredLockValue(callerId, this.VIDEO_CALL_LOCK_PREFIX),
          RedisLockKeyStore.deleteStoredLockValue(candidateId, this.VIDEO_CALL_LOCK_PREFIX),
          redisLock.unlockUser(callerId, this.ADDING_LOCK_PREFIX),
          RedisLockKeyStore.deleteStoredLockValue(callerId, this.ADDING_LOCK_PREFIX),
        ]);
      } catch (error) {
        return null;
      }
      return candidateId;
    }

    return null;
  }



  // ─────────────────────────
  // Public: Add & Remove Users
  // ─────────────────────────

  /**
   * Add a user into the waiting pool.
   */
  static async addUser(
    userId: string,
    filters: Filters = {},
    userDetails: UserDetails = {}
  ): Promise<void> {
    if (!userId) {
      throw new Error("addUser: userId is required");
    }


    const isUserAlreadyLockedInRemoveQueue = await redisLock.isUserAlreadyLocked(userId, this.REMOVING_LOCK_PREFIX);
    if (isUserAlreadyLockedInRemoveQueue) {
      // Before adding the user un-lock the user from the remove-lock
      await redisLock.unlockUser(userId, this.REMOVING_LOCK_PREFIX);
    }
    await RedisLockKeyStore.deleteStoredLockValue(userId, this.REMOVING_LOCK_PREFIX); // Delete the store lock VALUE

    // Lock the user before adding the user to the set 
    const isUserIsAlreadyLock = redisLock.lockUser(userId, this.ADDING_LOCK_PREFIX); // This will prevent from the error also
    if (!isUserIsAlreadyLock) return; /** If lock failed return @note Lock faield means user is already in the set */

    const metaKey = this.metadataKey(userId); // Get the meta key for user
    const EXPIRY_SECONDS = 60 * 5; // 5 minutes expiry time


    // Normalize user’s own attributes
    const country = this.normalizeAttr(userDetails.country);
    const gender = this.normalizeAttr(userDetails.gender);

    // If age is number, normalize as string; else fallback to 'any'
    const age =
      userDetails.age !== undefined && userDetails.age !== null
        ? String(userDetails.age).trim().toLowerCase()
        : "any";

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

    // Add the user first in the waiting:all set so at the fallback we can pick up the long waiting user first
    pipeline.zAdd("waiting:all", { score: Date.now(), value: userId });

    // if user donot fulfilled the filter then there county, gender and age by default is any so handle the any case store them seperately
    if (country === "any" && gender === "any" && age === "any") {
      pipeline.sAdd(`waiting:any`, userId);
    }

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
      pipeline.sAdd(
        `waiting:combo:country:${country}:gender:${gender}`,
        userId
      );
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

    // Execute the commands
    await pipeline.exec();
  }

  /**
   * Fully remove a user from all Redis sets and delete their metadata key.
   */
  static async removeUser(userId: string): Promise<void> {
    if (!userId) return;
    const isUserIsAlreadyLock = await redisLock.isUserAlreadyLocked(userId, this.ADDING_LOCK_PREFIX);
    if (!isUserIsAlreadyLock) return;
    const isUserLocked = await redisLock.lockUser(userId, this.REMOVING_LOCK_PREFIX);     // Lock the user while removing to prevent from the multiple un-necessary remove which may contains many errors
    if (!isUserLocked) return;
    const metaKey = this.metadataKey(userId);
    const raw = await videoClient.hGetAll(metaKey);

    if (!raw || Object.keys(raw).length === 0) {
      // no metadata found; just remove userId from global set and return
      await videoClient.sRem("waiting:all", userId);
      return;
    }

    const meta = this.normalizeObject(raw);
    const pipeline = videoClient.multi();

    // Remove from global set
    pipeline.zRem("waiting:all", userId);


    if (meta.country === "any" && meta.gender === "any" && meta.age === "any") {
      pipeline.sRem(`waiting:any`, userId);
    }

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
      pipeline.sRem(
        `waiting:combo:country:${meta.country}:age:${meta.age}`,
        userId
      );
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
    const ageNum = parseInt(String(meta.age), 10);
    if (!isNaN(ageNum)) {
      pipeline.zRem("waiting:age_sorted", userId);
    }

    // Delete metadata hash
    pipeline.del(metaKey);

    await pipeline.exec();
  }



  /**
   * 
   * @param {string} param0.callerId - Id of the user who is caller
   * @param {UserMetaData} param0.callerMeta - Meta data of the user who caller
   * @returns {Promise<string | null>} if candidate found return candidate id as string other wise return false
   */
  private static async findFallbackMatch(
    callerId: string,
    callerMeta: UserMetaData
  ): Promise<string | null> {
    // Constant of the global key where all the user globally set
    const fallbackSet = "waiting:all";
    const pageSize = 10; // This is Page size same like the skip in the pagination

    // Attept = 0 means always start with 0 to max_RETRIES [For now loop doesnot need but still there is loop for the future uses no-worries]
    for (let attempt = 0; attempt < this.MAX_RETRIES_MULTIPLIER; attempt++) {
      const startIndex = attempt * pageSize;
      const endIndex = startIndex + pageSize - 1;

      // Find the oldest waiting users each time it return  0 - 9, 10- 19, 20 - 29 and so on users but only if there are users other wise it will return the empty array
      const result = await videoClient.sendCommand([
        'ZRANGE',
        fallbackSet,
        startIndex.toString(),
        endIndex.toString(),
        'WITHSCORES'
      ]);

      if (!Array.isArray(result) || result.length === 0) {
        break; // No users in fallback set
      }

      // Rebuild entries as [userId, score]
      const entries: { userId: string; score: number }[] = [];
      for (let i = 0; i < result.length; i += 2) {
        entries.push({
          userId: result[i],
          score: parseInt(result[i + 1])
        });
      }

      // Shuffle the entries
      fisherShuffle(entries);

      // Try to find a valid match
      for (const { userId: candidateId } of entries) {
        if (candidateId === callerId) continue;
        return candidateId;
      }
    }

    // Doesn't found then return null
    return null;
  }



  /**
   * Main match making algorithm:
   * 1. Fetch and normalize caller’s metadata.
   * 2. Try `findByGenderPreference()`.
   * 3. If null, call `findFallbackMatch()`.
   * 4. If a match is found, return that user ID; otherwise return null.
   */
  static async findMatch(userId: string): Promise<string | null> {

    if (!userId) throw new Error("userId is required");

    // 1) Fetch caller’s metadata
    const rawCaller = await videoClient.hGetAll(this.metadataKey(userId));

    if (!rawCaller || Object.keys(rawCaller).length === 0) {
      // No metadata for caller → cannot match
      return null;
    }
    const callerMeta = this.normalizeObject(rawCaller);

    // Fall-Back [If in the set there are users then it will 100% match and get the candidate]
    const fallbackMatch = await this.findFallbackMatch(userId, callerMeta);
    if (fallbackMatch) {
      console.log("match found from the random");
      return await this.finalizeMatch(userId, fallbackMatch);
    }

    // No match found at all
    return null;
  }

}

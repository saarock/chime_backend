// Import all the necessary dependencies
import { fisherShuffle } from "../../utils/fisherShuffle.js";
import { videoClient } from "../../configs/redis.js";
import { redisLock, RedisLockKeyStore } from "./index.js";
import type { Filters, UserDetails, UserMetaData } from "../../types/index.js";

/**
 * VideoCallUserQueue Service Responsibilities:
 * 1. Add user to Redis queue with attribute-based indexing
 * 2. Remove user after match and successful locking
 * 3. Apply various filters to find suitable candidates
 * 4. Implement locking to prevent race conditions
 */
export default class VideoCallUserQueue {
  // Constants
  private static readonly MAX_RETRIES_MULTIPLIER = 5;
  private static readonly VIDEO_CALL_LOCK_PREFIX = "video:call:lock:for:video:call";
  private static readonly ADDING_LOCK_PREFIX = "video:call:user:lock:while:adding";
  private static readonly REMOVING_LOCK_PREFIX = "video:call:user:lock:while:removing";

  /** Normalize attribute for indexing */
  private static normalizeAttr(attr: string | number | null | undefined): string {
    if (attr === null || attr === undefined) return "any";
    return String(attr).trim().toLowerCase() || "any";
  }

  /** Normalize raw Redis hash into UserMetaData */
  private static normalizeObject(rawMeta: Record<string, any>): UserMetaData {
    const meta = Object.fromEntries(Object.entries(rawMeta));
    return {
      country: meta.country || null,
      gender: meta.gender || null,
      age: meta.age ? Number(meta.age) : null
    };
  }

  /** Build Redis key for user metadata */
  private static metadataKey(userId: string): string {
    return `chime-video-user:${userId}`;
  }

  /** Finalize match by locking both users and cleaning them up from Redis */
  private static async finalizeMatch(callerId: string, candidateId: string): Promise<string | null> {
    const isLocked = await redisLock.lockPair(callerId, candidateId, this.VIDEO_CALL_LOCK_PREFIX);
    if (isLocked) {
      try {
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

  /** Calculate age range category */
  private static getAgeRange(age: string): string {
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum)) return "any";
    if (ageNum <= 17) return "underage";
    if (ageNum <= 25) return "18-25";
    if (ageNum <= 40) return "26-40";
    return "40+";
  }


  /** Add a user to Redis waiting pool */
  static async addUser(userId: string, userDetails: UserDetails = {}): Promise<void> {
    if (!userId) throw new Error("addUser: userId is required");
    if (!userDetails) throw new Error("UserDetails required.");

    const isLockedInRemove = await redisLock.isUserAlreadyLocked(userId, this.REMOVING_LOCK_PREFIX);
    if (isLockedInRemove) {
      await redisLock.unlockUser(userId, this.REMOVING_LOCK_PREFIX);
      await RedisLockKeyStore.deleteStoredLockValue(userId, this.REMOVING_LOCK_PREFIX);
    }

    const isUserIsAlreadyLock = redisLock.lockUser(userId, this.ADDING_LOCK_PREFIX);
    if (!isUserIsAlreadyLock) return;

    const metaKey = this.metadataKey(userId);
    const EXPIRY_SECONDS = 30; // Half a minute

    const country = this.normalizeAttr(userDetails.country);
    const gender = this.normalizeAttr(userDetails.gender);
    const age = userDetails.age !== undefined && userDetails.age !== null
      ? String(userDetails.age).trim().toLowerCase()
      : "any";

    const ageRange = this.getAgeRange(age);

    const pipeline = videoClient.multi();

    // Store metadata and expiry
    pipeline.hSet(metaKey, { country, gender, age });
    pipeline.expire(metaKey, EXPIRY_SECONDS);
    pipeline.zAdd("waiting:all", { score: Date.now(), value: userId });

    // Add user to gender-specific queue
    switch (gender) {
      case "male":
        pipeline.zAdd(`waiting:male:user:${gender}:${ageRange}:${country}`, { score: Date.now(), value: userId });
        break;
      case "female":
        pipeline.zAdd(`waiting:female:user:${gender}:${ageRange}:${country}`, { score: Date.now(), value: userId });
        break;
    }



    await pipeline.exec();
  }

  /** Remove user from Redis queue and metadata */
  static async removeUser(userId: string): Promise<void> {
    if (!userId) return;

    const isAddingLocked = await redisLock.isUserAlreadyLocked(userId, this.ADDING_LOCK_PREFIX);
    if (!isAddingLocked) return;

    const isRemovingLocked = await redisLock.lockUser(userId, this.REMOVING_LOCK_PREFIX);
    if (!isRemovingLocked) return;

    const metaKey = this.metadataKey(userId);
    const raw = await videoClient.hGetAll(metaKey);

    if (!raw || Object.keys(raw).length === 0) {
      await videoClient.zRem("waiting:all", userId);
      return;
    }

    const meta = this.normalizeObject(raw);
    const gender = this.normalizeAttr(meta.gender);
    const country = this.normalizeAttr(meta.country);
    const age = this.normalizeAttr(meta.age);
    const ageRange = this.getAgeRange(age);

    const pipeline = videoClient.multi();
    pipeline.zRem("waiting:all", userId);

    switch (gender) {
      case "male":
        pipeline.zRem(`waiting:male:user:${gender}:${ageRange}:${country}`, userId);
        break;
      case "female":
        pipeline.zRem(`waiting:female:user:${gender}:${ageRange}:${country}`, userId);
        break;
    }

    pipeline.del(metaKey);
    await pipeline.exec();
  }

  /** Find opposite gender match based on attributes */
  private static async findOppositeGenderCandidateId(
    gender: string,
    ageRange: string,
    country: string,
    userId: string,
  ): Promise<string | null> {
    let candidates: string[] = [];
    switch (gender) {
      case "male":
        candidates = await videoClient.zRange(`waiting:female:user:female:${ageRange}:${country}`, 0, 1);
        break;
      case "female":
        candidates = await videoClient.zRange(`waiting:male:user:male:${ageRange}:${country}`, 0, 1);
        break;
    }

    if (!candidates || candidates.length <= 0) return null;
    const otherCandidates = candidates.filter(candidate => candidate !== userId);
    return otherCandidates.length > 0 ? otherCandidates[0] : null;
  }

  /** Find the opposite gender with the country based */
  private static async findByCountryAndOppositeGender(gender: string, country: string, userId: string): Promise<string | null> {
    let candidates: string[] = [];
    switch (gender) {
      case "male":
        candidates = await videoClient.zRange(`waiting:female:user:female:*:${country}`, 0, 1);
        break;
      case "female":
        candidates = await videoClient.zRange(`waiting:male:user:male:*:${country}`, 0, 1);
        break;
    }
    if (!candidates || candidates.length <= 0) return null;
    const otherCandidates = candidates.filter(candidate => candidate !== userId);
    return otherCandidates.length > 0 ? otherCandidates[0] : null;
  }

  /** Find the opposite gender with the country based */
  private static async findByCountryAndRelatedGender(gender: string, country: string, userId: string): Promise<string | null> {
    let candidates: string[] = [];
    switch (gender) {
      case "male":
        candidates = await videoClient.zRange(`waiting:male:user:male:*:${country}`, 0, 1);
        break;
      case "female":
        candidates = await videoClient.zRange(`waiting:female:user:female:*:${country}`, 0, 1);
        break;
    }
    if (!candidates || candidates.length <= 0) return null;
    const otherCandidates = candidates.filter(candidate => candidate !== userId);
    return otherCandidates.length > 0 ? otherCandidates[0] : null;
  }


  /** Find same gender match if no opposite match is found */
  private static async findRelatedGenderCandidateId(
    gender: string,
    ageRange: string,
    country: string,
    userId: string,
  ): Promise<string | null> {
    const key = `waiting:${gender}:user:${gender}:${ageRange}:${country}`;
    const candidates = await videoClient.zRange(key, 0, 1);
    if (!candidates || candidates.length === 0) return null;
    const filtered = candidates.filter(candidate => candidate !== userId);
    return filtered.length > 0 ? filtered[0] : null;
  }

  /**
 * 
 * @param {string} param0.callerId - Id of the user who is caller
 * @param {UserMetaData} param0.callerMeta - Meta data of the user who caller
 * @returns {Promise<string | null>} if candidate found return candidate id as string other wise return false
 */
  private static async findFallbackMatch(
    callerId: string,
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
 * 2. Try findByGenderPreference().
 * 3. If null, call findFallbackMatch().
 * 4. If a match is found, return that user ID; otherwise return null.
 */
  static async findMatch(userId: string): Promise<string | null> {
    if (!userId) throw new Error("userId is required");

    // 1) Fetch caller’s metadata
    const rawCaller = await videoClient.hGetAll(this.metadataKey(userId));
    if (!rawCaller || Object.keys(rawCaller).length === 0) {
      return null; // Caller has no metadata
    }

    const callerMeta = this.normalizeObject(rawCaller);
    const { gender, age, country } = callerMeta;
    const ageRange = this.getAgeRange(String(age));
    const normalizedCountry = this.normalizeAttr(country);

    // 2) Try to find a candidate with opposite gender
    let candidateId = await this.findOppositeGenderCandidateId(gender || "any", ageRange, normalizedCountry, userId);

    if (!candidateId) {
      // 3) If not found, try to find related gender match (same gender)
      candidateId = await this.findRelatedGenderCandidateId(gender || "any", ageRange, normalizedCountry, userId);
    }

    if (!candidateId) {
      // 4) If not found by opposite and relatedGender then
      candidateId = await this.findByCountryAndOppositeGender(gender || "any", normalizedCountry, userId);
    }

    if (!candidateId) {
      // 5) If not found try to again find related country and gender
      candidateId = await this.findByCountryAndRelatedGender(gender || "any", normalizedCountry, userId);
    }

    // 6) If still no match, try fallback strategy
    if (!candidateId) {
      candidateId = await this.findFallbackMatch(userId);
    }

    // 7) Finalize match (with locking + clean-up)
    if (candidateId) {
      const finalized = await this.finalizeMatch(userId, candidateId);
      return finalized;
    }

    // 8) Return null if no candidate found
    return null;
  }

}

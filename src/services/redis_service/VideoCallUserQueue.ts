// Import all the necessary dependencies
import { fisherShuffle } from "../../utils/fisherShuffle.js";
import { videoClient } from "../../configs/redis.js";
import { redisLock, RedisLockKeyStore } from "./index.js";
import type { UserDetails, UserMetaData } from "../../types/index.js";

/**
 * VideoCallUserQueue handles matchmaking and user session coordination for video calls.
 *
 * Responsibilities:
 * 1. Add users to Redis queues based on metadata (gender, age, country).
 * 2. Efficiently remove users post-match to prevent stale or duplicate entries.
 * 3. Match users through a layered filter strategy (opposite gender, similar gender, country-based, and fallback).
 * 4. Use Redis-based locking to prevent race conditions during high concurrency.
 */

export default class VideoCallUserQueue {
  // Configuration Constants
  private static readonly MAX_RETRIES_MULTIPLIER = 5;
  private static readonly VIDEO_CALL_LOCK_PREFIX = "video:call:lock:for:video:call";
  private static readonly ADDING_LOCK_PREFIX = "video:call:user:lock:while:adding";
  private static readonly REMOVING_LOCK_PREFIX = "video:call:user:lock:while:removing";

  /** Normalize user attributes for consistent keying and querying */
  private static normalizeAttr(attr: string | number | null | undefined): string {
    if (attr === null || attr === undefined) return "any";
    return String(attr).trim().toLowerCase() || "any";
  }

  /** Convert raw Redis hash to structured UserMetaData */
  private static normalizeObject(rawMeta: Record<string, any>): UserMetaData {
    const meta = Object.fromEntries(Object.entries(rawMeta));
    return {
      country: meta.country || null,
      gender: meta.gender || null,
      age: meta.age ? Number(meta.age) : null,
    };
  }

  /** Return the Redis key for storing a user's metadata */
  private static metadataKey(userId: string): string {
    return `chime-video-user:${userId}`;
  }

  /** Finalizes a successful match by acquiring locks, removing both users from queues, and cleaning lock states */
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
      } catch {
        return null;
      }
      return candidateId;
    }
    return null;
  }

  /** Maps numeric age to a predefined age range group for targeted matchmaking */
  private static getAgeRange(age: string): string {
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum)) return "any";
    if (ageNum <= 17) return "underage";
    if (ageNum <= 25) return "18-25";
    if (ageNum <= 40) return "26-40";
    return "40+";
  }

  /** Adds a user to various Redis queues for matchmaking, indexed by gender, age, and country */
  static async addUser(userId: string, userDetails: UserDetails = {}): Promise<void> {
    if (!userId) throw new Error("addUser: userId is required");
    if (!userDetails) throw new Error("UserDetails required.");

    // Clear existing removal lock if found
    const isLockedInRemove = await redisLock.isUserAlreadyLocked(userId, this.REMOVING_LOCK_PREFIX);
    if (isLockedInRemove) {
      await redisLock.unlockUser(userId, this.REMOVING_LOCK_PREFIX);
      await RedisLockKeyStore.deleteStoredLockValue(userId, this.REMOVING_LOCK_PREFIX);
    }

    // Prevent concurrent additions
    const isUserIsAlreadyLock = redisLock.lockUser(userId, this.ADDING_LOCK_PREFIX);
    if (!isUserIsAlreadyLock) return;

    const metaKey = this.metadataKey(userId);
    const EXPIRY_SECONDS = 30; // Entry TTL to prevent orphaned sessions

    // Normalize and extract fields
    const country = this.normalizeAttr(userDetails.country) || "any";
    const gender = this.normalizeAttr(userDetails.gender) || "any";
    const age = userDetails.age !== undefined && userDetails.age !== null
      ? String(userDetails.age).trim().toLowerCase()
      : "any";

    const ageRange = this.getAgeRange(age);

    // Pipeline multiple Redis commands for performance
    const pipeline = videoClient.multi();
    pipeline.hSet(metaKey, { country, gender, age });
    pipeline.expire(metaKey, EXPIRY_SECONDS);
    pipeline.zAdd("waiting:all", { score: Date.now(), value: userId });

    // Index into gender-specific pools
    switch (gender) {
      case "male":
        pipeline.zAdd(`waiting:male:user:${gender}:${ageRange}:${country}`, { score: Date.now(), value: userId });
        break;
      case "female":
        pipeline.zAdd(`waiting:female:user:${gender}:${ageRange}:${country}`, { score: Date.now(), value: userId });
        break;
      case "other":
        pipeline.zAdd(`waiting:other:user:${gender}:${ageRange}:${country}`, { score: Date.now(), value: userId });
        break;
    }

    await pipeline.exec();
  }

  /** Remove a user from all matchmaking queues and clear their metadata */
  static async removeUser(userId: string): Promise<void> {
    if (!userId) return;

    // Ensure this user was previously locked for adding
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

    // Remove from all gender-specific queues
    switch (gender) {
      case "male":
        pipeline.zRem(`waiting:male:user:${gender}:${ageRange}:${country}`, userId);
        break;
      case "female":
        pipeline.zRem(`waiting:female:user:${gender}:${ageRange}:${country}`, userId);
        break;
      case "other":
        pipeline.zRem(`waiting:other:user:${gender}:${ageRange}:${country}`, userId);
        break;
    }

    pipeline.del(metaKey);
    await pipeline.exec();
  }

  /** Try to find a match from the opposite gender pool with the same age range and country */
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
      case "other":
        candidates = await videoClient.zRange(`waiting:male:user:male:${ageRange}:${country}`, 0, 1);
    }

    if (!candidates || candidates.length === 0) return null;
    const otherCandidates = candidates.filter((id: string) => id !== userId);
    return otherCandidates.length > 0 ? otherCandidates[0] : null;
  }

  /** Try to find a match from opposite gender pool by country if previous method fails */
  private static async findByCountryAndOppositeGenderWithAnyAgeRange(
    gender: string,
    country: string,
    userId: string,
  ): Promise<string | null> {
    let candidates: string[] = [];
    switch (gender) {
      case "male":
        candidates = await videoClient.zRange(`waiting:female:user:female:*:${country}`, 0, 1);
        break;
      case "female":
        candidates = await videoClient.zRange(`waiting:male:user:male:*:${country}`, 0, 1);
        break;
      case "other":
        candidates = await videoClient.zRange(`waiting:male:user:male:*:${country}`, 0, 1);
    }

    if (!candidates || candidates.length === 0) return null;
    const filtered = candidates.filter((id: string) => id !== userId);
    return filtered.length > 0 ? filtered[0] : null;
  }

  /** Try to find a match from the same gender and country (used when opposite gender fails) */
  private static async findByCountryAndRelatedGenderWithAnyRange(
    gender: string,
    country: string,
    userId: string,
  ): Promise<string | null> {
    let candidates: string[] = [];
    switch (gender) {
      case "male":
        candidates = await videoClient.zRange(`waiting:male:user:male:*:${country}`, 0, 1);
        break;
      case "female":
        candidates = await videoClient.zRange(`waiting:female:user:female:*:${country}`, 0, 1);
        break;
      case "other":
        candidates = await videoClient.zRange(`waiting:male:user:other:*:${country}`, 0, 1);
    }

    if (!candidates || candidates.length === 0) return null;
    const filtered = candidates.filter((id: string) => id !== userId);
    return filtered.length > 0 ? filtered[0] : null;
  }

  /** Try to find a match from the same gender, age, and country */
  private static async findRelatedGenderCandidateId(
    gender: string,
    ageRange: string,
    country: string,
    userId: string,
  ): Promise<string | null> {
    const key = `waiting:${gender}:user:${gender}:${ageRange}:${country}`;
    const candidates = await videoClient.zRange(key, 0, 1);
    if (!candidates || candidates.length === 0) return null;
    const filtered = candidates.filter((id: string) => id !== userId);
    return filtered.length > 0 ? filtered[0] : null;
  }

  /** As a last resort, fallback to random match from global pool (ignores all filters) */
  private static async findFallbackMatch(callerId: string): Promise<string | null> {
    const fallbackSet = "waiting:all";
    const pageSize = 10;

    for (let attempt = 0; attempt < this.MAX_RETRIES_MULTIPLIER; attempt++) {
      const startIndex = attempt * pageSize;
      const endIndex = startIndex + pageSize - 1;

      const result = await videoClient.sendCommand([
        "ZRANGE", fallbackSet, startIndex.toString(), endIndex.toString(), "WITHSCORES",
      ]);

      if (!Array.isArray(result) || result.length === 0) break;

      const entries = [];
      for (let i = 0; i < result.length; i += 2) {
        entries.push({ userId: result[i], score: parseInt(result[i + 1]) });
      }

      fisherShuffle(entries);

      for (const { userId } of entries) {
        if (userId !== callerId) return userId;
      }
    }

    return null;
  }

  /**
   * Main matchmaking entry point.
   * Steps:
   * 1. Extract caller's metadata.
   * 2. Try opposite gender match.
   * 3. Try same gender match.
   * 4. Try country-based filters.
   * 5. Try fallback strategy.
   * 6. If match found, finalize session.
   */
  static async findMatch(userId: string): Promise<string | null> {
    if (!userId) throw new Error("userId is required");

    const rawCaller = await videoClient.hGetAll(this.metadataKey(userId));
    if (!rawCaller || Object.keys(rawCaller).length === 0) return null;

    const callerMeta = this.normalizeObject(rawCaller);
    const { gender, age, country } = callerMeta;
    const ageRange = this.getAgeRange(String(age));
    const normalizedCountry = this.normalizeAttr(country);


    // First the algorithm try to find the candidate from the same country within the same age range but the gender is opposite if the gender is male then goes to find the female 
    // If the gender is female then male.
    let candidateId = await this.findOppositeGenderCandidateId(gender || "any", ageRange, normalizedCountry, userId);

    if (!candidateId) {
      // If not found then again try to find from the same the same country , same age range and same gender
      candidateId = await this.findRelatedGenderCandidateId(gender || "any", ageRange, normalizedCountry, userId);
    }

    if (!candidateId) {
      // If  not found then again try to find from the same country and opposite gender and with any age-range
      candidateId = await this.findByCountryAndOppositeGenderWithAnyAgeRange(gender || "any", normalizedCountry, userId);
    }

    if (!candidateId) {
      // If not found till then again try to find by same country, same gender and any age range
      candidateId = await this.findByCountryAndRelatedGenderWithAnyRange(gender || "any", normalizedCountry, userId);
    }

    if (!candidateId) {
      // if not found till now this is the last second last state of the algorithm so try to find the candidate from the findFallback queue [@note if there are users in the queue then this method should 100% find the candidate]
      candidateId = await this.findFallbackMatch(userId);
    }

    if (candidateId) {
      // Always finalized the match because this is helps to lock the user and also  check the candidate is locked by some one or not which helps from the rance-condition 
      // Basically this is the lock system made by myself using the redis which only works on this server only
      const finalized = await this.finalizeMatch(userId, candidateId);
      return finalized;
    }

    return null;
  }
}

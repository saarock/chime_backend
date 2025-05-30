import { client } from "../../configs/redis.js";

export interface Filters {
  country?: string | null;
  gender?: string | null;
  age?: string | null;
}

export interface UserDetails {
  country?: string | null;
  gender?: string | null;
  age?: string | null;
}


/**
 * Utility class to manage video call user matching with Redis.
 * Supports optional filters: country, gender, age.
 */
export default class VideoCallUserQueue {
  private static metadataKey(userId: string) {
    // Unique prefix for metadata hashes
    return `chime-video-user:${userId}`;
  }

  /**
   * Add a user to the waiting queue with optional filters.
   * Handles cases where filters are undefined or null.
   * @param userId - Unique identifier for the user.
   * @param filters - Optional filter criteria.
   */
  static async addUser(
    userId: string,
    filters: Filters = {},
    userDetails: UserDetails = {}
  ): Promise<void> {
    if (!userId) throw new Error("addUser: userId is required");

    const metaKey = this.metadataKey(userId);

    // Save userDetails always to perform better delete operation at the future
    await client.hSet(metaKey, {
      country: userDetails.country ?? "none",
      gender: userDetails.gender ?? "none",
      age: userDetails.age ?? "none",
    });

    // Determine filters to use for queue placement
    const country = filters.country ?? null;
    const gender = filters.gender ?? null;
    const age = filters.age ?? null;

    const setsToAdd: string[] = [];

    if (country) setsToAdd.push(`waiting:country:${country}`);
    if (gender) setsToAdd.push(`waiting:gender:${gender}`);
    if (age) setsToAdd.push(`waiting:age:${age}`);

    // Core Logic: If no filters are passed → use general queue
    if (setsToAdd.length === 0) {
      await client.sAdd("waiting:all", userId);
    } else {
      for (const key of setsToAdd) {
        await client.sAdd(key, userId);
      }
    }
  }


  /**
   * Remove a user from all waiting queues and delete metadata.
   * @param userId - Unique identifier for the user.
   */
  static async removeUser(userId: string): Promise<void> {
    if (!userId) return;

    // Always attempt to remove from the general queue
    await client.sRem("waiting:all", userId);

    const metaKey = this.metadataKey(userId);
    // Retrieve stored metadata
    const userData = await client.hGetAll(metaKey);
    if (!userData || Object.keys(userData).length === 0) {
      await client.del(metaKey); // Clean up completely key
      return;
    }

    // Clean up specific filter sets based on metadata
    if (userData.country && userData.country !== "none") {
      await client.sRem(`waiting:country:${userData.country}`, userId);
    }
    if (userData.gender && userData.gender !== "none") {
      await client.sRem(`waiting:gender:${userData.gender}`, userId);
    }
    if (userData.age && userData.age !== "none") {
      await client.sRem(`waiting:age:${userData.age}`, userId);
    }

    // Delete the metadata hash
    await client.del(metaKey);
  }

  /**
   * Find a matching user based on optional filters.
   * Returns the matched userId, or null if no match found.
   * @param userId - Excluding this user from the match.
   * @param filters - Optional filter criteria.
   */
  static async findMatch(
    userId: string,
    filters: Filters = {},
  ): Promise<string | null> {
    // Normalize filters
    const country = filters.country ?? null;
    const gender = filters.gender ?? null;
    const age = filters.age ?? null;

    const setsToCheck: string[] = [];
    if (country) setsToCheck.push(`waiting:country:${country}`);
    if (gender) setsToCheck.push(`waiting:gender:${gender}`);
    if (age) setsToCheck.push(`waiting:age:${age}`);

    let matchedUserId: string | null = null;
    // Remove self from any queue before matching
    await this.removeUser(userId);

    if (setsToCheck.length === 0) {
      // No filters: pop from general queue
      matchedUserId = await client.sPop("waiting:all");
    } else if (setsToCheck.length === 1) {
      // Single filter: pop from that specific set
      matchedUserId = await client.sPop(setsToCheck[0]);
    } else if (setsToCheck.length > 1) {
      // Multiple filters: find intersection
      const candidates = await client.sInter(setsToCheck);
      if (candidates?.length) {
        matchedUserId = candidates[0];
        // Remove the matched user from each filter set
        for (const key of setsToCheck) {
          await client.sRem(key, matchedUserId);
        }
      }
    } else {
      // If no user found to the corresponding filter then pop the user from the waiting:all
      matchedUserId = await client.sPop("waiting:all");
    }

    // If matched, clean up their metadata too
    if (matchedUserId) {
      await client.del(this.metadataKey(matchedUserId));
    }

    return matchedUserId;
  }
}

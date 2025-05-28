import type { DefaultEventsMap, Socket } from "socket.io";
import { client } from "../../configs/redis.js";

class VideoCallSocketByUserQueue {
  private static redisKey = "videoSocket:users"; // Redis SET of online user IDs

  /**
   * Store the socket ID and add user ID to set of active users.
   */
  public async set(
    userId: string,
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap>,
  ): Promise<void> {
    await Promise.all([
      client.set(`videoSocket:${userId}`, socket.id),
      client.sAdd(VideoCallSocketByUserQueue.redisKey, userId),
    ]);
  }

  /**
   * Retrieve the socket ID for a user.
   */
  public async get(userId: string): Promise<string | null> {
    return await client.get(`videoSocket:${userId}`);
  }

  /**
   * Same as set in this case.
   */
  public async update(
    userId: string,
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap>,
  ): Promise<void> {
    await this.set(userId, socket);
  }

  /**
   * Remove socket ID and user from online set.
   */
  public async delete(userId: string): Promise<void> {
    await Promise.all([
      client.del(`videoSocket:${userId}`),
      client.sRem(VideoCallSocketByUserQueue.redisKey, userId),
    ]);
  }

  /**
   * Get total number of online users.
   */
  public async count(): Promise<number> {
    return await client.sCard(VideoCallSocketByUserQueue.redisKey);
  }

  /**
   * Get all user IDs who are currently online.
   */
  public async getAllOnlineUserIds(): Promise<string[]> {
    return await client.sMembers(VideoCallSocketByUserQueue.redisKey);
  }
}

export default VideoCallSocketByUserQueue;

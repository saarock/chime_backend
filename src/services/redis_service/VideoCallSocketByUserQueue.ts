import type { DefaultEventsMap, Socket } from "socket.io";
import { videoClient } from "../../configs/redis.js";


/**
 * This class is responsible to handle the currently online users
 */
class VideoCallSocketByUserQueue {
  private static redisKey = "videoSocket:users"; // Redis SET of online user IDs

  /**
   * Store the socket ID and add user ID to set of active users.
   */
  public async set(
    userId: string,
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap>
  ): Promise<void> {
    // Check and delete invalid key if necessary
    const keyType = await videoClient.type(VideoCallSocketByUserQueue.redisKey);
    if (keyType !== "set" && keyType !== "none") {
      console.warn(
        `❗ Redis key "${VideoCallSocketByUserQueue.redisKey}" is type "${keyType}", deleting it...`
      );
      await videoClient.del(VideoCallSocketByUserQueue.redisKey);
    }

    // Delete the old socket
    await this.delete(userId);
    const pipline = videoClient.multi();
    pipline.set(`videoSocket:${userId}`, socket.id, { EX: 3600 });
    pipline.sAdd(VideoCallSocketByUserQueue.redisKey, userId);
    pipline.expire(VideoCallSocketByUserQueue.redisKey, 3600);
    await pipline.exec();
  }

  /**
   * Retrieve the socket ID for a user.
   */
  public async get(userId: string): Promise<string | null> {
    return await videoClient.get(`videoSocket:${userId}`);
  }

  /**
   * Same as set in this case.
   */
  public async update(
    userId: string,
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap>
  ): Promise<void> {
    await this.set(userId, socket);
  }

  /**
   * Remove socket ID and user from online set.
   */
  public async delete(userId: string): Promise<void> {
    const pipline = videoClient.multi();
    pipline.del(`videoSocket:${userId}`);
    pipline.sRem(VideoCallSocketByUserQueue.redisKey, userId);
    await pipline.exec();
  }

  /**
   * Get total number of online users.
   */
  public async count(): Promise<number> {
    return await videoClient.sCard(VideoCallSocketByUserQueue.redisKey);
  }

  /**
   * Get all user IDs who are currently online.
   */
  public async getAllOnlineUserIds(): Promise<string[]> {
    return await videoClient.sMembers(VideoCallSocketByUserQueue.redisKey);
  }
}

export default VideoCallSocketByUserQueue;

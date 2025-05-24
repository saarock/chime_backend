import type { DefaultEventsMap, Socket } from "socket.io";
import { client } from "../../configs/redis.js";

class VideoCallSocketByUserQueue {
    /**
     * Store the socket ID under a Redis key.
     */
    public async set(
        userId: string,
        socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap>
    ): Promise<void> {
        await client.set(`videoSocket:${userId}`, socket.id);
    }

    /**
     * Retrieve and delete the socket ID for a user.
     * Returns the socket ID string or null if not found.
     */
    public async get(userId: string): Promise<string | null> {
        const socketId = await client.get(`videoSocket:${userId}`);
        if (!socketId) {
            return null;
        }
        return socketId;
    }

    /**
     * Update is really the same as set for this use‑case.
     */
    public async update(
        userId: string,
        socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap>
    ): Promise<void> {
        await client.set(`videoSocket:${userId}`, socket.id);
    }

    /**
     * Delete the stored socket ID.
     */
    public async delete(userId: string): Promise<void> {
        await client.del(`videoSocket:${userId}`);
    }
}

export default VideoCallSocketByUserQueue;

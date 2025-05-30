// Import all the necessary dependencies here
import VideoCallUserQueue from "../../services/redis_service/VideoCallUserQueue.js";
import { socketAuthMiddleware } from "../../middlewares/index.js";
import { Namespace, Socket, type DefaultEventsMap } from "socket.io";
import VideoCallSocketByUserQueue from "../../services/redis_service/VideoCallSocketByUserQueue.js";
import ActiveCallRedisMap from "../../services/redis_service/ActiveCallRedisMap.js";

/**
 * VideoSocket manages WebSocket connections for random video calling.
 * It handles:
 * - User authentication via middleware
 * - Tracking online sockets per user
 * - Queueing and matching users via Redis
 * - Signaling for WebRTC (offer/answer/ICE)
 * - Active call state and cleanup
 */
class VideoSocket {
  private _io: Namespace;
  // Map of userId -> socketId in Redis, to find sockets by userId
  private socketsByUser = new VideoCallSocketByUserQueue();
  // Map of active calls: callerId -> calleeId, stored in Redis
  private activeCalls = new ActiveCallRedisMap();

  constructor(io: Namespace) {
    this._io = io;

    // Apply authentication middleware before establishing connection
    this._io.use(socketAuthMiddleware);

    // Listen for incoming socket connections
    this._io.on("connection", this.handleConnection.bind(this));
  }

  /**
   * Attempt to queue and match a random user based on filters.
   * @param socket - current client socket
   * @param userId - authenticated user ID
   * @param filters - optional filter criteria for matching
   * @param userDetails - optional user details stored for cleanup
   */
  private async findRandomUser(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap>,
    userId: string,
    filters = {},
    userDetails = {}
  ) {
    // Add current user to waiting queue with filters
    await VideoCallUserQueue.addUser(userId, filters, userDetails);

    // Try to find another waiting user matching the filters
    const matchUserId = await VideoCallUserQueue.findMatch(userId, filters);

    if (matchUserId) {
      // If matched to self (only one user in queue), re-enqueue and notify
      if (userId === matchUserId) {
        await VideoCallUserQueue.addUser(userId, filters, userDetails);
        socket.emit("self-loop");
        return;
      }

      // Remove both users from their queues now that they are matched
      await VideoCallUserQueue.removeUser(userId);
      await VideoCallUserQueue.removeUser(matchUserId);

      // Look up the partner's socket ID
      const partnerSocketId = await this.socketsByUser.get(matchUserId);
      if (!partnerSocketId) {
        socket.emit("user:not-found");
        return;
      }

      const partnerSocket = this._io.sockets.get(partnerSocketId);
      if (partnerSocket) {
        // Notify caller and callee of the match
        socket.emit("user:match-found", { partnerId: matchUserId, isCaller: true });
        partnerSocket.emit("user:match-found", { partnerId: userId, isCaller: false });
        // Persist active call mapping in Redis
        await this.activeCalls.setCall(userId, matchUserId);
      } else {
        socket.emit("user:not-found", { message: "Partner is not available, try again..." });
      }
    } else {
      // No match yet; keep user waiting and notify
      await VideoCallUserQueue.addUser(userId, filters, userDetails);
      socket.emit("wait");
    }
  }

  /**
   * Ensures only one active socket per user. Disconnects old socket if reconnected.
   * @param userId - ID of the user to enforce single connection
   */
  private async disconnectPreviousIfExists(userId: string): Promise<void> {
    const prevSocketId = await this.socketsByUser.get(userId);
    if (!prevSocketId) return;

    const prevSocket = this._io.sockets.get(prevSocketId);
    if (prevSocket) {
      // Notify and disconnect the old socket
      prevSocket.emit("duplicate:connection", {
        message: "You were disconnected because your account logged in elsewhere. Please reload the page to reconnect.",
      });
      prevSocket.disconnect(true);
    }

    // Remove old socket reference from Redis
    await this.socketsByUser.delete(userId);
  }

  /**
   * Handles a newly connected socket: sets up event listeners and state.
   * @param socket - the connected client socket
   */
  private async handleConnection(socket: Socket) {
    const userId = socket.data.user._id;

    // Enforce single connection per user
    await this.disconnectPreviousIfExists(userId);
    // Cache this socket in Redis for lookups
    await this.socketsByUser.set(userId, socket);

    // Handle random video call initiation
    socket.on("start:random-video-call", async ({ filters, userDetails }) => {
      try {
        await this.findRandomUser(socket, userId, filters, userDetails);
      } catch (error) {
        socket.emit("video:global:error", { message: error instanceof Error ? error.message : "Unexpected error finding match." });
      }
    });

    // Broadcast online user count on request
    socket.on("onlineUsersCount", async () => {
      const count = await this.getOnlineUserCountSomehow();
      socket.emit("onlineUsersCount", { count });
    });

    // WebRTC signaling: call offer
    socket.on("call-user", async ({ to, offer }) => {
      try {
        const targetId = await this.socketsByUser.get(to);
        if (!targetId) return socket.emit("call-error", { message: "User not available." });

        const targetSocket = this._io.sockets.get(targetId);
        if (!targetSocket) return socket.emit("call-error", { message: "User not available." });

        targetSocket.emit("receive-call", { offer, from: userId });
      } catch (error) {
        socket.emit("video:global:error", { message: error instanceof Error ? error.message : "Error during call offer." });
      }
    });

    // WebRTC signaling: call answer
    socket.on("call-accepted", async ({ to, answer }) => {
      try {
        const callerId = await this.socketsByUser.get(to);
        if (!callerId) return socket.emit("call-error", { message: "User not available." });

        const callerSocket = this._io.sockets.get(callerId);
        callerSocket?.emit("call-accepted", { from: userId, answer });
      } catch (error) {
        socket.emit("video:global:error", { message: error instanceof Error ? error.message : "Error during call answer." });
      }
    });

    // WebRTC signaling: ICE candidate forwarding
    socket.on("ice-candidate", async ({ to, candidate }) => {
      try {
        const targetId = await this.socketsByUser.get(to);
        const targetSocket = this._io.sockets.get(targetId!);
        targetSocket?.emit("ice-candidate", { candidate });
      } catch (error) {
        socket.emit("video:global:error", { message: error instanceof Error ? error.message : "Error forwarding ICE candidate." });
      }
    });

    // Handle user-initiated call end
    socket.on("end-call", async ({ partnerId }) => {
      try {
        // Remove both parties from queues
        await VideoCallUserQueue.removeUser(userId);
        if (partnerId) {
          await this.activeCalls.deleteCall(userId, partnerId);
          await VideoCallUserQueue.removeUser(partnerId);

          const partnerSocketId = await this.socketsByUser.get(partnerId);
          const partnerSocket = this._io.sockets.get(partnerSocketId!);
          partnerSocket?.emit("user:call-ended", { isEnder: false });
          socket.emit("user:call-ended", { isEnder: true });
        }
      } catch (error) {
        socket.emit("video:global:error", { message: error instanceof Error ? error.message : "Error ending call." });
      }
    });

    // Handle request to end current call and retry matching
    socket.on("go:and:tell:callee:call:ended:so:you:can:try:for:others", async ({ partnerId }) => {
      try {
        if (partnerId) {
          await VideoCallUserQueue.removeUser(partnerId);
          await VideoCallUserQueue.removeUser(userId);
          await this.activeCalls.deleteCall(userId, partnerId);

          const partnerSocketId = await this.socketsByUser.get(partnerId);
          const partnerSocket = this._io.sockets.get(partnerSocketId!);
          socket.emit("user:call-ended:try:for:other", { isEnder: true });
          partnerSocket?.emit("user:call-ended:try:for:other", { isEnder: false });
        }
      } catch (error) {
        socket.emit("video:global:error", { message: error instanceof Error ? error.message : "Error retrying match." });
      }
    });

    // Clean up on socket disconnect
    socket.on("disconnect", async (reason) => {
      try {
        // Remove socket mapping and queue entry
        await this.socketsByUser.delete(userId);
        VideoCallUserQueue.removeUser(userId).catch(() => { });

        // Notify partner if in an active call
        const partnerId = await this.activeCalls.getPartner(userId);
        if (partnerId) {
          const partnerSocketId = await this.socketsByUser.get(partnerId);
          const partnerSocket = this._io.sockets.get(partnerSocketId!);
          partnerSocket?.emit("user:call-ended", { isEnder: false });
          await this.activeCalls.deleteCall(partnerId, userId);
        }

        // Broadcast updated online user count
        const count = await this.getOnlineUserCountSomehow();
        socket.broadcast.emit("onlineUsersCount", { count });
        socket.emit("onlineUsersCount", { count });
      } catch (error) {
        socket.emit("video:global:error", { message: error instanceof Error ? error.message : "Error during disconnect cleanup." });
      }
    });
  }

  /**
   * Helper to get a count of currently online users from Redis map
   */
  private async getOnlineUserCountSomehow() {
    return await this.socketsByUser.count();
  }
}

export default VideoSocket;

// Import all the necessary dependencies here
import VideoCallUserQueue from "../../services/redis_service/VideoCallUserQueue.js";
import { socketAuthMiddleware } from "../../middlewares/index.js";
import { Namespace, Socket, type DefaultEventsMap } from "socket.io";
import VideoCallSocketByUserQueue from "../../services/redis_service/VideoCallSocketByUserQueue.js";
import { ActiveCallRedisMap } from "../../services/redis_service/index.js";
import { sendMessage } from "../../kafka/producer.js";
import type { Filters, UserDetails } from "../../types/index.js";

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

  private async matchFinalize(callerId: string, calleeId: string) {
    await sendMessage("match-user", {
      callerId,
      calleeId,
      isCaller: true,
    });
  }

  /**
   * Attempt to queue and match a random user based on filters and @note this function is not responsible to connect to use
   *
   * @param socket - current client socket
   * @param userId - authenticated user ID
   * @param filters - optional filter criteria for matching
   * @param userDetails - optional user details stored for cleanup
   */
  private async findRandomUser(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap>,
    userId: string,
    userDetails: UserDetails,
  ) {
    const isUserBusy = await this.activeCalls.getPartner(userId);

    if (isUserBusy) {
      // If the caller [Self] is busy in  the call  save error and do nothing
      const errorLogs = {
        where: "findRandomUser",
        message: "user is busy",
        userId: userId,
      };
      await sendMessage("error-logs", errorLogs);
      return;
    }

    // Add current user to waiting queue with filters
    await VideoCallUserQueue.addUser(userId, userDetails);

    // Try to find another waiting user matching the filters
    const matchUserId = await VideoCallUserQueue.findMatch(userId);

    if (matchUserId) {
      const isPartnerIsBusy = await this.activeCalls.getPartner(matchUserId);

      // Check the user id already busy or not
      if (isPartnerIsBusy) {
        // If callee is in the call the send the event match-busy so caller can try others
        // // Don't proceed, re-add the searching user and try again later
        // socket.emit("match-busy");
        // await VideoCallUserQueue.addUser(userId, filters, userDetails);
        const errorLogs = {
          where: "at findRandomUser",
          message: "partner is busy",
          userId: userId,
        };
        await sendMessage("error-logs", errorLogs);
        return;
      }

      // If matched to self (only one user in queue), re-enqueue and notify
      if (userId === matchUserId) {
        await VideoCallUserQueue.addUser(userId, userDetails);
        socket.emit("self-loop");
        const errorLogs = {
          where: "at findRandomUser",
          message: "self-loop",
          userId: userId,
        };
        await sendMessage("error-logs", errorLogs);
        return;
      }

      // if actual match then
      await this.matchFinalize(userId, matchUserId);
    } else {
      // Before waiting first cleanup the user datas
      await VideoCallUserQueue.removeUser(userId);
      // No match yet; keep user waiting and notify
      await VideoCallUserQueue.addUser(userId, userDetails);
      socket.emit("wait"); // Send the wait event to the client
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
        message:
          "You were disconnected because your account logged in elsewhere. Please reload the page to reconnect.",
      });
      const errorLogs = {
        where: "at videoSocket disconnectPreviousIfExist method",
        message: "duplicate:connection",
        userId: userId,
      };
      await sendMessage("error-logs", errorLogs);
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
    console.log("new user connected to the video-socket");

    const userId = socket.data.user._id;

    // At the start of handleConnection:
    await this.disconnectPreviousIfExists(userId);

    // Cache this socket in Redis for lookups
    await this.socketsByUser.set(userId, socket);

    // Handle random video call initiation
    socket.on("start:random-video-call", async ({ userDetails }) => {
      try {
        const isInCall = await this.activeCalls.getPartner(userId);
        if (isInCall) return;
        await this.findRandomUser(socket, userId, userDetails);
      } catch (error) {
        socket.emit("video:global:error", {
          message:
            error instanceof Error
              ? error.message
              : "Unexpected error finding match.",
        });
        const errorLogs = {
          where: "start:random-video-call",
          message:
            error instanceof Error ? error.message : "Something went wrong",
          userId: userId,
        };
        await sendMessage("error-logs", errorLogs);
      }
    });

    // Broadcast online user count on request
    socket.on("onlineUsersCount", async () => {
      const count = await this.getOnlineUserCountSomehow();
      socket.emit("onlineUsersCount", { count });
      socket.broadcast.emit("onlineUsersCount", { count });
    });

    // WebRTC signaling: call offer
    socket.on("call-user", async ({ to, offer }) => {
      try {
        const targetId = await this.socketsByUser.get(to);

        if (!targetId) {
          socket.emit("call-error", { message: "User not available." });
          const errorLogs = {
            where: "call-user",
            message: "User not available.",
            userId: userId,
          };
          await sendMessage("error-logs", errorLogs);
          return;
        }

        const targetSocket = this._io.sockets.get(targetId);
        if (!targetSocket)
          return socket.emit("call-error", { message: "User not available." });

        targetSocket.emit("receive-call", {
          offer,
          from: userId,
          isCaller: false,
        });
      } catch (error) {
        socket.emit("video:global:error", {
          message:
            error instanceof Error ? error.message : "Error during call offer.",
        });
        const errorLogs = {
          where: "call-user",
          message:
            error instanceof Error ? error.message : "Something went wrong",
          userId: userId,
        };
        await sendMessage("error-logs", errorLogs);
      }
    });

    // WebRTC signaling: call answer
    socket.on("call-accepted", async ({ to, answer }) => {
      try {
        await this.activeCalls.setCall(userId, to);
        const callerId = await this.socketsByUser.get(to);
        if (!callerId)
          return socket.emit("call-error", { message: "User not available." });

        const callerSocket = this._io.sockets.get(callerId);
        if (!callerSocket)
          return socket.emit("call-error", {
            message: "User is not online or active try others",
          });
        callerSocket?.emit("call-accepted", { from: userId, answer });
        // Send the global message to the caller when the call acceptted
        callerSocket?.emit("global:success:message", {
          message: `Connected to the ${socket.data.user.fullName}`,
        });
        socket.emit("global:success:message", {
          message: `Connected to the ${callerSocket?.data.user.fullName}`,
        });
      } catch (error) {
        socket.emit("video:global:error", {
          message:
            error instanceof Error
              ? error.message
              : "Error during call answer.",
        });
        const errorLogs = {
          where: "call-accepted",
          message:
            error instanceof Error ? error.message : "Something went wrong",
          userId: userId,
        };
        await sendMessage("error-logs", errorLogs);
      }
    });

    // WebRTC signaling: ICE candidate forwarding
    socket.on("ice-candidate", async ({ to, candidate }) => {
      try {
        const targetId = await this.socketsByUser.get(to);
        const targetSocket = this._io.sockets.get(targetId!);
        targetSocket?.emit("ice-candidate", { candidate });
      } catch (error) {
        socket.emit("video:global:error", {
          message:
            error instanceof Error
              ? error.message
              : "Error forwarding ICE candidate.",
        });
        const errorLogs = {
          where: "ice-candidate",
          message:
            error instanceof Error ? error.message : "Something went wrong",
          userId: userId,
        };
        await sendMessage("error-logs", errorLogs);
      }
    });

    // Handle user-initiated call end
    socket.on("end-call", async ({ partnerId }) => {
      try {
        if (partnerId) {
          const userCallLog = await this.activeCalls.deleteCall(
            partnerId,
            userId,
          );
          await sendMessage("video-end", userCallLog);
          const partnerSocketId = await this.socketsByUser.get(partnerId);
          const partnerSocket = this._io.sockets.get(partnerSocketId!);
          partnerSocket?.emit("user:call-ended", { isEnder: false });
          socket.emit("user:call-ended", { isEnder: true });
          return;
        }

        await VideoCallUserQueue.removeUser(userId); // Remove the userQueued datas
      } catch (error) {
        socket.emit("video:global:error", {
          message:
            error instanceof Error ? error.message : "Error ending call.",
        });
        const errorLogs = {
          where: "end-call",
          message:
            error instanceof Error ? error.message : "Something went wrong",
          userId: userId,
        };
        await sendMessage("error-logs", errorLogs);
      }
    });

    // Handle request to end current call and retry matching
    socket.on(
      "go:and:tell:callee:call:ended:so:you:can:try:for:others",
      async ({ partnerId }) => {
        try {
          if (partnerId && userId) {
            // Remove the caller and callee from the meta data queue
            await VideoCallUserQueue.removeUser(userId);
            await VideoCallUserQueue.removeUser(partnerId);

            const userCallLog = await this.activeCalls.deleteCall(
              partnerId,
              userId,
            );
            await sendMessage("video-end", userCallLog);

            const partnerSocketId = await this.socketsByUser.get(partnerId);
            if (!partnerSocketId) {
              throw new Error(
                "No partner Socket id found in go:and:tell:callee",
              );
            }
            const partnerSocket = this._io.sockets.get(partnerSocketId);
            partnerSocket?.emit("user:call-ended:try:for:other", {
              isEnder: false,
            });
            socket.emit("user:call-ended:try:for:other", { isEnder: true });
          }
        } catch (error) {
          socket.emit("video:global:error", {
            message:
              error instanceof Error ? error.message : "Error retrying match.",
          });
          const errorLogs = {
            where:
              "At go:and:tell:callee:call:ended:so:you:can:try:for:others disconnect",
            message:
              error instanceof Error ? error.message : "Something went wrong",
            userId: userId,
          };
          await sendMessage("error-logs", errorLogs);
        }
      },
    );

    // Clean up on socket disconnect
    socket.on("disconnect", async (reason) => {
      try {
        // Remove socket mapping and queue entry
        await this.socketsByUser.delete(userId);
        if (!userId) {
          console.log("no user Id");
          socket.emit("video:global:error", {
            message: "pleased refresh your page and try again.",
          });

          const errorLogs = {
            where: "At socket disconnect",
            message: "userId not found",
            userId: userId,
          };
          await sendMessage("error-logs", errorLogs);

          return;
        }

        await VideoCallUserQueue.removeUser(userId);

        // Notify partner if in an active call
        const partnerId = await this.activeCalls.getPartner(userId);

        if (partnerId) {
          await VideoCallUserQueue.removeUser(partnerId);
          const partnerSocketId = await this.socketsByUser.get(partnerId);
          const partnerSocket = this._io.sockets.get(partnerSocketId!);
          partnerSocket?.emit("user:call-ended", { isEnder: false });
          const userCallLog = await this.activeCalls.deleteCall(
            partnerId,
            userId,
          );
          await sendMessage("video-end", userCallLog);
        }

        // Broadcast updated online user count
        const count = await this.getOnlineUserCountSomehow();
        socket.broadcast.emit("onlineUsersCount", { count });
        socket.emit("onlineUsersCount", { count });
      } catch (error) {
        socket.emit("video:global:error", {
          message:
            error instanceof Error
              ? error.message
              : "Error during disconnect cleanup.",
        });

        const errorLogs = {
          where: "At socket disconnect",
          message:
            error instanceof Error ? error.message : "Something went wrong ",
          userId: userId,
        };
        await sendMessage("error-logs", errorLogs);
      }
    });
  }

  /**
   * Helper to get a count of currently online users from Redis map
   */
  private async getOnlineUserCountSomehow() {
    return await this.socketsByUser.count();
  }

  /**
   *
   * @param callerId - string callerUser id
   * @param calleeId - string calleSocket id
   * @param isCaller - {booelan} identifie that isCaller or not
   * @returns
   */
  public async matchFound(
    callerId: string,
    calleeId: string,
    isCaller: boolean,
  ) {
    try {
      const callerSocketId = await this.socketsByUser.get(callerId);
      const calleeSocketId = await this.socketsByUser.get(calleeId);

      if (!callerSocketId || !calleeSocketId) {
        const errorLogs = {
          where: "In matchFound method of videoSocket",
          message: "CallerSocket id or CalleeSocket id not found",
          userId: callerId,
        };
        await sendMessage("error-logs", errorLogs);
        return;
      }

      const callerSocket = this._io.sockets.get(callerSocketId);
      const calleeSocket = this._io.sockets.get(calleeSocketId);
      if (!callerSocket || !calleeSocket) {
        const errorLogs = {
          where: "In matchFound method of videoSocket",
          message: "CallerSocket or CalleeSocket not found",
          userId: callerId,
        };
        await sendMessage("error-logs", errorLogs);
        return;
      }

      if (isCaller) {
        callerSocket.emit("user:match-found", {
          partnerId: calleeId,
          isCaller: true,
        });
        calleeSocket.emit("user:match-found", {
          partnerId: callerId,
          isCaller: false,
        });
        callerSocket.emit("global:success:message", {
          message: `New partner found.`,
        });
        calleeSocket.emit("global:success:message", {
          message: `New partmer found.`,
        });

        // Save active call state
        await this.activeCalls.setCall(callerId, calleeId);
      }
    } catch (error) {
      console.error(error);

      const errorLogs = {
        where: "In matchFound method of videoSocket",
        message:
          error instanceof Error ? error.message : "Something went wrong ",
        userId: callerId,
      };
      await sendMessage("error-logs", errorLogs);
    }
  }
}

export default VideoSocket;

// Import all the necessary dependencies here
import VideoCallUserQueue from "../../services/redis_service/VideoCallUserQueue.js";
import { socketAuthMiddleware } from "../../middlewares/index.js";
import { Namespace, Socket, type DefaultEventsMap } from "socket.io";
import VideoCallSocketByUserQueue from "../../services/redis_service/VideoCallSocketByUserQueue.js";
import ActiveCallRedisMap from "../../services/redis_service/ActiveCallRedisMap.js";

class VideoSocket {
  private _io: Namespace;
  private socketsByUser = new VideoCallSocketByUserQueue(); // Redis-backed map of userId -> socketId
  private activeCalls = new ActiveCallRedisMap(); // Redist-backend map of callerId -> calleId

  constructor(io: Namespace) {
    this._io = io;

    // Middleware to verify user before socket connection is established
    this._io.use(socketAuthMiddleware);

    // When a new client connects to the namespace
    this._io.on("connection", this.handleConnection.bind(this));
  }

  /**
   * Tries to find a random match for the given user.
   * If matched, emits a "user:match-found" event to both users.
   * If not matched, keeps the user in waiting queue.
   */
  private async findRandomUser(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap>,
    userId: string,
    filters = {},
  ) {
    await VideoCallUserQueue.addUser(userId, filters);

    const matchUserId = await VideoCallUserQueue.findMatch(userId, filters);

    if (matchUserId) {
      if (userId === matchUserId) {
        // Avoid self-matching (only one user in queue)
        await VideoCallUserQueue.addUser(userId, filters);
        socket.emit("self-loop");
        return;
      }

      // Remove both users from queue once matched
      await VideoCallUserQueue.removeUser(userId);
      await VideoCallUserQueue.removeUser(matchUserId);

      // Get matched user's socket ID
      const partnerSocketId = await this.socketsByUser.get(matchUserId);


      if (!partnerSocketId) {
        socket.emit("user:not-found");
        return;
      }

      const partnerSocket = this._io.sockets.get(partnerSocketId);
      if (partnerSocket) {
        socket.emit("user:match-found", {
          partnerId: matchUserId,
          isCaller: true,
        });
        partnerSocket.emit("user:match-found", {
          partnerId: userId,
          isCaller: false,
        });
        await this.activeCalls.setCall(userId, matchUserId);
      } else {
        socket.emit("user:not-found", {
          message: "Partner is not available try again...",
        });
      }
    } else {
      // No match yet, keep waiting
      await VideoCallUserQueue.addUser(userId, filters);
      socket.emit("wait");
    }
  }





  private async disconnectPreviousIfExists(userId: string): Promise<void> {
    const prevSocketId = await this.socketsByUser.get(userId);
    if (!prevSocketId) return;

    const prevSocket = this._io.sockets.get(prevSocketId);
    if (prevSocket) {
      // Notify the old socket that it's being disconnected
      prevSocket.emit("duplicate:connection", {
        message: "You were disconnected because your account logged in elsewhere. Pleased reload the page to get connected again.",
      });
      // Disconnect the old socket
      prevSocket.disconnect(true);
    }

    // Remove old reference
    await this.socketsByUser.delete(userId);
  }



  /**
   * Called when a user successfully connects to the socket namespace.
   * Handles all socket events related to video calling.
   */
  private async handleConnection(socket: Socket) {

    const userId = socket.data.user._id; // When user connected to the video socket first time he/she will get authenticated and if they get authorized to call then there userId will be save in the socket, so get that userId

    // Disconnect any previous connection for this user
    await this.disconnectPreviousIfExists(userId);

    await this.socketsByUser.set(userId, socket);

    // Event: When user wants to start random video call
    socket.on("start:random-video-call", async ({ filters }) => {
      try {
        await this.findRandomUser(socket, userId, filters); // Call the method that helps to find the random-user based in the filters
      } catch (error) {
        // If any things un-expected happens then emit the video:global:error event
        socket.emit("video:global:error", {
          message:
            error instanceof Error
              ? error.message
              : "Something went wrong while finding a match.",
        });
      }
    });

    /**
 * Handel the online user counts event
 */
    socket.on("onlineUsersCount", async () => {
      const onlineCount = await this.getOnlineUserCountSomehow(); // get the total counts from the map
      socket.emit("onlineUsersCount", { count: onlineCount });
    });

    // Event: Caller sends offer to callee
    socket.on("call-user", async ({ to, offer }) => {
      try {
        const calleeSocketId = await this.socketsByUser.get(to);
        console.log("ohyes");

        if (!calleeSocketId) {
          socket.emit("call-error", { message: "User not available now." });
          return;
        }

        const calleeSocket = this._io.sockets.get(calleeSocketId);
        if (!calleeSocket) {
          socket.emit("call-error", { message: "User not available now." });
          return;
        }

        // Send offer to callee
        calleeSocket.emit("receive-call", { offer, from: userId });
      } catch (error) {
        // If any things un-expected happens then emit the video:global:error event
        socket.emit("video:global:error", {
          message:
            error instanceof Error
              ? error.message
              : "Something went wrong while calling the user.",
        });
      }
    });

    // Event: Callee accepts the call and sends answer back to caller
    socket.on("call-accepted", async ({ to, answer }) => {
      try {
        const callerSocketId = await this.socketsByUser.get(to);
        if (!callerSocketId) {
          socket.emit("call-error", { message: "User not available now." });
          return;
        }

        const callerSocket = this._io.sockets.get(callerSocketId);
        if (!callerSocket) return;

        // Send answer back to caller
        callerSocket.emit("call-accepted", { from: userId, answer });
      } catch (error) {
        // If any things un-expected happens then emit the video:global:error event
        socket.emit("video:global:error", {
          message:
            error instanceof Error
              ? error.message
              : "Something went wrong while accepting the call.",
        });
      }
    });

    // Event: Relay ICE candidate to target peer
    socket.on("ice-candidate", async ({ to, candidate }) => {
      try {
        const targetSocketId = await this.socketsByUser.get(to);
        if (!targetSocketId) return;

        const targetSocket = this._io.sockets.get(targetSocketId);
        if (!targetSocket) return;

        // Forward ICE candidate
        targetSocket.emit("ice-candidate", { candidate });
      } catch (error) {
        // If any things un-expected happens then emit the video:global:error event
        socket.emit("video:global:error", {
          message:
            error instanceof Error
              ? error.message
              : "Something went wrong while handeling the ice candicate",
        });
      }
    });

    // Event: User ends the call manually
    socket.on("end-call", async ({ partnerId }) => {
      try {
        // Always remove user from queues
        await VideoCallUserQueue.removeUser(userId);

        if (partnerId) {
          await this.activeCalls.deleteCall(userId, partnerId);

          // Remove partner too
          await VideoCallUserQueue.removeUser(partnerId);
          const partnerSocketId = await this.socketsByUser.get(partnerId);

          if (partnerSocketId) {
            const partnerSocket = this._io.sockets.get(partnerSocketId);
            if (partnerSocket) {
              partnerSocket.emit("user:call-ended", { isEnder: false });
              socket.emit("user:call-ended", { isEnder: true });
              return;
            }
          }
        }
      } catch (error) {
        // If any things un-expected happens then emit the video:global:error event
        socket.emit("video:global:error", {
          message:
            error instanceof Error
              ? error.message
              : "Something went wrong while ending the call.",
        });
      }
    });

    // Event: Inform callee that caller ended call, both can try again
    socket.on(
      "go:and:tell:callee:call:ended:so:you:can:try:for:others",
      async ({ partnerId }) => {
        try {
          if (partnerId) {
            // Clean up both users from queue
            await VideoCallUserQueue.removeUser(partnerId);
            await VideoCallUserQueue.removeUser(userId);
            await this.activeCalls.deleteCall(userId, partnerId);

            const partnerSocketId = await this.socketsByUser.get(partnerId);

            if (partnerSocketId) {
              const partnerSocket = this._io.sockets.get(partnerSocketId);
              if (partnerSocket) {
                socket.emit("user:call-ended:try:for:other", { isEnder: true });
                partnerSocket.emit("user:call-ended:try:for:other", {
                  isEnder: false,
                });
                return;
              }
            } else {
              socket.emit("user:call-ended", { isEnder: false });
              return;
            }
          }
        } catch (error) {
          // If any things un-expected happens then emit the video:global:error event
          socket.emit("video:global:error", {
            message:
              error instanceof Error
                ? error.message
                : "Something went wrong while trying next-call.",
          });
        }
      },
    );

    // Handle disconnection and clean up state
    socket.on("disconnect", async (reason) => {
      try {
        console.log("delete");

        this.socketsByUser.delete(userId); // Remove from Redis socket-user map
        VideoCallUserQueue.removeUser(userId).catch(() => { }); // Remove from queue
        const partnerId = await this.activeCalls.getPartner(userId);
        if (partnerId) {
          const partnerSocketId = await this.socketsByUser.get(partnerId);
          if (partnerSocketId) {
            const partnerSocket = this._io.sockets.get(partnerSocketId);
            if (partnerSocket) {
              partnerSocket.emit("user:call-ended", { isEnder: false });
            }
          };
          await this.activeCalls.deleteCall(partnerId, userId);
        }

        const onlineCount = await this.getOnlineUserCountSomehow(); // get the total counts from the map
        socket.broadcast.emit("onlineUsersCount", { count: onlineCount });
        socket.emit("onlineUsersCount", { count: onlineCount });
      } catch (error) {
        // If any things un-expected happens then emit the video:global:error event
        socket.emit("video:global:error", {
          message:
            error instanceof Error
              ? error.message
              : "Something went wrong while disconnecting the user.",
        });
      }
    });
  }

  private async getOnlineUserCountSomehow() {
    return await this.socketsByUser.count();
  }
}

export default VideoSocket;

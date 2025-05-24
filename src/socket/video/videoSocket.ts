import VideoCallUserQueue from "../../services/redis_service/VideoCallUserQueue.js";
import { socketAuthMiddleware } from "../../middlewares/index.js";
import { Namespace, Socket, type DefaultEventsMap } from "socket.io";
import VideoCallSocketByUserQueue from "../../services/redis_service/VideoCallSocketByUserQueue.js";
import ActiveCallRedisMap from "../../services/redis_service/ActiveCallRedisMap.js";
let time = 0;


class VideoSocket {
    private _io: Namespace;
    private socketsByUser = new VideoCallSocketByUserQueue(); // Redis-backed map of userId -> socketId
    private activeCalls = new ActiveCallRedisMap();


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
    private async findRandomUser(socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap>, userId: string, filters = {}) {
        await VideoCallUserQueue.addUser(userId, filters);



        const matchUserId = await VideoCallUserQueue.findMatch(userId, filters);
        // console.log("start*************************  ", time++ );
        // console.log(matchUserId);

        // console.log("end*************************", time);
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
                socket.emit("user:match-found", { partnerId: matchUserId, isCaller: true });
                partnerSocket.emit("user:match-found", { partnerId: userId, isCaller: false });
                await this.activeCalls.setCall(userId, matchUserId);
            } else {
                socket.emit("user:not-found");
            }
        } else {
            // No match yet, keep waiting     


            await VideoCallUserQueue.addUser(userId, filters);
            socket.emit("wait");
        }
    }

    /**
     * Called when a user successfully connects to the socket namespace.
     * Handles all socket events related to video calling.
     */
    private async handleConnection(socket: Socket) {
        const userId = socket.data.user._id;
        console.log(userId);


        // Map userId -> socketId in Redis for lookup
        await this.socketsByUser.set(userId, socket);

        // Event: When user wants to start random video call
        socket.on("start:random-video-call", async ({ filters }) => {
            try {
                this.findRandomUser(socket, userId, filters);
            } catch (error) {
                socket.emit("match:error", {
                    message:
                        error instanceof Error
                            ? error.message
                            : "Something went wrong while finding a match.",
                });
            }
        });

        // Event: Caller sends offer to callee
        socket.on("call-user", async ({ to, offer }) => {
            try {
                const calleeSocketId = await this.socketsByUser.get(to);
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
                socket.emit("call-error", {
                    message:
                        error instanceof Error
                            ? error.message
                            : "Error during call attempt.",
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
                socket.emit("call-error", {
                    message:
                        error instanceof Error
                            ? error.message
                            : "Error during call acceptance.",
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
            } catch {
                // Optional: log error
            }
        });

        // Event: User ends the call manually
        socket.on("end-call", async ({ partnerId }) => {
            try {
                // console.log(partnerId);
                console.log("call end");


                // Always remove user from queues
                await VideoCallUserQueue.removeUser(userId);
                await this.activeCalls.deleteCall(userId, partnerId);

                if (partnerId) {

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
            } catch {
                console.log("error");

                // Optional: log error
            }
        });

        // Event: Inform callee that caller ended call, both can try again
        socket.on("go:and:tell:callee:call:ended:so:you:can:try:for:others", async ({ partnerId }) => {
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
                            partnerSocket.emit("user:call-ended:try:for:other", { isEnder: false });
                            return;
                        }
                    } else {
                        socket.emit("user:call-ended", { isEnder: false });
                    }
                }
            } catch {
                // Optional: log error
            }
        });

        // Handle disconnection and clean up state
        socket.on("disconnect", async (reason) => {
            // console.log(`User ${userId} disconnected: ${reason}`);
            this.socketsByUser.delete(userId); // Remove from Redis socket-user map
            VideoCallUserQueue.removeUser(userId).catch(() => { }); // Remove from queue
            const partnerId = await this.activeCalls.getPartner(userId);
            if (partnerId) {
                const partnerSocketId = await this.socketsByUser.get(partnerId);
                if (partnerSocketId) {
                    const partnerSocket = this._io.sockets.get(partnerSocketId);
                    if (partnerSocket) {
                        partnerSocket.emit("user:call-ended", {isEnder: false});
                    }
                }
            }


        });
    }
}

export default VideoSocket;

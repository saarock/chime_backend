import { socketAuthMiddleware } from "../../middlewares/index.js";
import { Namespace, Socket } from "socket.io";

class VideoSocket {
    private _io: Namespace;
    constructor(io: Namespace) {
        this._io = io;
        this._io.use(socketAuthMiddleware);
        this._io.on("connection", this.handelConnection.bind(this));

    }

    private handelConnection(socket: Socket) {
        console.log(`video ${socket.id}: connected`);
        socket.on("disconnect", (reason) => {
            this.handleDisconnection(socket, reason);
        });
    }

    private handleDisconnection(socket: Socket, reason:string) {
        console.log(`video ${socket.id}: dis-connected with ${reason}`);
    }


}

export default VideoSocket;
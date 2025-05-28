import { socketAuthMiddleware } from "../../middlewares/index.js";
import type { Namespace, Socket } from "socket.io";

class ChatSocket {
  private _io: Namespace;
  constructor(io: Namespace) {
    this._io = io;
    this._io.use(socketAuthMiddleware);
    this._io.on("connection", this.handelConnection.bind(this));
  }

  private handelConnection(socket: Socket) {
    console.log("user connected to chat");
  }
}
export default ChatSocket;

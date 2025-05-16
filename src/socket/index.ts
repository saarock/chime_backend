import { Server } from "socket.io"
import ChatSocket from "./chat/chatSocket.js";
import VideoSocket from "./video/videoSocket.js";

export const initSockets = (httpServer: any) => {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.CORS_ORIGIN || "http://localhost:5173",
            methods: ["GET", "POST"],
            credentials: true,
        }
    });

    const chatNameSpace = io.of("/chat");
    const videoNameSpace = io.of("/video");
    new ChatSocket(chatNameSpace);
    new VideoSocket(videoNameSpace);
    return io;
}
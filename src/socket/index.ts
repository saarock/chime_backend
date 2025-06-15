import { Server } from "socket.io";
import ChatSocket from "./chat/chatSocket.js";
import VideoSocket from "./video/videoSocket.js";

export let videoSocket: VideoSocket | null;

export const initSockets = (httpServer: any) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
    maxHttpBufferSize: 65536, // 64KB
  });

  const chatNameSpace = io.of("/chat");
  const videoNameSpace = io.of("/video");
  new ChatSocket(chatNameSpace);
  videoSocket = new VideoSocket(videoNameSpace);

  return io;
};

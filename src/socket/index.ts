import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { setupChatSocket } from "./chatSocket.js";
import { setupVideoCallSocket } from "./videoCallSocket.js";
import { client } from "../configs/index.js";

export const initSockets = (httpServer: any) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    },
  });

  // const subClient = client.duplicate();
  // io.adapter(createAdapter(client, subClient));

  io.on("connection", (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    setupChatSocket(io, socket);
    setupVideoCallSocket(io, socket);

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  return io;
};

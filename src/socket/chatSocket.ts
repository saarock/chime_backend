import { Server, Socket } from "socket.io";
import {
  type ChatMessagePayload,
  type JoinRoomPayload,
} from "../types/index.js";

export const setupChatSocket = (io: Server, socket: Socket) => {
  // Join Room
  socket.on("joinRoom", (payload: JoinRoomPayload) => {
    const { roomId } = payload;
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // Handle Chat Message
  socket.on(
    "sendMessage",
    async (
      payload: ChatMessagePayload,
      callback: (response: { success: boolean; error?: string }) => void,
    ) => {
      try {
        const { roomId, message } = payload;

        console.log(`Message from ${socket.id} to room ${roomId}: ${message}`);

        // TODO: Save message to DB here

        io.to(roomId).emit("receiveMessage", {
          senderId: socket.id,
          message,
        });

        callback({ success: true });
      } catch (err) {
        console.error(err);
        callback({ success: false, error: "Server error" });
      }
    },
  );
};

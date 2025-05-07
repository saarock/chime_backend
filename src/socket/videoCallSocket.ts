import { Server, Socket } from 'socket.io';
import {
    type VideoCallOfferPayload,
    type VideoCallAnswerPayload,
    type IceCandidatePayload,
    type JoinCallPayload
} from "../types/index.js";

export const setupVideoCallSocket = (io: Server, socket: Socket) => {
    // Join Call Room
    socket.on('joinCall', (payload: JoinCallPayload) => {
        const { callRoomId } = payload;
        socket.join(callRoomId);
        console.log(`User ${socket.id} joined call room ${callRoomId}`);
    });

    // WebRTC Offer
    socket.on('offer', (payload: VideoCallOfferPayload) => {
        const { callRoomId, offer } = payload;
        socket.to(callRoomId).emit('offer', {
            senderId: socket.id,
            offer,
        });
    });

    // WebRTC Answer
    socket.on('answer', (payload: VideoCallAnswerPayload) => {
        const { callRoomId, answer } = payload;
        socket.to(callRoomId).emit('answer', {
            senderId: socket.id,
            answer,
        });
    });

    // ICE Candidate
    socket.on('ice-candidate', (payload: IceCandidatePayload) => {
        const { callRoomId, candidate } = payload;
        socket.to(callRoomId).emit('ice-candidate', {
            senderId: socket.id,
            candidate,
        });
    });
};

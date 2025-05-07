export interface ChatMessagePayload {
    roomId: string;
    message: string;
}

export interface VideoCallOfferPayload {
    callRoomId: string;
    offer: RTCSessionDescriptionInit;
}

export interface VideoCallAnswerPayload {
    callRoomId: string;
    answer: RTCSessionDescriptionInit;
}

export interface IceCandidatePayload {
    callRoomId: string;
    candidate: RTCIceCandidateInit;
}

export interface JoinRoomPayload {
    roomId: string;
}

export interface JoinCallPayload {
    callRoomId: string;
}

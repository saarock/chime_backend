import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import type { ExtendedError } from "socket.io";

const { JsonWebTokenError, TokenExpiredError } = jwt;

export const socketAuthMiddleware = (
  socket: Socket,
  next: (err?: ExtendedError) => void,
) => {
  const token = socket.handshake.auth?.accessToken;
  if (!token) {
    return next(new Error("Authentication token missing"));
  }

  const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
  if (!ACCESS_TOKEN_SECRET) {
    return next(new Error("Access token secret key not found"));
  }

  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as jwt.JwtPayload;
    socket.data.user = decoded;
    next();
  } catch (err: any) {
    if (err instanceof TokenExpiredError) {
      return next(new Error("AUTH_EXPIRED"));
    } else if (err instanceof JsonWebTokenError) {
      return next(new Error("AUTH_INVALID"));
    }
    return next(err);
  }
};

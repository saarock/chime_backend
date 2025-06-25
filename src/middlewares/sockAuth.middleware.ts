// Dependencies
import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import type { ExtendedError } from "socket.io";
import { token as TokenUtil } from "../utils/index.js"; // Your custom token utility


const { JsonWebTokenError, TokenExpiredError } = jwt;
/**
 * Socket.IO Middleware: Authenticate WebSocket connections using JWT in cookies.
 *
 * ✅ How it works:
 * - Expects JWT to be sent in the 'accessToken' cookie from the client.
 * - Parses and verifies the token using your custom TokenUtil.
 * - If valid, attaches decoded user info to `socket.data.user` for use in event handlers.
 * - If invalid or expired, blocks the connection with appropriate error messages.
 *
 * 🚀 Benefits:
 * - Prevents unauthorized users from establishing socket connections.
 * - Enables per-user socket access control for chat, video, notifications, etc.
 *
 * 📦 Expected Cookie Format:
 *    accessToken=eyJhbGciOiJIUzI1NiIsInR...
 */
export const socketAuthMiddleware = (
  socket: Socket,
  next: (err?: ExtendedError) => void,
) => {
  // 1. Extract raw cookie header from handshake
  const cookieHeader = socket.request.headers.cookie;

  if (!cookieHeader) {
    return next(new Error("AUTH_MISSING")); // No cookies = unauthenticated
  }

  try {
    // 2. Parse cookies using 'cookie' package
    const cookies = cookie.parse(cookieHeader);

    // 3. Extract the access token
    const accessToken = cookies.accessToken;

    if (!accessToken) {
      return next(new Error("AUTH_MISSING")); // Cookie present but token missing
    }

    // 4. Verify token using custom utility
    const decoded = TokenUtil.verifyAccessToken(accessToken); // Should throw if invalid

    // 5. Attach decoded user info to the socket for downstream use
    socket.data.user = decoded;

    console.log("✅ WebSocket authenticated:", decoded);

    // 6. Continue with connection
    next();
  } catch (err: any) {
    console.error("❌ WebSocket auth failed:", err.message);

    // 7. Handle known token errors
    if (err instanceof TokenExpiredError) {
      return next(new Error("AUTH_EXPIRED")); // Token expired
    } else if (err instanceof JsonWebTokenError) {
      return next(new Error("AUTH_INVALID")); // Malformed or invalid
    }

    // 8. Pass unhandled errors to next
    return next(err);
  }
};

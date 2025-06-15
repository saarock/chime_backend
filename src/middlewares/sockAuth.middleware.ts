// Import all the necessary dependencies here
import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import type { ExtendedError } from "socket.io";
import { token as TokenUtil } from "../utils/index.js";

const { JsonWebTokenError, TokenExpiredError } = jwt;

/**
 * Socket.io middleware to authenticate incoming socket connections using JWT.
 * - Expects the JWT to be present in the 'accessToken' cookie.
 * - Decodes and verifies the token.
 * - Injects the decoded user data into `socket.data.user`.
 * 
 * This middleware helps secure WebSocket connections by ensuring only
 * authenticated users can proceed with socket interactions.
 */
export const socketAuthMiddleware = (
  socket: Socket,
  next: (err?: ExtendedError) => void,
) => {
  // Extract cookie header from the incoming socket handshake request
  const cookies = socket.request.headers.cookie;
  if (!cookies) {
    return next(new Error("Authentication token missing")); // No cookies = unauthenticated
  }

  // Parse the cookies into a key-value object
  const parsedCookies = cookie.parse(cookies);

  // Attempt to extract the JWT access token from the cookies
  const token = parsedCookies["accessToken"]; // Ensure this matches your actual cookie name
  if (!token) {
    return next(new Error("Authentication token missing")); // Token not found
  }

  try {
    // Verify the token using your custom utility (e.g., secret, expiration, etc.)
    const decoded = TokenUtil.verifyAccessToken(token);

    // Attach the decoded payload to the socket for downstream use (e.g., socket.data.user.id)
    socket.data.user = decoded;

    // Allow the connection to proceed
    next();
  } catch (err: any) {
    // Handle token-specific errors gracefully
    if (err instanceof TokenExpiredError) {
      return next(new Error("AUTH_EXPIRED")); // Token is valid but expired
    } else if (err instanceof JsonWebTokenError) {
      return next(new Error("AUTH_INVALID")); // Token is malformed or invalid
    }

    // For unexpected errors, pass the raw error to the next middleware
    return next(err);
  }
};

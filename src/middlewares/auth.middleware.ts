// Imports
import { ApiError, asyncHandler } from "../utils/index.js";
import { type Request, type Response, type NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

/**
 * declare the global to set the extra key on express request
 */
declare global {
  namespace Express {
    interface Request {
      user?: string | JwtPayload;
      userId?: string | undefined;
    }
  }
}

export const verifyJWT = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(" ")[1];
    const jwtScret = process.env.ACCESS_TOKEN_SECRET;

    if (!jwtScret || !token) {
      throw new ApiError(
        401,
        "Unauthorized request",
        ["Unauthorized request"],
        "At auth.middleware.js file line number 20 to 21",
      );
    }

    let decoded;

    try {
      decoded = jwt.verify(token, jwtScret);
    } catch (err) {
      throw new ApiError(
        401,
        "Invalid or expired token",
        ["Invalid or expired token"],
        "At auth.middleware.js file line number 34 to 41",
      );
    }

    req.user = decoded;
    next();
  },
);

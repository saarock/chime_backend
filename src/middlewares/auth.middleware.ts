// Import all the necessary dependencies here
import { ApiError, asyncHandler } from "../utils/index.js";
import { type Request, type Response, type NextFunction } from "express";
import { type JwtPayload } from "jsonwebtoken";
import { token as tokenUtil } from "../utils/index.js";

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
    // Get the accessToken from the user request
    const token = req.cookies.accessToken;

    console.log(token);


    // Check that token is available or not
    if (!token) {
      // If access-token is not available then it means that token is expired or user deleteted manually that's why send the error with the
      // token_expired error-code to triggered the refresh-token
      throw new ApiError(401, "Unauthorized request", [], "", "token_expired");
    }

    // Decode the token and get the userPayload
    let decoded = tokenUtil.verifyAccessToken(token);
    // Add to the req for future use-case
    req.user = decoded;
    req.userId = decoded._id;
    next();
  },
);

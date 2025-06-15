// Import all the necessary dependencies here
import type { NextFunction, Request, Response } from "express";
import { ApiError, asyncHandler, token } from "../utils/index.js";

export const verifyJWTRefreshToken = asyncHandler(
  async (req: Request, _: Response, next: NextFunction) => {
    // Get the refreshToken
    const refreshToken = req.cookies.refreshToken;

    // Check the token is available or not
    if (
      refreshToken === undefined ||
      refreshToken === null ||
      refreshToken.trim() === ""
    ) {
      // If not available then throw the error with the token-expired error-code
      /**
       * @note Error-code is very important to handle all the use-cases
       */
      throw new ApiError(
        401,
        "Unauthorized request",
        ["Unauthorized request"],
        "token_required",
      );
    }

    // verify the refreshToken send by the user from the userHelper
    const payload = token.verifyRefreshToken(refreshToken);
    if (typeof payload === "string") {
      throw new ApiError(500, "Server Error");
    }

    // set the values to the keys
    const userId = payload._id;
    req.userId = userId;

    next();
  },
);

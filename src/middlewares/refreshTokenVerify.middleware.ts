// Import all the necessary dependencies here
import type { NextFunction, Request, Response } from "express";
import { userHelper } from "../helpers/index.js";
import { ApiError, asyncHandler } from "../utils/index.js";

export const verifyJWTRefreshToken = asyncHandler(
  async (req: Request, _: Response, next: NextFunction) => {
    console.log("***************************************************");

    const { refreshToken } = req.body;
    console.log(refreshToken);

    if (
      refreshToken === undefined ||
      refreshToken === null ||
      refreshToken.trim() === ""
    ) {
      throw new ApiError(400, "RefreshToken is requried!");
    }

    // verify the refreshToken send by the user from the userHelper
    const payload = userHelper.verifyRefreshToken(refreshToken);
    if (typeof payload === "string") {
      throw new ApiError(500, "Server Error");
    }

    // set the values to the keys
    const userId = payload._id;
    req.userId = userId;

    next();
  },
);

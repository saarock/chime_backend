
// Import all the necessary dependencies here
import type { NextFunction, Request, Response } from "express";
import { userHelper } from "../helpers/index.js";
import { ApiError } from "../utils/index.js";


export const verifyJWTRefreshToken = async (req: Request, res: Response, next: NextFunction) => {
    const { refreshToken } = req.body;

    if (refreshToken === undefined || refreshToken === null || refreshToken.trim() === "") {
        throw new ApiError(400, "RefreshToken is requried!");
    }

    const payload = userHelper.verifyRefreshToken(refreshToken);
    if (typeof payload === "string") {

        throw new ApiError(500, "Server Error");
    }


    // set the values to the keys
    const userId = payload._id;
    req.userId = userId;
    next();
    

}
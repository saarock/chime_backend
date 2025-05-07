// Imports
import { client } from "../config/index.js";
import { User } from "../models/index.js";
import type { User as userTypes } from "../types/index.js";
import { ApiError } from "../utils/index.js";
import jwt, { type JwtPayload } from "jsonwebtoken";




class UserHelper {
    async cacheTheUserDataById(key: string, value: string) {
        // Cache the user data in Redis (excluding sensitive data)
        await client.set(key, value, {
            EX: 3600,
            NX: true,
        }); // Cache expires in 1 hour (3600 seconds)
    }


    // Helper method to generate access and refresh tokens
    generateAccessAndRefreshTokensAndCacheTheUserDataInRedis = async (userId: string, userDataWithoutSensitiveData: userTypes): Promise<{ accessToken: string, refreshToken: string }> => {

        const user = await User.findById(userId);
        if (!user) {
            throw new ApiError(404, "User not found");
        }

        const accessToken = await user.generateAccessToken();

        const refreshToken = await user.generateRefreshToken();
        user.refreshToken = refreshToken;

        // Save the refresh token to the database without validating before saving (if you don't want validation to be triggered)
        await user.save({ validateBeforeSave: false });
        // cache the data in the redis
        const userIdAString = userId.toString();
        this.cacheTheUserDataById(userIdAString, JSON.stringify(userDataWithoutSensitiveData))
        return { accessToken, refreshToken };

    }


    // Get the cache data by userId
    async getUserRedisCacheData(userId: string): Promise<userTypes | null> {
        const userCacheData = await client.get(userId);
        if (userCacheData && JSON.parse(userCacheData)) {
            return JSON.parse(userCacheData);
        }
        return null;
    }




    // Verify refreshToken 
    verifyRefreshToken(refreshToken: string): JwtPayload {
        const jwtSecret = process.env.REFRESH_TOKEN_SECRET;




        if (!jwtSecret?.trim() || !refreshToken?.trim()) {
            console.log("hahahha");
            throw new ApiError(
                400,
                "RefreshToken or Secret key not found",
                ["Token NotFound", "Server Error"],
                "At auth.middleware.js file line number 20 to 21"
            );
        }

        try {
            const decoded = jwt.verify(refreshToken, jwtSecret) as JwtPayload;
            return decoded;
        } catch (error) {
            /** If the token is inValid then throw the Error yourself
             * @note Even If you don't use here try catch and throw the error youself then also jwt.verify throw error
             * if the token is invalid which is eventually handled by asynHandler automatically
             */
            throw new ApiError(
                401,
                "Refresh Token invalid or expired"
            );
        }

    }
}


const userHelper = new UserHelper();
export default userHelper;


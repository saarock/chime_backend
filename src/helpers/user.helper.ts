// Imports
import { client } from "../configs/index.js";
import { User } from "../models/index.js";
import type { User as userTypes } from "../types/index.js";
import { ApiError } from "../utils/index.js";
import jwt, { type JwtPayload } from "jsonwebtoken";


class UserHelper {
  cacheTheUserDataById = async (key: string, value: string) => {
    try {
      console.log("Setting data in Redis:", key, value);  // Check if Redis `set` is being called
      // Cache the user data in Redis (excluding sensitive data)
      await client.set(key, value, {
        EX: 3600,
        NX: true,
      }); // Cache expires in 1 hour (3600 seconds)
    } catch (error) {
      console.error(`Error caching user data: ${error}`);
      // I want to send the userfriendly error here that's why i use try catch to catch the error and send the userfriendly error
      throw new ApiError(500, "Failed to cache the user Data at in-memory-database");
    }
  }

  // Helper method to generate access and refresh tokens
  generateAccessAndRefreshTokensAndCacheTheUserDataInRedis = async (
    userId: string,
    userDataWithoutSensitiveData: userTypes,
  ): Promise<{ accessToken: string; refreshToken: string }> => {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Generate the accessToken
    const accessToken = await user.generateAccessToken();
    // Generate the refreshToken
    const refreshToken = await user.generateRefreshToken();
    // Update the refreshToken in the database
    user.refreshToken = refreshToken;

    // Save the refresh token to the database without validating before saving (if you don't want validation to be triggered)
    await user.save({ validateBeforeSave: false });
    // cache the data in the redis
    const userIdAString = userId.toString();
    this.cacheTheUserDataById(
      userIdAString,
      JSON.stringify(userDataWithoutSensitiveData),
    );
    // Return the access and refresh token ;
    return { accessToken, refreshToken };
  };

  // Get the cache data by userId
  getUserRedisCacheData = async (userId: string): Promise<userTypes | null> => {
    const userCacheData = await client.get(userId);
    if (userCacheData && JSON.parse(userCacheData)) {
      return JSON.parse(userCacheData);
    }
    return null;
  }

  // Verify refreshToken
  verifyRefreshToken(refreshToken: string): JwtPayload {
    const jwtSecret = process.env.REFRESH_TOKEN_SECRET;
    // Just check the jwtSecret because refreshToken is already checking in the middleware
    if (!jwtSecret || !jwtSecret?.trim()) {
      throw new ApiError(
        400,
        "Secret key not found",
        ["Key NotFound", "Server Error"],
        "At auth.middleware.js file line number 20 to 21",
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
      throw new ApiError(401, "Refresh Token invalid or expired");
    }
  }
}

const userHelper = new UserHelper();
export default userHelper;

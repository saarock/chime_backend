// Import all the necessary dependencies here
import { client } from "../configs/index.js";
import { User } from "../models/index.js";
import type { User as userTypes } from "../types/index.js";
import { ApiError } from "../utils/index.js";

class UserHelper {
  // this cache helper method is just for the authentication and authorization user data cache other core cache are in the cache folder
  public cacheTheUserDataById = async (key: string, value: string) => {
    try {
      // Cache the user data in Redis (excluding sensitive data)
      await client.set(`user:${key}`, value, {
        EX: 3600,
      }); // Cache expires in 1 hour (3600 seconds)
      console.log("cache done");
      
    } catch (error) {
      console.error(`Error caching user data: ${error}`);
      // I want to send the userfriendly error here that's why i use try catch to catch the error and send the userfriendly error
      throw new ApiError(
        500,
        "Failed to cache the user Data at in-memory-database",
      );
    }
  };

  // Helper method to generate access and refresh tokens
  public generateAccessAndRefreshTokensAndCacheTheUserDataInRedis = async (
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

    if (!accessToken || !refreshToken) {
      // if access or refresh token doesn't generated then throw new erro with status code 500
      throw new ApiError(500, "Internal Server Error");
    }
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
  public getUserRedisCacheData = async (userId: string): Promise<userTypes | null> => {
    const userCacheData = await client.get(`user:${userId}`);
    if (userCacheData && JSON.parse(userCacheData)) {
      return JSON.parse(userCacheData);
    }
    return null;
  };


  // Delete the redis cache data
  public async deleteTheRedisCacheData(userId: string): Promise<void> {
    await client.del(`user:${userId}`);
    return;
  }
}

const userHelper = new UserHelper();
export default userHelper;

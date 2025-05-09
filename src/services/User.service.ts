// src/services/User.services.ts
import type { TokenPayload } from "google-auth-library";
import { User } from "../models/index.js";
import type {
  TokenPayloadTypes,
  User as userTypes,
  UserLoginWithGoogleDetils,
} from "../types/index.js";
import verifyGoogleToken from "../utils/verifyGoogleToken.js";
import ApiError from "../utils/ApiError.js";
import userHelper from "../helpers/user.helper.js";

// UserService class for login, logout, register and other user related things
class UserService {
  #userHelper;
  constructor() {
    this.#userHelper = userHelper;
  }

  // Main method for login with Google
  async loginWithGoogle(
    googleTokens: UserLoginWithGoogleDetils,
  ): Promise<{
    userData: userTypes;
    refreshToken: string;
    accessToken: string;
  }> {
    // Step 1: Verify Google token and retrieve user data
    const userGoogleDatas: TokenPayload | undefined =
      await verifyGoogleToken(googleTokens);
    if (!userGoogleDatas) {
      throw new ApiError(404, "Google Payload Not Found");
    }

    if (!userGoogleDatas.email) {
      throw new ApiError(404, "Email is required!");
    }

    if (!userGoogleDatas.name) {
      throw new ApiError(404, "fulName is required");
    }

    // Step 2: Check if the user is already registered
    const alreadySavedUser = await User.findOne({
      email: userGoogleDatas.email,
    })
      .select("-password -refreshToken")
      .lean<userTypes>();

    if (alreadySavedUser) {
      // If user already exists, generate access and refresh tokens and cache the  userDetails [Login User]
      const { accessToken, refreshToken } =
        await this.#userHelper.generateAccessAndRefreshTokensAndCacheTheUserDataInRedis(
          alreadySavedUser._id,
          alreadySavedUser,
        );
      return { userData: alreadySavedUser, accessToken, refreshToken };
    }

    // Step 3: If user doesn't exist, create a new user in the database [Register User]
    const justCreatedUser = await User.create({
      fullName: userGoogleDatas.name,
      email: userGoogleDatas.email,
      profilePicture: userGoogleDatas.picture,
    });

    // Step 4: Select user data excluding sensitive information (like password)
    const userWithoutSensitiveData = await User.findById(justCreatedUser._id)
      .select("-password -refreshToken")
      .lean<userTypes>();
    // Throw the error if the user is found with id;
    if (!userWithoutSensitiveData)
      throw new ApiError(400, "UserDetails not found by ID");
    console.log("This is the userGoogleDatas: ", userGoogleDatas);
    // Step 5: Generate access and refresh tokens for the new user and cachne the userDetails
    const { accessToken, refreshToken } =
      await this.#userHelper.generateAccessAndRefreshTokensAndCacheTheUserDataInRedis(
        justCreatedUser._id,
        userWithoutSensitiveData,
      );

    console.log("User registered successfully");

    // Return user data and tokens
    return { userData: userWithoutSensitiveData, accessToken, refreshToken };
  }

  async verifyUser(decoded: TokenPayloadTypes): Promise<userTypes> {
    // get the userData form the cache
    const isThereisUserData: userTypes | null =
      await this.#userHelper.getUserRedisCacheData(decoded._id);

    let userData;
    if (isThereisUserData) {
      console.log("User data is in the cache");
      // If user data is in the cache
      userData = isThereisUserData;
    } else {
      // If user data is not in the cache
      userData = await User.findById(decoded._id)
        .select("-password -refreshToken")
        .lean<userTypes>();
      if (userData) {
        // chache the data again;
        this.#userHelper.cacheTheUserDataById(
          userData?._id.toString(),
          JSON.stringify(userData),
        );
      } else {
        throw new ApiError(400, "UserData not found");
      }
    }

    if (!userData) throw new ApiError(404, "User not found");

    // return the data to the controller
    return userData;
  }

  async generateAnotherRefreshTokenAndAccessTokenAndChangeTheDatabaseRefreshToken(
    userId: string | undefined,
    refreshTokenFromClient: string,
  ): Promise<{
    userData: userTypes;
    refreshToken: string;
    accessToken: string;
  }> {
    if (!userId) {
      throw new ApiError(400, "User id requried while refreshing the tokens");
    }
    const currentUser = await User.findById(userId).select("-password");
    if (!currentUser) {
      throw new ApiError(404, "User not found");
    }

    // compare database refreshToken and client token
    if (currentUser.refreshToken === refreshTokenFromClient) {
      console.log("Token valid");

      const userRedisCacheData =
        await this.#userHelper.getUserRedisCacheData(userId);

      let userDataWithoutSensativeData;

      if (userRedisCacheData) {
        console.log("User is already in the cache in refreshToken section");
        // If the data is already in the cahche
        userDataWithoutSensativeData = userRedisCacheData;
      } else {
        console.log("User is not already in the cache in refreshToken section");
        // If the data is not in the cache
        userDataWithoutSensativeData = await User.findById(currentUser)
          .select("-password -refreshToken")
          .lean<userTypes>();
      }
      if (!userDataWithoutSensativeData)
        throw new ApiError(400, "UserDetails not found by ID");
      const { refreshToken, accessToken } =
        await this.#userHelper.generateAccessAndRefreshTokensAndCacheTheUserDataInRedis(
          userDataWithoutSensativeData?._id,
          userDataWithoutSensativeData,
        );
      return {
        refreshToken,
        accessToken,
        userData: userDataWithoutSensativeData,
      };
    } else {
      console.log("Token Invalid");
      throw new ApiError(
        403,
        "You do not have permission for the requested action",
      );
    }
  }
}

// Create an instance of the UserService
const userService = new UserService();

// Export the service instance
export default userService;

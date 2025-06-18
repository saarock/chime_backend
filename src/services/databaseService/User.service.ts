// src/services/User.services.ts
import type { TokenPayload } from "google-auth-library";
import { User } from "../../models/index.js";
import type {
  TokenPayloadTypes,
  User as userTypes,
  UserLoginWithGoogleDetails,
  UserImpDetails,
} from "../../types/index.js";
import verifyGoogleToken from "../../utils/verifyGoogleToken.js";
import ApiError from "../../utils/ApiError.js";
import userHelper from "../../helpers/user.helper.js";

// UserService class for login, logout, register and other user related things
class UserService {
  private userHelper;
  constructor() {
    this.userHelper = userHelper;
  }

  /**
   * This service method is responsible for handeling the login part like decode the crendentials, and check that user is already exist or not, if already exist then simply login, if not then first
   * saved user details to the database then handle login along handles the cache also by using the helper methods
   * @param {string} param0.googleTokens.clientId - Google client id
   * @param {string} param0.googleTokens.credential - User secure hashed crendential
   * @returns {Promise<UserData, refreshToken, accessToken >}
   */
  async loginWithGoogle(googleTokens: UserLoginWithGoogleDetails): Promise<{
    userData: userTypes;
    refreshToken: string;
    accessToken: string;
  }> {
    // Step 1: Verify Google token and retrieve user data
    const userGoogleDatas: TokenPayload | undefined =
      await verifyGoogleToken(googleTokens);

    if (!userGoogleDatas) {
      // If no TokenPayload available then then throw the error
      throw new ApiError(404, "Google Payload Not Found");
    }

    if (!userGoogleDatas.email) {
      // If no email available then throw the error
      throw new ApiError(404, "Email is required!");
    }

    if (!userGoogleDatas.name) {
      // If no name available then thrw the error
      throw new ApiError(404, "fulName is required");
    }

    // Step 2: Check if the user is already registered
    const alreadySavedUser = await User.findOne({
      email: userGoogleDatas.email,
    })
      .select("-password -refreshToken")
      .lean<userTypes>();

    if (alreadySavedUser) {
      // If user is already get registered
      if (!alreadySavedUser.active) {
        // throw error if the user is blocked or not active
        throw new ApiError(
          403,
          "You are blocked because of irrelevant activities pleased contact us.",
        );
      }

      // If user already exists, generate access and refresh tokens and cache the  userDetails [Login User] useing the helper method
      const { accessToken, refreshToken } =
        await this.userHelper.generateAccessAndRefreshTokensAndCacheTheUserDataInRedis(
          alreadySavedUser._id,
          alreadySavedUser,
        );

      // If all the process completed then simply retrun the tokens with userData
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
    if (!userWithoutSensitiveData) {
      throw new ApiError(400, "UserDetails not found by ID");
    }

    // Step 5: Generate access and refresh tokens for the new user and cachne the userDetails
    const { accessToken, refreshToken } =
      await this.userHelper.generateAccessAndRefreshTokensAndCacheTheUserDataInRedis(
        justCreatedUser._id,
        userWithoutSensitiveData,
      );

    // Return user data and tokens
    return { userData: userWithoutSensitiveData, accessToken, refreshToken };
  }

  async verifyUser(decoded: TokenPayloadTypes): Promise<userTypes> {
    // get the userData form the cache
    const isThereisUserData: userTypes | null =
      await this.userHelper.getUserRedisCacheData(decoded._id);

    let userData;
    if (isThereisUserData) {
      // If user data is in the cache
      userData = isThereisUserData;
    } else {
      // If user data is not in the cache

      userData = await User.findById(decoded._id)
        .select("-password -refreshToken")
        .lean<userTypes>();
      if (userData) {
        // chache the data again;
        this.userHelper.cacheTheUserDataById(
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

    if (!currentUser.refreshToken || currentUser.refreshToken.trim() === "") {
      throw new ApiError(401, "You are authorized to perform this action");
    }

    // compare database refreshToken and client token
    if (currentUser.refreshToken === refreshTokenFromClient) {
      const userRedisCacheData =
        await this.userHelper.getUserRedisCacheData(userId);

      let userDataWithoutSensativeData;

      if (userRedisCacheData) {
        // If the data is already in the cahche
        userDataWithoutSensativeData = userRedisCacheData;
      } else {
        // If the data is not in the cache
        userDataWithoutSensativeData = await User.findById(currentUser)
          .select("-password -refreshToken")
          .lean<userTypes>();
      }
      if (!userDataWithoutSensativeData)
        throw new ApiError(400, "UserDetails not found by ID");
      const { refreshToken, accessToken } =
        await this.userHelper.generateAccessAndRefreshTokensAndCacheTheUserDataInRedis(
          userDataWithoutSensativeData?._id,
          userDataWithoutSensativeData,
        );
      return {
        refreshToken,
        accessToken,
      };
    } else {
      throw new ApiError(
        403,
        "You do not have permission for the requested action",
        ["while refreshing the token"],
      );
    }
  }

  /**
   * Logs out the user by clearing their refresh token.
   * @param userId - The ID of the user to log out.
   */
  async logoutUser(userId: string): Promise<void> {
    if (!userId || userId.trim() === "") {
      console.error("No userId found");

      throw new ApiError(404, "userId doesnot found");
    }
    const user = await User.findById(userId);

    if (!user) {
      console.error("No user found with given user id");

      throw new ApiError(404, "User not found");
    }
    // Optional: Check if refreshToken exists before clearing
    if (user.refreshToken) {
      user.set("refreshToken", undefined, { strict: false });
      await user.save({ validateBeforeSave: false });
    } else {
      throw new ApiError(400, "User is already logged out");
    }
  }



  /**
 * Updates and stores important user profile details in the database.
 *
 * This method follows these steps:
 *
 * 1. Validates the input payload to ensure required fields are present:
 *    - userId, age, country, and gender are mandatory.
 *    - phoneNumber and relationShipStatus are optional but included if provided.
 *
 * 2. Retrieves the user by the given userId.
 *    - If the user is not found, throws a 404 error.
 *
 * 3. Updates the user document with the provided details.
 *    - age, country, and gender are always updated.
 *    - phoneNumber and relationShipStatus are conditionally updated if provided and non-empty.
 *
 * 4. Saves the updated user document to the database.
 *
 * 5. Re-fetches the updated user, excluding sensitive fields (e.g., password, refreshToken).
 *    - Ensures the returned data is safe and clean.
 *
 * 6. Caches the updated user data by userId.
 *    - Helps optimize future lookups by reducing database queries.
 *
 * 7. Returns a structured object containing only the important details needed on the frontend or client.
 *
 * @param userImportantDetails - Object containing user's age, country, gender, optional phone number,
 *                               and relationship status along with userId.
 * @returns A Promise that resolves to the updated user important details or throws an error.
 *
 * @throws ApiError if input is invalid, user is not found, or database update fails.
 */
  async addUserImportantDetails(
    userImportantDetails: UserImpDetails,
  ): Promise<UserImpDetails | null> {
    // 1. Validate input payload
    if (!userImportantDetails) {
      throw new ApiError(400, "Request body is required");
    }
    const { userId, age, country, gender, phoneNumber, relationshipStatus } = userImportantDetails;
    if (!userId) {
      throw new ApiError(400, "userId is required");
    }
    if (age == null) {
      throw new ApiError(400, "age is required");
    }
    if (!country) {
      throw new ApiError(400, "country is required");
    }
    if (!gender) {
      throw new ApiError(400, "gender is required");
    }

    // 2. Fetch the user
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // 3. Apply all updates at once
    user.age = age;
    user.country = country;
    user.gender = gender.toLowerCase();

    if (relationshipStatus && relationshipStatus.trim() != "") {
      // If there is relationship status send by the user then saved to the database
      user.relationShipStatus = relationshipStatus;
    }

    if (phoneNumber && phoneNumber.trim() != "") {
      // If there is phoneNumber sent by user then saved to the database
      user.phoneNumber = phoneNumber;
    }

    // Save the user 
    await user.save();

    // 4. Retrieve the updated document (excluding sensitive fields)
    const updated = await User.findById(userId)
      .select("-password -refreshToken")
      .lean<userTypes>();
    if (!updated) {
      throw new ApiError(500, "Failed to retrieve updated user data");
    }

    // 5. Cache it
    await userHelper.cacheTheUserDataById(userId, JSON.stringify(updated));

    // 6. Return just the important details
    const result: UserImpDetails = {
      age: Number(updated.age),
      country: updated.country!,
      gender: updated.gender!,
      relationshipStatus: updated.relationShipStatus ? updated.relationShipStatus : "Not-specified",
      phoneNumber: updated.phoneNumber ? updated.phoneNumber : "Not-provided",
      userId, // Optional
    };
    return result;
  }
}

// Create an instance of the UserService
const userService = new UserService();

// Export the service instance
export default userService;

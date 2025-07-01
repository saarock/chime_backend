// src/services/User.services.ts
import type { TokenPayload } from "google-auth-library";
import { User, UserReport } from "../../../models/index.js";
import type {
  TokenPayloadTypes,
  User as userTypes,
  UserLoginWithGoogleDetails,
  UserImpDetails,
  Report,
} from "../../../types/index.js";
import verifyGoogleToken from "../../../utils/verifyGoogleToken.js";
import ApiError from "../../../utils/ApiError.js";
import userHelper from "../../../helpers/user.helper.js";

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

  /**
   * This method is responsible for verifying user that the current user is valid or not.
   * @param {TokenPayloadTypes} 
  _id: string;  // User ID
  email: string;  // User email
  iat: number;    // Issued at (timestamp)
  exp: number;    // Expiration time (timestamp)
   * @returns  {Promise<userTypes>} - user public data
   */
  async verifyUser(decoded: TokenPayloadTypes): Promise<userTypes> {
    console.log(decoded + " this is the deocode id ");

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

    // If user not found then we declared an-authorized
    if (!userData) throw new ApiError(401, "You are not allowed to visit this page.");

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
      // If user is not avaialble on the database then we decleared the 401 status code
      throw new ApiError(401, "User not found");
    }

    if (!currentUser.refreshToken || currentUser.refreshToken.trim() === "") {
      throw new ApiError(401, "You are not authorized to perform this action");
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
        401,
        "You do not have permission for the requested action",
        ["while refreshing the token"],
      );
    }
  }

  /**
   * Logs out the user by clearing their refresh token.
   * @param userId - The ID of the user to log out.
   */
  async logoutUser(userId?: string): Promise<void> {
    if (!userId || userId.trim() === "") {
      console.error("No userId found");

      throw new ApiError(404, "userId doesnot found");
    }
    const user = await User.findById(userId).select('refreshToken');

    if (!user) {
      console.error("No user found with given user id");
      throw new ApiError(404, "User not found");
    }

    // Optional: Check if refreshToken exists before clearing
    if (user.refreshToken) {
      user.set("refreshToken", undefined, { strict: false });
      await user.save({ validateBeforeSave: false });
      return;
    } else {
      throw new ApiError(400, "User is already logged out.");
    }
  }



  /**
   * Updates user profile details with only provided fields.
   *
   * Allows partial updates — users can update one or more fields without
   * sending all required fields every time.
   *
   * Steps:
   * 1. Validate `userId` presence (mandatory).
   * 2. Fetch user by `userId`.
   * 3. If `userName` provided, check uniqueness (throws error if taken).
   * 4. For each field in the input, update the user document **only if provided and valid**.
   * 5. Save updated user.
   * 6. Return sanitized updated user details.
   *
   * @param userImportantDetails Partial user info with userId.
   * @returns Updated user important details.
   * @throws ApiError if user not found or username conflict.
   */
  async addUserImportantDetails(
    userImportantDetails: Partial<UserImpDetails> & { userId: string | undefined },
  ): Promise<UserImpDetails | null> {
    if (!userImportantDetails) {
      throw new ApiError(400, "Request body is required");
    }

    const {
      userId,
      age,
      country,
      gender,
      phoneNumber,
      relationshipStatus,
      userName,
    } = userImportantDetails;

    if (!userId) {
      throw new ApiError(400, "userId is required");
    }

    // Fetch user
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Check username uniqueness if username is provided and different
    if (userName && userName.trim() !== "" && userName !== user.userName) {
      const existingUser = await User.findOne({ userName });
      if (existingUser) {
        throw new ApiError(400, "User name already exists");
      }
      user.userName = userName.trim();
    }

    // Update fields only if they are defined and valid
    if (age !== undefined && age !== null) {
      if (Number(age) < 18 || Number(age) > 100) {
        // Validate the age
        throw new ApiError(400, "Age must be between 18 and 100");
      }
      user.age = age;
    }

    if (country && country.trim() !== "") {
      user.country = country.trim();
    }

    if (gender && gender.trim() !== "") {
      user.gender = gender.trim();
    }

    if (relationshipStatus && relationshipStatus.trim() !== "") {
      user.relationShipStatus = relationshipStatus.trim();
    }

    if (phoneNumber && phoneNumber.trim() !== "") {
      user.phoneNumber = phoneNumber.trim();
    }
    console.log(user.phoneNumber + "  is the phone-number");

    console.log("[DEBUG] user object in addUserImportantDetails:", user);
    console.log("[DEBUG] typeof user.save:", typeof user?.save);

    // Save user with updated fields
    await user.save();

    // Retrieve updated user without sensitive info
    const updated = await User.findById(userId)
      .select("-password -refreshToken")
      .lean<userTypes>();

    if (!updated) {
      throw new ApiError(500, "Failed to retrieve updated user data");
    }

    // Cache updated user
    await userHelper.cacheTheUserDataById(userId, JSON.stringify(updated));

    // Return updated important details (fallbacks if missing)
    return {
      userId,
      age: Number(updated.age),
      country: updated.country || "Not specified",
      gender: updated.gender || "Not specified",
      relationshipStatus: updated.relationShipStatus || "Not specified",
      phoneNumber: updated.phoneNumber || "Not provided",
      userName: updated.userName || "Not provided",
    };
  }
  // Service method to handle the report 
  async reportUser(userId: string | undefined, reportInfo: Report) {

    if (!userId) {
      // If there is no currnet partner id throw new error
      throw new ApiError(400, "userId is required to report");

    }

    // Check the availability of the partner
    if (!reportInfo.reportedUserId || reportInfo.reportedUserId === "") {
      throw new ApiError(400, "partnerId is required to report");
    }

    if (!["like", "dislike"].includes(reportInfo.type)) {
      throw new ApiError(400, "Invalid report type. Must be 'like' or 'dislike'.");
    }

    await UserReport.create({
      reportedBy: userId,
      reportedUser: reportInfo.reportedUserId,
      type: reportInfo.type,
    });

    return;
  }

}

// Create an instance of the UserService
const userService = new UserService();

// Export the service instance
export default userService;

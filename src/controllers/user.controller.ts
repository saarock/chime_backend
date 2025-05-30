// User controller
import type { TokenPayloadTypes } from "types/index.js";
import { userService } from "../services/index.js";
import { ApiError, ApiResponse, asyncHandler } from "../utils/index.js";

// Login from google controller
export const loginFromTheGoogle = asyncHandler(async (req, res, _) => {
  const { credential, clientId } = req.body;


  const { userData, refreshToken, accessToken } =
    await userService.loginWithGoogle({
      credential: credential,
      clientId: clientId,
    });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { userData, refreshToken, accessToken },
        "Login From Google successfull.",
      ),
    );
});
// verifyUser controller
export const verifyUser = asyncHandler(async (req, res, _) => {
  const userData = await userService.verifyUser(req.user as TokenPayloadTypes);
  return res
    .status(200)
    .json(new ApiResponse(200, { userData }, "user-verified"));
});

// generate new access and refresh token by refresh token when the access token is valid
export const generateAnotherAccessAndRefreshToken = asyncHandler(
  async (req, res, _) => {
    const clientToken = req.body;
    const userId = req.userId;

    const { refreshToken, accessToken } =
      await userService.generateAnotherRefreshTokenAndAccessTokenAndChangeTheDatabaseRefreshToken(
        userId,
        clientToken.refreshToken,
      );

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { refreshToken, accessToken },
          "Token refreshed successfully",
        ),
      );
  },
);

// Logout user
export const logOutUser = asyncHandler(async (req, res, _) => {
  const { userId } = req.body;
  await userService.logoutUser(userId);
  return res
    .status(200)
    .json(new ApiResponse(200, null, "User Logged Out successfully."));
});



export const addUserImportantData = asyncHandler(async (req, res, _) => {
  const { age, country, gender, userId } = req.body;
  console.log(age);
  console.log(country);
  console.log(gender);

  const userUpdateImportantDetails = await userService.addUserImportantDetails({
    age: age,
    country: country,
    gender: gender,
    userId: userId
  });

  return res
    .status(200)
    .json(new ApiResponse(200, userUpdateImportantDetails, "Details updated"));

});

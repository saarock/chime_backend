// User controller
import type { TokenPayloadTypes } from "types/index.js";
import { userService } from "../services/databaseService/index.js";
import { ApiResponse, asyncHandler } from "../utils/index.js";

// Login from google controller
export const loginFromTheGoogle = asyncHandler(async (req, res, _) => {
  // Access the crendential and clientId from the body that clinet have sent for oAuth login
  const { credential, clientId } = req.body;

  // After accessing hte credentials and clientId call the service to handle the oAuth login
  const { userData, refreshToken, accessToken } =
    await userService.loginWithGoogle({
      credential: credential,
      clientId: clientId,
    });

  // If the login is successfull the sending the response to the client within the cookies also
  return res
    .status(200)
    .cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 5000,
    })
    .cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for refresh token
    })
    .json(new ApiResponse(200, { userData }, "Login From Google successfull."));
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
    const refreshTokenByUser = req.cookies.refreshToken;
    const userId = req.userId;

    const { refreshToken, accessToken } =
      await userService.generateAnotherRefreshTokenAndAccessTokenAndChangeTheDatabaseRefreshToken(
        userId,
        refreshTokenByUser,
      );

    return res
      .status(200)
      .cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 5000,
      })
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for refresh token
      })
      .json(new ApiResponse(200, null, "Token refreshed successfully"));
  },
);

// Logout user
export const logOutUser = asyncHandler(async (req, res, _) => {
  const { userId } = req.body;
  await userService.logoutUser(userId);
  res.clearCookie("accessToken", {
    httpOnly: true,
    sameSite: "strict",
    secure: false, // true in production
    path: "/",
  });
  res.clearCookie("refreshToken", {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
  });

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
    userId: userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, userUpdateImportantDetails, "Details updated"));
});

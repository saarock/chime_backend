// Import necessary types and utilities
import type { TokenPayloadTypes } from "types/index.js";
import { userService } from "../../services/databaseService/api/index.js";
import { ApiResponse, asyncHandler } from "../../utils/index.js";
import type { CookieOptions } from "express";

/**
 * cookieHelper
 * ------------
 * Utility function to provide consistent cookie options
 * for access and refresh tokens.
 */
const cookieHelper = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const accessTokenOptions: CookieOptions = {
    httpOnly: true, // Prevent access from client-side JS
    secure: isProduction, // HTTPS only in production
    sameSite: "lax", // CSRF protection
    // maxAge: 5 * 60 * 1000, // 5 minutes (short lifespan for access token)
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days [For testing purpose in the mobile flutter]

  };

  const refreshTokenOptions: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };

  return {
    accessTokenOptions,
    refreshTokenOptions,
  };
};

/**
 * loginFromTheGoogle
 * ------------------
 * Handles login via Google OAuth. Receives the credential and clientId from client,
 * verifies them via userService, and sets access/refresh tokens in cookies.
 */
export const loginFromTheGoogle = asyncHandler(async (req, res, _) => {
  const { credential, clientId } = req.body;
  console.log("request came for Google login");

  const { userData, refreshToken, accessToken } =
    await userService.loginWithGoogle({ credential, clientId });

  const { accessTokenOptions, refreshTokenOptions } = cookieHelper();

  return res
    .status(200)
    .cookie("accessToken", accessToken, accessTokenOptions)
    .cookie("refreshToken", refreshToken, refreshTokenOptions)
    .json(new ApiResponse(200, { userData, accessToken }, "Login from Google successful."));
});

/**
 * verifyUser
 * ----------
 * Verifies the authenticated user based on JWT payload (set by middleware).
 */
export const verifyUser = asyncHandler(async (req, res, _) => {
  const userData = await userService.verifyUser(req.user as TokenPayloadTypes);
  return res
    .status(200)
    .json(new ApiResponse(200, { userData }, "User verified."));
});

/**
 * generateAnotherAccessAndRefreshToken
 * ------------------------------------
 * Generates new access and refresh tokens when the access token is expired
 * but the refresh token is still valid.
 */
export const generateAnotherAccessAndRefreshToken = asyncHandler(
  async (req, res, _) => {
    // Access the cookie to validate the database refresh token vs user sent token same or not 
    const refreshTokenByUser = req.cookies.refreshToken;
    const userId = req.userId;

    const { accessToken, refreshToken } =
      await userService.generateAnotherRefreshTokenAndAccessTokenAndChangeTheDatabaseRefreshToken(
        userId,
        refreshTokenByUser,
      );

    const { accessTokenOptions, refreshTokenOptions } = cookieHelper();

    return res
      .status(200)
      .cookie("accessToken", accessToken, accessTokenOptions)
      .cookie("refreshToken", refreshToken, refreshTokenOptions)
      .json(new ApiResponse(200, null, "Token refreshed successfully"));
  },
);

/**
 * logOutUser
 * ----------`
 * Clears the user's authentication cookies and logs them out.
 */
export const logOutUser = asyncHandler(async (req, res, _) => {
  const userId = req.userId;
  await userService.logoutUser(userId);

  // Clear cookies safely
  const clearOptions: CookieOptions = {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };

  res.clearCookie("accessToken", clearOptions);
  res.clearCookie("refreshToken", clearOptions);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "User logged out successfully."));
});

/**
 * addUserImportantData
 * --------------------
 * Adds or updates additional user details (e.g., age, country, gender)
 * after login or registration.
 */
export const addUserImportantData = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const details = {
    ...req.body,
    userId,
  };

  const updatedUser = await userService.addUserImportantDetails(details);

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Details updated"));
});

/**
 * This controller fuction is responsible for repor
 * 
 */
export const likeDislike = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { reportedUserId, type } = req.body;
  await userService.reportUser(userId, { reportedUserId, type });
  // Generate dynamic message
  const actionMessage =
    type === "like"
      ? "Thank you! You've liked the user successfully."
      : "Your report has been submitted. Our team will review it shortly.";

  // Respond to client
  return res.status(200).json(
    new ApiResponse(200, { message: actionMessage }, "Report processed successfully.")
  );

});



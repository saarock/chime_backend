// User controller
import type { TokenPayloadTypes } from "types/index.js";
import { userService } from "../services/index.js";
import { ApiError, ApiResponse, asyncHandler } from "../utils/index.js";

// Login from google controller
export const loginFromTheGoogle = asyncHandler(async (req, res, _) => {
  const { credentials, clientId } = req.body;
  console.log(credentials);
  console.log(clientId);

  const { userData, refreshToken, accessToken } =
    await userService.loginWithGoogle({
      credentials: credentials,
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

    const { refreshToken, accessToken, userData } =
      await userService.generateAnotherRefreshTokenAndAccessTokenAndChangeTheDatabaseRefreshToken(
        userId,
        clientToken.refreshToken,
      );
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { refreshToken, accessToken, userData },
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

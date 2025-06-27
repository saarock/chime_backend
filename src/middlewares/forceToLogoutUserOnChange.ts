import { ApiError, asyncHandler } from "../utils/index.js";
import type { Request, Response } from "express";
import { User } from "../models/index.js";

/**
 * Middleware to enforce logout if the admin has changed any critical user data.
 * This is useful for scenarios like:
 * - Role changes
 * - User being blocked
 * - Admin resetting user tokens or credentials
 *
 * If the refreshToken is missing in the DB, we assume the session is invalid and
 * force the user to re-authenticate.
 */
const forceLogoutIfAnyUserDetailChange = asyncHandler(
  async (req: Request, res: Response, next) => {
    const userId = req.userId;

    // Ensure user ID is present in request context (set by previous middleware)
    if (!userId) {
      throw new ApiError(400, "User ID not found in request context.");
    }

    // Find user in the database
    const user = await User.findById(userId).select("refreshToken role");

    console.log(user.refreshToken  + ' this is the refreshToken');
    
    // If user not found or forcibly logged out (refreshToken removed), reject the request
    if (!user || !user.refreshToken || user.refreshToken.trim() === "") {
      throw new ApiError(
        401,
        "Some of your data has been changed by the admin. Please visit the app and  log in again."
      );
    }

    // Proceed with request
    next();
  }
);

export default forceLogoutIfAnyUserDetailChange;

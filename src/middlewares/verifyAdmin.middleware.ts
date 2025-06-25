// Import all the necessary dependencies here
import type { NextFunction, Request, Response } from "express";
import { ApiError, asyncHandler, token } from "../utils/index.js";

/**
 * Middleware to verify admin access using access + refresh tokens.
 * Handles:
 *  - Expired access token
 *  - Role check
 */
const verifyAdmin = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    // Step 1: Get tokens from HTTP-only cookies
    const accessToken = req.cookies?.accessToken;

    // Step 2: Access token must exist; if not, redirect to login
    if (!accessToken) {
        return res.redirect("http://localhost:5173/login");
    }

    // Step 3: Try verifying access token
    const decoded = token.verifyAccessToken(accessToken);
    if (decoded?.role.toString().trim() !== "admin") {
        throw new ApiError(401, "Unauthorized request");
    }
    
    // Step 5: Save decoded user to request and continue
    req.user = decoded;
    console.log(decoded._id);
    
    req.userId = decoded._id;
    return next();
});

export default verifyAdmin;

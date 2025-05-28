//  Import all the necessary dependencies here
import type { JwtPayload } from "jsonwebtoken";
import ApiError from "./ApiError.js";
import jwt from "jsonwebtoken";

class Token {
  /**
   * Verify the provided refresh token using the REFRESH_TOKEN_SECRET.
   * Throws ApiError if token is missing, secret missing, or token is invalid/expired.
   *
   * @param {string} refreshToken - The refresh token to verify.
   * @returns {JwtPayload} Decoded token payload if valid.
   */
  verifyRefreshToken(refreshToken: string): JwtPayload {
    const jwtSecret = process.env.REFRESH_TOKEN_SECRET;

    // Check if token and secret are present and not just whitespace
    if (
      !refreshToken ||
      !jwtSecret ||
      !jwtSecret.trim() ||
      !refreshToken.trim()
    ) {
      throw new ApiError(
        400,
        "Secret key not found",
        ["Key NotFound", "Server Error"],
        "At auth.middleware.js file line number 20 to 21",
      );
    }

    try {
      // Verify the token using jsonwebtoken's verify method
      const decoded = jwt.verify(refreshToken, jwtSecret) as JwtPayload;

      // Additional sanity check if decode failed silently (rare)
      if (!decoded) {
        console.log("refreshToken expired***");
      }

      return decoded;
    } catch (error) {
      throw new ApiError(
        401,
        "Unauthorized request",
        ["Unauthorized request"],
        "At token.js file line number 100",
        "token_expired",
      );
    }
  }

  /**
   * Verify the provided access token using the ACCESS_TOKEN_SECRET.
   * Throws ApiError if token is missing, secret missing, or token is invalid/expired.
   *
   * @param {string} accessToken - The access token to verify.
   * @returns {JwtPayload} Decoded token payload if valid.
   */
  verifyAccessToken(accessToken: string): JwtPayload {
    const jwtSecret = process.env.ACCESS_TOKEN_SECRET;

    // Check if token and secret are present and not just whitespace
    if (
      !accessToken ||
      !jwtSecret ||
      !jwtSecret.trim() ||
      !accessToken.trim()
    ) {
      throw new ApiError(
        400,
        "Secret key not found",
        ["Key NotFound", "Server Error"],
        "At token.js file line number 30 to 31",
      );
    }

    try {
      // Verify the access token
      const decoded = jwt.verify(accessToken, jwtSecret) as JwtPayload;

      // Check if decode failed silently
      if (!decoded) {
        console.log("accessToken expired or invalid*");
      }

      return decoded;
    } catch (error) {
      throw new ApiError(
        401,
        "Unauthorized request",
        ["Unauthorized request"],
        "At token.js file line number 40 to 41",
        "token_expired",
      );
    }
  }
}

const token = new Token();
export default token;

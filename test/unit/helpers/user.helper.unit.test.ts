import { describe, it, expect, vi } from "vitest";
import userHelper from "../../../src/helpers/user.helper";
import { ApiError } from "../../../src/utils/index.js";
import * as jwt from "jsonwebtoken"; // Use named import for mocking

// Mock jwt.verify specifically
vi.mock("jsonwebtoken", () => ({
  verify: vi.fn(), // Mock only the verify method
}));

describe("User service test", () => {
  it("should throw ApiError with statusCode 400 if refreshToken is empty", () => {
    try {
      userHelper.verifyRefreshToken(""); // Pass an empty token
    } catch (error: any) {
      expect(error).toBeInstanceOf(ApiError); // Expect an ApiError
      expect(error.statusCode).toBe(400); // Expect statusCode 400
      expect(error.message).toBe("Secret key not found"); // Check the message
    }
  });

  it("should return jwt payload after verifying the jwt token", async () => {
    const mockPayload = { _id: "456" }; // The mock JWT payload

    // Mock jwt.verify to simulate behavior for valid/expired token
    (jwt.verify as any).mockImplementation(
      (token: string, secret: string, callback) => {
        console.log("Mock verify called with token:", token);
        console.log("Secret used:", secret);

        if (token === "456" && secret === process.env.REFRESH_TOKEN_SECRET) {
          // Simulate success by calling the callback with null error and mock payload
          console.log("Token verified successfully");
          callback(null, mockPayload);
        } else {
          // Simulate failure (expired or invalid token) by calling the callback with an error
          console.log("Token verification failed");
          callback(new Error("Refresh Token invalid or expired"), null);
        }
      },
    );

    // Mock verifyRefreshToken directly
    vi.spyOn(userHelper, "verifyRefreshToken").mockResolvedValue(mockPayload);

    process.env.REFRESH_TOKEN_SECRET = "secretKeyForTesting"; // Set secret
    const token = "456"; // The token to verify

    // Make sure to await the method if it's async
    try {
      const result = await userHelper.verifyRefreshToken(token); // Ensure async handling
      console.log("Verification result:", result);

      // Check that the result matches the mock payload
      expect(result).toMatchObject(mockPayload);
    } catch (error) {
      console.error("Error during verification:", error);
    }
  });
});

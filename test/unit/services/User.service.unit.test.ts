import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { userService } from "../../../src/services/databaseService/index.js";
import verifyGoogleToken from "../../../src/utils/verifyGoogleToken.js";
import User from "../../../src/models/User.model.js";
import RedisMock from "ioredis-mock";
import userHelper from "../../../src/helpers/user.helper.js";

vi.mock("../../../src/utils/verifyGoogleToken.js");
vi.mock("../../../src/models/User.model.js");
vi.mock("../../../src/helpers/user.helper.js");

const mockUserHelper = {
  generateAccessAndRefreshTokensAndCacheTheUserDataInRedis: vi.fn(),
  cacheTheUserDataById: vi.fn(),
};

describe("UserService - loginWithGoogle", () => {
  let client;
  beforeAll(async () => {
    client = new RedisMock();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(
      userHelper,
      "generateAccessAndRefreshTokensAndCacheTheUserDataInRedis",
    ).mockResolvedValue({
      accessToken: "new-access",
      refreshToken: "new-refresh",
    });
    // Override private #userHelper
    (userService as any)["#userHelper"] = mockUserHelper;
  });

  it("should throw error if google token is invalid", async () => {
    (verifyGoogleToken as any).mockResolvedValue(undefined);

    await expect(
      userService.loginWithGoogle({ credential: "invalid", clientId: "id" }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Google Payload Not Found",
    });
  });

  it("should throw error if email is missing", async () => {
    (verifyGoogleToken as any).mockResolvedValue({ name: "John Doe" });

    await expect(
      userService.loginWithGoogle({ credential: "token", clientId: "id" }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Email is required!",
    });
  });

  it("should throw error if name is missing", async () => {
    (verifyGoogleToken as any).mockResolvedValue({ email: "john@example.com" });

    await expect(
      userService.loginWithGoogle({ credential: "token", clientId: "id" }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "fulName is required",
    });
  });

  it("should throw error if user not found after creation", async () => {
    const mockUserGoogleData = {
      email: "new@example.com",
      name: "New User",
      picture: "pic.jpg",
    };

    const mockCreatedUser = { _id: "456" };

    (verifyGoogleToken as any).mockResolvedValue(mockUserGoogleData);

    (User.findOne as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });

    (User.create as any).mockResolvedValue(mockCreatedUser);

    (User.findById as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });

    await expect(
      userService.loginWithGoogle({ credential: "token", clientId: "id" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "UserDetails not found by ID",
    });
  });

  it("should generate new Refresh and Access tokens and cache the data if the user already exists if cann't cache the data then send the appropriate error", async () => {
    const mockUserGoogleData = {
      email: "new@example.com",
      name: "New User",
      picture: "pic.jpg",
    };

    const mockCreatedUser = {
      _id: "456",
      email: "new@example.com",
      fullName: "New User",
      profilePicture: "pic.jpg",
    };

    const mockUser = {
      _id: "456",
      email: "new@example.com",
      fullName: "New User",
      profilePicture: "pic.jpg",
      generateAccessToken: vi.fn().mockResolvedValue("new-access"),
      generateRefreshToken: vi.fn().mockResolvedValue("new-refresh"),
      save: vi.fn().mockResolvedValue(true), // Mock save method
    };

    const mockUserDataWithoutSensitive = {
      _id: "456",
      email: "new@example.com",
      fullName: "New User",
      profilePicture: "pic.jpg",
    };

    // Mock external dependencies
    (verifyGoogleToken as any).mockResolvedValue(mockUserGoogleData);
    (User.findOne as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockCreatedUser),
    });
    (User.findById as any).mockResolvedValue(mockUser);

    // Mock the helper function to generate and cache tokens using the mock Redis client
    mockUserHelper.generateAccessAndRefreshTokensAndCacheTheUserDataInRedis.mockResolvedValue(
      {
        accessToken: "new-access",
        refreshToken: "new-refresh",
      },
    );

    try {
      // Call the function to test
      const result = await userService.loginWithGoogle({
        credential: "token",
        clientId: "id",
      });

      // Ensure the result resolves correctly with access and refresh tokens
      expect(result).toEqual({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        userData: mockUserDataWithoutSensitive,
      });
    } catch (error) {
      console.error(error);
    }
  });

  it("should return the user-redis-cache-data", async () => {
    (userHelper.getUserRedisCacheData as any) = vi.fn().mockResolvedValue({
      _id: "456",
      email: "new@example.com",
      fullName: "New User",
    });

    const result = await userHelper.getUserRedisCacheData("456");
    expect(result).toMatchObject({
      _id: "456",
      email: "new@example.com",
      fullName: "New User",
    });
  });

  it("should return null if with given id the data doesnot match", async () => {
    (userHelper.getUserRedisCacheData as any) = vi.fn().mockResolvedValue(null);

    const result = await userHelper.getUserRedisCacheData("4569");
    expect(result).toBeNull();
  });

  it("should logout user and delete the refresh token from the database", async () => {
    const user = {
      _id: "123",
      email: "test@example.com",
      refreshToken: "fake-refresh-token",
      set: vi.fn().mockReturnThis(),
      save: vi.fn().mockResolvedValue(true),
    };

    await (User.findById as any).mockResolvedValue(user);
    await userService.logoutUser("123");
    expect(user.set).toHaveBeenCalledWith("refreshToken", undefined, {
      strict: false,
    });
    expect(user.save).toHaveBeenCalled();
  });
});

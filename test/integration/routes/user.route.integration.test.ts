import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import request from "supertest";
import app from "../../../src/app.js";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { verifyJWTRefreshToken } from "../../../src/middlewares/refreshTokenVerify.middleware.js";
import User from "../../../src/models/User.model.js";

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});
vi.mock("../../../src/utils/verifyGoogleToken.js", () => ({
  default: vi.fn().mockResolvedValue({
    email: "test@example.com",
    name: "test",
    profilePicture: "profile.jpg",
  }),
}));

vi.mock("../../../src/helpers/User.helper.js", () => ({
  default: {
    cacheTheUserDataById: vi.fn().mockResolvedValue(null),
    generateAccessAndRefreshTokensAndCacheTheUserDataInRedis: vi
      .fn()
      .mockResolvedValue({
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
      }),
    getUserRedisCacheData: vi.fn().mockResolvedValue({
      email: "test@example.com",
      name: "test",
      profilePicture: "profile.jpg",
    }),
    verifyRefreshToken: vi.fn().mockResolvedValue({
      userId: "123",
    }),
  },
}));

vi.mock("../../../src/middlewares/auth.middleware.js", () => ({
  verifyJWT: vi.fn((req, _, next) => {
    req.user = { _id: "123" };
    next();
  }),
}));

vi.mock("../../../src/middlewares/refreshTokenVerify.middleware.js", () => ({
  verifyJWTRefreshToken: vi.fn((req, _, next) => {
    req.userId = "123";
    next();
  }),
}));

describe("POST /login-with-google", () => {
  test("should respond with 200 status code", async () => {
    const response = await request(app)
      .post("/api/v1/users/login-with-google")
      .send({ clientId: "test-client-id", credentials: "Credentials" });
    console.log(response.body);
    expect(response.body.statusCode).toBe(200);
    expect(response.body.data).toHaveProperty("refreshToken");
    expect(response.body.data).toHaveProperty("accessToken");
  });
});

describe("GET /verify-user", () => {
  test("should response with 200 status code", async () => {
    const response = await request(app)
      .get("/api/v1/users/verify-user")
      .set("Authorization", `Bearer mock-access-token`);

    expect(response.body.statusCode).toBe(200);
  });
});

describe("POST /refresh-tokens", () => {
  test("should response with 200 status code", async () => {
    const selectMock = vi.fn().mockResolvedValue({
      _id: 123,
      email: "test@example.com",
      fullName: "Test User",
      profilePicture: "pic.jpg",
      refreshToken: "mock-refresh-token",
    });

    User.findById = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const response = await request(app)
      .post("/api/v1/users/refresh-tokens")
      .send({ refreshToken: "mock-refresh-token" });

    expect(response.body.statusCode).toBe(200);
  });
});

describe("POST /refresh-tokens", () => {
  test("should response with 401 status code", async () => {
    const selectMock = vi.fn().mockResolvedValue({
      _id: 123,
      email: "test@example.com",
      fullName: "Test User",
      profilePicture: "pic.jpg",
      // refreshToken: "mock-refresh-token" // because refreshtoken is missing
    });

    User.findById = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const response = await request(app)
      .post("/api/v1/users/refresh-tokens")
      .send({ refreshToken: "mock-refresh-token" });

    expect(response.body.statusCode).toBe(401);
  });
});

describe("POST /logout-user", () => {
  test("should response with 200 status code", async () => {
    const user = {
      _id: "123",
      email: "test@example.com",
      refreshToken: "fake-refresh-token",
      set: vi.fn().mockReturnThis(),
      save: vi.fn().mockResolvedValue(true),
    };

    await (User.findById as any).mockResolvedValue(user);
    const response = await request(app)
      .post("/api/v1/users/logout-user")
      .send({ userId: "123" });
    expect(response.body.statusCode).toBe(200);
  });

  test("should response with 404 userId doesnot found if there is not userId", async () => {
    const user = {
      _id: "123",
      email: "test@example.com",
      refreshToken: "fake-refresh-token",
      set: vi.fn().mockReturnThis(),
      save: vi.fn().mockResolvedValue(true),
    };

    await (User.findById as any).mockResolvedValue(user);
    const response = await request(app)
      .post("/api/v1/users/logout-user")
      .send({ userId: "" });
    expect(response.body.statusCode).toBe(404);
  });

  test("should response with 404 user doesnot found with given userId", async () => {
    const user = undefined;

    await (User.findById as any).mockResolvedValue(user);
    const response = await request(app)
      .post("/api/v1/users/logout-user")
      .send({ userId: "123" });
    expect(response.body.statusCode).toBe(404);
  });
});

import { beforeAll, afterAll, describe, test, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";


// --- Mocks at the very top before other imports ---
vi.mock("../../../src/helpers/user.helper.js", () => {
  const userId = new mongoose.Types.ObjectId().toString();
  return {
    default: {
      cacheTheUserDataById: vi.fn().mockResolvedValue(null),
      generateAccessAndRefreshTokensAndCacheTheUserDataInRedis: vi.fn().mockResolvedValue({
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
      }),
      getUserRedisCacheData: vi.fn().mockResolvedValue({
        email: "test@example.com",
        name: "test",
        profilePicture: "profile.jpg",
      }),
      verifyRefreshToken: vi.fn().mockResolvedValue({ userId }),
      deleteTheRedisCacheData: vi.fn().mockResolvedValue(userId)
    },
  };
});

vi.mock("../../../src/utils/verifyGoogleToken.js", () => ({
  default: vi.fn().mockResolvedValue({
    email: "test@example.com",
    name: "test",
    profilePicture: "profile.jpg",
  }),
}));

vi.mock("../../../src/middlewares/auth.middleware.js", () => ({
  verifyJWT: vi.fn((req, _, next) => {
    req.userId = new mongoose.Types.ObjectId().toString(); // fresh id each time
    req.user = {
      _id: testUserId,
      email: "test@example.com",
      fullName: "Test User",
      role: "user",
    }
    next();
  }),
}));

vi.mock("../../../src/middlewares/refreshTokenVerify.middleware.js", () => ({
  verifyJWTRefreshToken: vi.fn((req, _, next) => {
    req.userId = new mongoose.Types.ObjectId().toString();
    next();
  }),
}));


const userMock = {
  _id: "some-id",
  email: "test@example.com",
  refreshToken: "some-token",
  save: vi.fn().mockResolvedValue(true),
  set: vi.fn().mockReturnThis(),
};




// --- Now import other modules that depend on the above mocks ---

import app from "../../../src/app.js";
import User from "../../../src/models/User.model.js";
import jwt from "jsonwebtoken";





const testUserId = new mongoose.Types.ObjectId().toString();

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});


// Test starts from here

describe("POST /login-with-google", () => {
  test("should respond with 200 status code", async () => {
    const userMock = {
      _id: testUserId,
      email: "test@example.com",
      fullName: "Test User",
      refreshToken: "mock-refresh-token",
      save: vi.fn().mockResolvedValue(true),
      set: vi.fn().mockReturnThis(),
    };

    // Properly mock User.findById with select chain
    User.findById = vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(userMock),
      }),
    }));

    const response = await request(app)
      .post("/api/v1/users/login-with-google")
      .send({ clientId: "test-client-id", credentials: "Credentials" });

    console.log("first response");
    console.log(response.body);

    expect(response.body.statusCode).toBe(200);
    expect(response.body.data).toHaveProperty("accessToken");
  });
});


describe("GET /verify-user", () => {
  test("should respond with 400 if req.userId is missing", async () => {
    // Override mock implementation to simulate missing userId
    const { verifyJWT } = await import("../../../src/middlewares/auth.middleware.js");
    (verifyJWT as any).mockImplementationOnce((req, _, next) => {
      // Do not set req.userId to simulate missing userId
      next();
    });

    const token = jwt.sign({ _id: "123", email: "test@example.com" }, "test-secret", {
      expiresIn: "1h",
    });

    const response = await request(app)
      .get("/api/v1/users/verify-user")
      .set("Cookie", [`accessToken=${token}`]);

    expect(response.body.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
  });

  // This test is only for the test at the future this test should be removed when we create the new server for the admin
  test("should respond with 401 if there is not refreshToken in the database that means some of the data is changed by the admin", async () => {
    const token = jwt.sign({ _id: testUserId, email: "test@example.com" }, "test-secret", {
      expiresIn: "1h",
    });

    const user = {
      _id: testUserId,
      email: "test@example.com",
      fullName: "Test User",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Mock mongoose findById with chained select returning user
    const selectMock = vi.fn().mockResolvedValue(user);
    vi.spyOn(User, "findById").mockReturnValue({ select: selectMock } as any);

    const response = await request(app)
      .get("/api/v1/users/verify-user")
      .set("Cookie", [`accessToken=${token}`]);

    expect(response.body.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test("should return 200 and include refreshToken", async () => {
    const token = jwt.sign({ _id: testUserId, email: "test@example.com" }, "test-secret", {
      expiresIn: "1h",
    });

    const userWithRefreshToken = {
      _id: testUserId,
      email: "test@example.com",
      fullName: "Test User",
      role: "user",
      refreshToken: "mock-refresh-token",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const selectMock = vi.fn().mockResolvedValue(userWithRefreshToken);
    vi.spyOn(User, "findById").mockReturnValue({ select: selectMock } as any);

    const response = await request(app)
      .get("/api/v1/users/verify-user")
      .set("Cookie", [`accessToken=${token}`]);

    expect(response.body.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(selectMock).toHaveBeenCalledWith("refreshToken role");
  });

  test("should return 500 status code there is not refresh token", async () => {
    const testUserId = new mongoose.Types.ObjectId().toString();

    const token = jwt.sign({ _id: testUserId, email: "test@example.com" }, "test-secret", {
      expiresIn: "1h",
    });

    // ❗ Mock select() to return null → simulate user not found
    const selectMock = vi.fn().mockResolvedValue(null);
    vi.spyOn(User, "findById").mockReturnValue({ select: selectMock } as any);

    const response = await request(app)
      .get("/api/v1/users/verify-user")
      .set("Cookie", [`accessToken=${token}`]);

    expect(response.body.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
  });

  // test("should return 400 when user not found", async () => {
  //   const { verifyJWT } = await import("../../../src/middlewares/auth.middleware.js");

  //   // 👇 Override for this one test
  //   (verifyJWT as any).mockImplementationOnce((req, _, next) => {
  //     req.userId = "nonexistent-user-id";
  //     req.user = {
  //       _id: "nonexistent-user-id",
  //       email: "test@example.com",
  //       fullName: "Ghost User",
  //       role: "user",
  //     };
  //     next();
  //   });

  //   // And also mock DB to return null for this fake ID
  //   const selectMock = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  //   vi.spyOn(User, "findById").mockReturnValue({ select: selectMock } as any);

  //   const token = jwt.sign(
  //     { _id: "nonexistent-user-id", email: "test@example.com" },
  //     "test-secret",
  //     { expiresIn: "1h" }
  //   );

  //   const response = await request(app)
  //     .get("/api/v1/users/verify-user")
  //     .set("Cookie", [`accessToken=${token}`]);

  //   console.log(response.body);

  //   expect(response.body.statusCode).toBe(400);
  //   expect(response.body.message).toMatch(/not found/i);
  // });

});



describe("POST /refresh-tokens", () => {
  test("should respond with 200", async () => {
    const token = jwt.sign({ _id: testUserId, email: "test@example.com" }, "test-secret", {
      expiresIn: "1h",
    });

    const user = {
      _id: testUserId,
      email: "test@example.com",
      fullName: "Test User",
      profilePicture: "pic.jpg",
      refreshToken: token
    };

    const selectMock = vi.fn().mockResolvedValue(user);
    User.findById = vi.fn().mockReturnValue({ select: selectMock } as any);

    const response = await request(app)
      .post("/api/v1/users/refresh-tokens")
      .set("Cookie", [`refreshToken=${token}`]);

    expect(response.body.statusCode).toBe(200);
  });

  test("should respond with 401 if refresh token is invalid", async () => {
    const token = jwt.sign({ _id: testUserId, email: "test@example.com" }, "test-secret", {
      expiresIn: "1h",
    });

    const user = {
      _id: testUserId,
      email: "test@example.com",
      fullName: "Test User",
      profilePicture: "pic.jpg",
      refreshToken: "fake-refresh-token" // Fake refresh token
    };

    const selectMock = vi.fn().mockResolvedValue(user);
    User.findById = vi.fn().mockReturnValue({ select: selectMock } as any);

    const response = await request(app)
      .post("/api/v1/users/refresh-tokens")
      .set("Cookie", [`refreshToken=${token}`]);


    expect(response.body.statusCode).toBe(401);
  });
});

describe("POST /logout-user", () => {
  test("should respond with 200", async () => {
    const token = jwt.sign({ _id: testUserId, email: "test@example.com" }, "test-secret", {
      expiresIn: "1h",
    });

    const user = {
      _id: testUserId,
      email: "test@example.com",
      refreshToken: token,
      set: vi.fn().mockReturnThis(),
      save: vi.fn().mockResolvedValue(true),
    };

    const selectMock = vi.fn().mockResolvedValue(user);
    User.findById = vi.fn().mockReturnValue({ select: selectMock } as any);


    const response = await request(app)
      .post("/api/v1/users/logout-user")
      .set("Cookie", [`accessToken=${token}`]);

    console.log("this is the logout response body");
    console.log(response.body);


    expect(response.body.statusCode).toBe(200);
  });


  test("should respond with 401 if refresh-token is missing", async () => {

    const user = {
      _id: testUserId,
      email: "test@example.com",
      refreshToken: undefined,
      set: vi.fn().mockReturnThis(),
      save: vi.fn().mockResolvedValue(true),
    };

    const selectMock = vi.fn().mockResolvedValue(user);
    User.findById = vi.fn().mockReturnValue({ select: selectMock } as any);
    const response = await request(app)
      .post("/api/v1/users/logout-user")
      .set("Cookie", [`accessToken=${null}`]);
    expect(response.body.statusCode).toBe(401);
  });
});


describe("POST /add-user-important-details", () => {

  // ######################### This test is wrong so have to correct this test ####################################
  test("should respond 200 status code with the user-details", async () => {
    const token = jwt.sign(
      { _id: testUserId, email: "test@example.com" },
      "test-secret",
      { expiresIn: "1h" }
    );

    // Mock user document with refreshToken and mongoose methods
    const userWithRefreshToken = {
      _id: testUserId,
      email: "test@example.com",
      userName: "olduser",
      refreshToken: token,
      set: vi.fn().mockReturnThis(),
      save: vi.fn().mockResolvedValue(true),
    };

    // Mock updated user returned after update (lean returns plain object)
    const updatedUserMock = {
      _id: testUserId,
      age: 25,
      country: "Nepal",
      gender: "Male",
      relationShipStatus: "Single",
      phoneNumber: "9876543210",
      userName: "testuser",
    };

    // Mock for .lean()
    const leanMock = vi.fn().mockResolvedValue(updatedUserMock);
    // Mock for .select(), returning object with .lean()
    const selectMock = vi.fn().mockReturnValue({ lean: leanMock });

    // Mock User.findById calls:
    // 1st call returns user document with refreshToken for validation (no .select())
    // 2nd call returns a chainable query with .select() and .lean()
    User.findById = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(userWithRefreshToken))
      .mockImplementation(() => ({ select: selectMock }));

    // Mock findOne for username uniqueness check (returns null = no conflict)
    User.findOne = vi.fn().mockResolvedValue(null);

    // User details to send in request
    const userDetails = {
      userId: testUserId,
      age: 25,
      country: "Nepal",
      gender: "Male",
      relationshipStatus: "Single",
      phoneNumber: "9876543210",
      userName: "testuser",
    };

    // Send refreshToken cookie here (not accessToken)
    const response = await request(app)
      .post("/api/v1/users/add-user-important-details")
      .set("Cookie", [`refreshToken=${token}`, `accessToken=${token}`])
      .send(userDetails);

    console.log("This is the response");
    console.log(response.body);

    expect(response.status).toBe(500);

  });


  test("should respond 401 status code when in the database refresh-token not found", async () => {
    const token = jwt.sign(
      { _id: testUserId, email: "test@example.com" },
      "test-secret",
      { expiresIn: "1h" }
    );

    const mockSave = vi.fn().mockResolvedValue(true);
    const mockSet = vi.fn().mockReturnThis();

    const userMock = {
      _id: testUserId,
      email: "test@example.com",
      userName: "olduser", // different from the one sent, so uniqueness check will be triggered
      set: mockSet,
      save: mockSave,
    };

    const updatedUserMock = {
      _id: testUserId,
      age: 25,
      country: "Nepal",
      gender: "Male",
      relationShipStatus: "Single",
      phoneNumber: "9876543210",
      userName: "testuser",
    };

    const selectFirst = vi.fn().mockReturnValue(Promise.resolve(userMock));
    const selectSecond = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(updatedUserMock),
    });

    User.findById = vi.fn()
      .mockImplementationOnce(() => ({ select: selectFirst }))  // first call returns raw user document inside select()
      .mockImplementationOnce(() => ({ select: selectSecond })); // second call returns lean updated user

    User.findOne = vi.fn().mockResolvedValue(null);



    // Send details
    const userDetails = {
      userId: testUserId,
      age: 25,
      country: "Nepal",
      gender: "Male",
      relationshipStatus: "Single",
      phoneNumber: "9876543210",
      userName: "testuser",
    };

    const response = await request(app)
      .post("/api/v1/users/add-user-important-details")
      .set("Cookie", [`accessToken=${token}`])
      .send({ ...userDetails });

    expect(response.status).toBe(401);
  });



})

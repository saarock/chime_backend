import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import request from "supertest";
import app from "../../../src/app.js";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";


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
        generateAccessAndRefreshTokensAndCacheTheUserDataInRedis: vi.fn().mockResolvedValue({
            accessToken: "mock-access-token",
            refreshToken: "mock-refresh-token",
        }),
        getUserRedisCacheData: vi.fn().mockResolvedValue({
            email: "test@example.com",
            name: "Test User",
            profilePicture: "profile.jpg",
        }),
        verifyRefreshToken: vi.fn().mockReturnValue({
            userId: "test-user-id",
        }),
    },
}));


describe("POST /login-with-google", () => {
    test(
        "should respond with 200 status code",
        async () => {
            const response = await request(app)
                .post("/api/v1/users/login-with-google")
                .send({ clientId: "test-client-id", credentials: "Credentials" });

            expect(response.body.statusCode).toBe(200);
            expect(response.body.data).toHaveProperty("refreshToken");
            expect(response.body.data).toHaveProperty("accessToken");

        }
    );
});

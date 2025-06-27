// Import all the necessar dependencies here
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterAll,
  beforeAll,
} from "vitest";
import userHelper from "../../../src/helpers/user.helper";
import { client } from "../../../src/configs/redis.js";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import User from "../../../src/models/User.model.js";
import type { User as userTypes } from "../../../src/types/index.js";

let mongoServer: MongoMemoryServer;
beforeEach(async () => {
  if (!client.isOpen) {
    await client.connect();
  }
  await client.flushAll();
  process.env.ACCESS_TOKEN_SECRET = "testaccesstokensecret";
  process.env.REFRESH_TOKEN_SECRET = "testrefreshtokensecret";
  process.env.REFRESH_TOKEN_EXPIRY = "7d";
  process.env.ACCESS_TOKEN_EXPIRY = "15m";
});

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await client.quit();
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("User service test", () => {
  it("should cache the data in the redis without any error ", async () => {
    const key = "fasdfgasdgasdg";
    const data = { fullName: "Aayush Banset", userName: "saarock" };
    await userHelper.cacheTheUserDataById(key, JSON.stringify(data));
  });

  it("should add the data in the redis for cache and get the cache data from the redis without any errors ", async () => {
    const key = "fasdfgasdgasdg";
    const data = { fullName: "Aayush Banset", userName: "saarocl" };
    await userHelper.cacheTheUserDataById(key, JSON.stringify(data));
    const cacheRedisData = await userHelper.getUserRedisCacheData(key);
    expect(cacheRedisData).toEqual(data);
  });

  it("should generate the access and refresh token and cache in the redis", async () => {
    const user = await User.create({
      fullName: "Aayush Basnet",
      email: "saarock4646@gmail.com",
    });

    const userFullData = await User.findById(user._id).lean<userTypes>();
    if (!userFullData || !userFullData._id) return;
    const { refreshToken, accessToken } =
      await userHelper.generateAccessAndRefreshTokensAndCacheTheUserDataInRedis(
        userFullData._id,
        userFullData,
      );
    // Assert
    expect(typeof accessToken).toBe("string");
    expect(typeof refreshToken).toBe("string");
    expect(accessToken.length).toBeGreaterThan(10);
    expect(refreshToken.length).toBeGreaterThan(10);

    const redisUserCache = await userHelper.getUserRedisCacheData(user._id);

    console.log(redisUserCache);

    expect(redisUserCache).toMatchObject({
      fullName: "Aayush Basnet",
      email: "saarock4646@gmail.com",
      active: true,
      role: "user",
    });
  });
});

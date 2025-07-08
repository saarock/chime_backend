import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { videoClient } from "../../../../src/configs/redis.js";
import VideoCallUserQueue from "../../../../src/services/redis_service/VideoCallUserQueue.js";
import { redisLock } from "../../../../src/services/redis_service/index.js";

const userId = "user:test:123";
const fallbackUser = "user:test:fallback";
const femaleUser = "user:test:female";
const otherUser = "user:test:other";

const userDetails = {
  gender: "male",
  age: 19,
  country: "Nepal",
};

beforeAll(async () => {
  if (!videoClient.isOpen) await videoClient.connect();
});

afterAll(async () => {
  if (videoClient.isOpen) await videoClient.quit();
});

beforeEach(async () => {
  await videoClient.flushAll(); // Clean DB before every test
});

describe("VideoCallUserQueue", () => {

  it("should add user to waiting:all queue", async () => {
    await VideoCallUserQueue.addUser(userId, userDetails);
    const users = await videoClient.zRange("waiting:all", 0, -1);
    expect(users).toContain(userId);
  });

  it("should store user metadata in Redis", async () => {
    await VideoCallUserQueue.addUser(userId, userDetails);
    const meta = await videoClient.hGetAll(`chime-video-user:${userId}`);
    expect(meta.gender).toBe("male");
    expect(meta.country).toBe("nepal");
    expect(meta.age).toBe("19");
  });

  it("should add user to gender-specific sorted set", async () => {
    await VideoCallUserQueue.addUser(userId, userDetails);
    const key = `waiting:male:user:male:18-25:nepal`;
    const users = await videoClient.zRange(key, 0, -1);
    expect(users).toContain(userId);
  });

  it("should normalize undefined fields as 'any'", async () => {
    await VideoCallUserQueue.addUser("anon-user", { age: null } as any);
    const meta = await videoClient.hGetAll("chime-video-user:anon-user");
    expect(meta.country).toBe("any");
    expect(meta.gender).toBe("any");
  });

  it("should remove user from all queues and delete metadata", async () => {
    await VideoCallUserQueue.addUser(userId, userDetails);
    await VideoCallUserQueue.removeUser(userId);
    const meta = await videoClient.hGetAll(`chime-video-user:${userId}`);
    expect(Object.keys(meta)).toHaveLength(0);
    const users = await videoClient.zRange("waiting:all", 0, -1);
    expect(users).not.toContain(userId);
  });

  it("should throw error if userId is missing", async () => {
    await expect(VideoCallUserQueue.addUser("", userDetails)).rejects.toThrow();
  });

  it("should not proceed with removeUser if ADDING lock is missing", async () => {
    await expect(VideoCallUserQueue.removeUser("no-lock-user")).resolves.toBeUndefined();
  });

  it("should correctly categorize age range", () => {
    const fn = (VideoCallUserQueue as any).getAgeRange;
    expect(fn("16")).toBe("underage");
    expect(fn("24")).toBe("18-25");
    expect(fn("35")).toBe("26-40");
    expect(fn("70")).toBe("40+");
  });

  it("should return null from fallback if queue is empty", async () => {
    const result = await (VideoCallUserQueue as any).findFallbackMatch("caller");
    expect(result).toBeNull();
  });

  it("should return null if user has no metadata", async () => {
    const result = await VideoCallUserQueue.findMatch("ghost");
    expect(result).toBeNull();
  });

  it("should find match from opposite gender", async () => {
    await VideoCallUserQueue.addUser("male-user", {
      gender: "male",
      age: 22,
      country: "India",
    });

    await VideoCallUserQueue.addUser(femaleUser, {
      gender: "female",
      age: 22,
      country: "India",
    });

    const match = await VideoCallUserQueue.findMatch("male-user");
    expect(match).toBe(femaleUser);
  });

  it("should fallback match when no strict match", async () => {
    await VideoCallUserQueue.addUser("caller-fallback", {
      gender: "male",
      age: 30,
      country: "Nowhere",
    });

    await VideoCallUserQueue.addUser(fallbackUser, {
      gender: "other",
      age: 29,
      country: "Elsewhere",
    });

    const match = await VideoCallUserQueue.findMatch("caller-fallback");
    expect(match).toBe(fallbackUser);
  });

  it("should normalize null and undefined to 'any'", () => {
    const fn = (VideoCallUserQueue as any).normalizeAttr;
    expect(fn(null)).toBe("any");
    expect(fn(undefined)).toBe("any");
  });

  it("should normalize Redis hash to UserMetaData", () => {
    const fn = (VideoCallUserQueue as any).normalizeObject;
    const meta = fn({ age: "20", gender: "male", country: "np" });
    expect(meta.age).toBe(20);
    expect(meta.gender).toBe("male");
  });

  it("should finalize a match by removing and unlocking", async () => {
    const mockLock = vi.spyOn(redisLock, "lockPair").mockResolvedValue(true);
    const mockUnlock = vi.spyOn(redisLock, "unlockPair").mockResolvedValue(undefined);
const mockRemove = vi.spyOn(VideoCallUserQueue as any, "removeUser").mockResolvedValue(undefined);


    const result = await (VideoCallUserQueue as any).finalizeMatch("userA", "userB");
    expect(result).toBe("userB");

    mockLock.mockRestore();
    mockUnlock.mockRestore();
    mockRemove.mockRestore();
  });
});

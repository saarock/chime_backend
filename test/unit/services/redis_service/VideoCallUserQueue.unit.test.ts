// Important all the necessary dependencies here;
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { videoClient } from "../../../../src/configs/redis.js";
import { VideoCallUserQueue } from "../../../../src/services/redis_service/index.js";

beforeEach(async () => {
    if (!videoClient.isOpen) await videoClient.connect();
    await videoClient.flushAll(); // Reset before each test 
});

afterAll(async () => {
    await videoClient.quit();
});

describe("VideoCallUserQueue", () => {
    it("Should add the userMeta data and attribute base data in the sets and return the userMeta data", async () => {
        const userData = {
            country: "any",
            gender: "any",
            age: "23"
        }

        const userFilter = {
            country: "any",
            gender: "any",
            age: "23",
            isStrict: true
        }

        const userId = "3e2rdgmksdfngsdgsd;lgmsalkdgsadgg";

        await VideoCallUserQueue.addUser(userId, userFilter, userData);
        const metaKey = `chime-video-user:${userId}`;
        const metadata = await videoClient.hGetAll(metaKey);
        // expect.
    });


})
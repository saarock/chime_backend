// Important all the necessary dependencies here;
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { videoClient } from "../../../../src/configs/redis.js";
import { VideoCallUserQueue } from "../../../../src/services/redis_service/index.js";

let userData: any;
let userFilter: any;
let userId: string;
const metaKey = (id: string) => `chime-video-user:${id}`;
const userId2 = "flkasngjasdbgahbdgb";

beforeEach(async () => {
  if (!videoClient.isOpen) await videoClient.connect(); // Reconnect if closed
  userData = {
    country: "nepal",
    gender: "female",
    age: "23",
  };

  userId = "3e2rdgmksdfngsdgsd;lgmsalkdgsadgg";
  await videoClient.flushAll(); // clean Redis state
  await VideoCallUserQueue.addUser(userId, userData);
});

afterAll(async () => {
  if (!videoClient.isOpen) return; // Avoid quitting if already closed
  await videoClient.quit();
});

describe("VideoCallUserQueue addUserMethod", () => {
  it("should add the user metadata and attribute-based data into Redis sets", async () => {
    const metadata = await videoClient.hGetAll(metaKey(userId));

    expect(metadata).toEqual({
      country: "nepal",
      gender: "female",
      age: "23",
    });
  });


});


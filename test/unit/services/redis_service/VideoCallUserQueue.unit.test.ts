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
        age: "23"
    };

    userFilter = {
        country: "india",
        gender: "male",
        age: "45",
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
            isStrict: "false",
            pref_gender: "male",
            pref_age: "45",
            pref_country: "india",
        });
    });

    it("should return the list of the users from waiting:all set", async () => {
        const members = await videoClient.zRangeWithScores('waiting:all', 0, -1);
        const values = members.map(m => m.value); // extract only the user IDs
        expect(values).toContain(userId);
    });

    it("shouldn't thrwo the error when i try to add again the data with the same user id", async () => {
        await expect(VideoCallUserQueue.addUser(userId)).resolves.not.toThrow();
    });


    it("should return the Empty list form the waiting:any because there the actual value in the age ", async () => {
        const members = await videoClient.sInter("waiting:any");
        expect(members).toHaveLength(0);
    });

    it("should return the list of the user from the waiting:country: ", async () => {
        const members = await videoClient.sInter("waiting:country:nepal");
        expect(members).toContain(userId);
    });

    it("should return the list of the user from the waiting:gender: ", async () => {
        const members = await videoClient.sInter("waiting:gender:female");
        expect(members).toContain(userId);
    });
    it("should return the list of the user from the waiting:combo:country and gender ", async () => {
        const members = await videoClient.sInter(`waiting:combo:country:${'nepal'}:gender:${'female'}`);
        expect(members).toContain(userId);
    });
});


describe("VideoCallUserQueue removeUserMethod", () => {

    it("should delete the meta key from the set", async () => {
        await VideoCallUserQueue.removeUser(userId);
        const metadata = await videoClient.hGetAll(metaKey(userId));
        expect(Object.keys(metadata)).toHaveLength(0)
    });

    it("should delete the meta key first and again try to delete then shouldn't throw error", async () => {
        // First removal - should delete the key if exists
        await expect(VideoCallUserQueue.removeUser(userId)).resolves.not.toThrow();

        // Second removal - key is already deleted, should not throw error
        await expect(VideoCallUserQueue.removeUser(userId)).resolves.not.toThrow();

        // Confirm the metadata hash is now empty (no key exists)
        const metadata = await videoClient.hGetAll(metaKey(userId));
        expect(Object.keys(metadata)).toHaveLength(0);
    });


    it("should throw the errror when there is no user but still try remove the data", async () => {
        await videoClient.flushAll();
        await VideoCallUserQueue.removeUser(userId);
    });

});


describe("VideoCallUserQueue findMatch", () => {
    it("shouldn't match when there is only on user [No self-match]", async () => {
        const candidateId = await VideoCallUserQueue.findMatch(userId);
        expect(candidateId).toBeNull();
    });

    it("should match the user when the there are two users", async () => {
        const userData1 = {
            country: "nepal",
            gender: "female",
            age: "23"
        };

        const userFilter1 = {
            country: "india",
            gender: "male",
            age: "45"
        };

        await VideoCallUserQueue.addUser(userId2,  userData1);

        const candidateId = await VideoCallUserQueue.findMatch(userId);
        expect(candidateId).toBe(userId2);
    });

    it("should match the user when the there are more than two users and many more", async () => {
        const userData1 = {
            country: "nepal",
            gender: "female",
            age: "23"
        };

        const userFilter1 = {
            country: "india",
            gender: "male",
            age: "45"
        };

        await VideoCallUserQueue.addUser(userId2, userData1);

        const candidateId = await VideoCallUserQueue.findMatch(userId);
        expect(candidateId).toBe(userId2);
    });


})

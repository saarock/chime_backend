import type { UserCallLogs } from "types/index.js";
import { client } from "../../configs/index.js";

const ACTIVE_CALL_PREFIX = "active-call:";
const CALL_START_PREFIX = "call-start:";


class ActiveCallRedisMap {
  async setCall(userA: string, userB: string) {
    const startTime = Date.now();

    await client.set(`${ACTIVE_CALL_PREFIX}${userA}`, userB);
    await client.set(`${ACTIVE_CALL_PREFIX}${userB}`, userA);

    await client.set(`${CALL_START_PREFIX}${userA}`, startTime.toString());
    await client.set(`${CALL_START_PREFIX}${userB}`, startTime.toString());
  }

  async getPartner(userId: string) {
    return client.get(`${ACTIVE_CALL_PREFIX}${userId}`);
  }

  async deleteCall(userA: string, userB: string): Promise<UserCallLogs> {
    const startTimeStr = await client.get(`${CALL_START_PREFIX}${userA}`);
    const endTime = Date.now();

    let callDuration = "0";

    if (startTimeStr) {
      const startTime = parseInt(startTimeStr, 10);
      const durationMs = endTime - startTime;
      callDuration = (durationMs / 1000).toFixed(2); // convert to seconds
    }

    // Clean up Redis keys
    await client.del(`${ACTIVE_CALL_PREFIX}${userA}`);
    await client.del(`${ACTIVE_CALL_PREFIX}${userB}`);
    await client.del(`${CALL_START_PREFIX}${userA}`);
    await client.del(`${CALL_START_PREFIX}${userB}`);
    

    return {
      callerId: userA,
      calleeId: userB,
      callTime: callDuration,
    };
  }

  async deleteByUser(userId: string) {
    const partner = await this.getPartner(userId);
    if (partner) {
      await this.deleteCall(userId, partner);
    } else {
      await client.del(`${ACTIVE_CALL_PREFIX}${userId}`);
      await client.del(`${CALL_START_PREFIX}${userId}`);
    }
  }
}

export default ActiveCallRedisMap;

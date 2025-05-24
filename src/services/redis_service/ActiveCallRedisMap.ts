import { client } from "../../configs/index.js";

const ACTIVE_CALL_PREFIX = "active-call:";

class ActiveCallRedisMap {
  async setCall(userA:string, userB:string) {
    await client.set(`${ACTIVE_CALL_PREFIX}${userA}`, userB);
    await client.set(`${ACTIVE_CALL_PREFIX}${userB}`, userA);
  }

  async getPartner(userId:string) {
    return client.get(`${ACTIVE_CALL_PREFIX}${userId}`);
  }

  async deleteCall(userA:string, userB:string) {
    await client.del(`${ACTIVE_CALL_PREFIX}${userA}`);
    await client.del(`${ACTIVE_CALL_PREFIX}${userB}`);
  }

  async deleteByUser(userId:string) {
    const partner = await this.getPartner(userId);
    if (partner) {
      await this.deleteCall(userId, partner);
    } else {
      await client.del(`${ACTIVE_CALL_PREFIX}${userId}`);
    }
  }
}

export default ActiveCallRedisMap;

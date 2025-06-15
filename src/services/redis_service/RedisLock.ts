import { videoClient } from "../../configs/redis.js";
import { RedisLockKeyStore } from "./RedisLockKeyStore.js";

class RedisLock {
  private EXPIRY = 30000;

  // ---------------------- Single User Lock ----------------------

  async lockUser(userId: string, PREFIX: string): Promise<boolean> {
    try {
      const lockKey = RedisLockKeyStore.generateLockKey(userId, PREFIX);
      const lockValue = await RedisLockKeyStore.generateLockValue();

      const result = await videoClient.set(lockKey, lockValue, {
        NX: true,
        PX: this.EXPIRY,
      });

      if (result === "OK") {
        await RedisLockKeyStore.storeLockValue(userId, lockValue, PREFIX);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async unLockHelper(userId: string, PREFIX: string): Promise<boolean> {
    const lockKey = RedisLockKeyStore.generateLockKey(userId, PREFIX);
    const lockValue = await RedisLockKeyStore.getLockValue(userId, PREFIX);

    if (!lockValue) return false;

    const releaseScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await videoClient.eval(releaseScript, {
      keys: [lockKey],
      arguments: [lockValue],
    });

    if (result === 1) {
      await RedisLockKeyStore.deleteStoredLockValue(userId, PREFIX);
      return true;
    }
    return false;
  }

  async unlockUser(userId: string, PREFIX: string): Promise<boolean> {
    try {
      await this.unLockHelper(userId, PREFIX);
      return true;
    } catch {
      try {
        await this.unLockHelper(userId, PREFIX);
        return true;
      } catch {
        return false;
      }
    }
  }

  // ---------------------- Lock Both Caller & Partner ----------------------

  async lockPair(
    callerId: string,
    partnerId: string,
    PREFIX: string,
  ): Promise<boolean> {
    const lockKeyCaller = RedisLockKeyStore.generateLockKey(callerId, PREFIX);
    const lockKeyPartner = RedisLockKeyStore.generateLockKey(partnerId, PREFIX);
    const lockValue = await RedisLockKeyStore.generateLockValue();
    const EXPIRY = 30000; // 30 seconds expiry

    // Try to lock caller
    const callerResult = await videoClient.set(lockKeyCaller, lockValue, {
      NX: true,
      PX: EXPIRY,
    });

    if (callerResult !== "OK") {
      // Caller already locked by someone else
      return false;
    }

    // Try to lock partner
    const partnerResult = await videoClient.set(lockKeyPartner, lockValue, {
      NX: true,
      PX: EXPIRY,
    });

    if (partnerResult !== "OK") {
      // Failed to lock partner, rollback caller lock
      await videoClient.del(lockKeyCaller);
      return false;
    }

    // Both locked successfully — save lockValues for later unlock
    await Promise.all([
      RedisLockKeyStore.storeLockValue(callerId, lockValue, PREFIX),
      RedisLockKeyStore.storeLockValue(partnerId, lockValue, PREFIX),
    ]);

    return true;
  }

  async unlockPair(
    callerId: string,
    partnerId: string,
    PREFIX: string,
  ): Promise<void> {
    try {
      await Promise.all([
        this.unlockUser(callerId, PREFIX),
        this.unlockUser(partnerId, PREFIX),
      ]);
    } catch {
      try {
        await Promise.all([
          this.unlockUser(callerId, PREFIX),
          this.unlockUser(partnerId, PREFIX),
        ]);
      } catch {
        throw new Error("Failed to unlock the pair. Pleased relaod your app");
      }
    }
  }

  // ---------------------- Check Lock Holder ----------------------

  async isUserLockedBy(
    userId: string,
    expectedValue: string,
    PREFIX: string,
  ): Promise<boolean> {
    const lockKey = RedisLockKeyStore.generateLockKey(userId, PREFIX);
    const currentValue = await videoClient.get(lockKey);
    return currentValue === expectedValue;
  }

  async isUserAlreadyLocked(userId: string, PREFIX: string): Promise<boolean> {
    const lockKey = RedisLockKeyStore.generateLockKey(userId, PREFIX);
    const exists = await videoClient.exists(lockKey);
    return exists === 1;
  }
}

const redisLock = new RedisLock();
export default redisLock;

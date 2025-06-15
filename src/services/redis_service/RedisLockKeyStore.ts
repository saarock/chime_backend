import { videoClient } from "../../configs/redis.js";

export class RedisLockKeyStore {
  static generateLockKey(userId: string, PREFIX: string): string {
    return `lock:${PREFIX}:user:${userId}`;
  }

  static async generateLockValue(): Promise<string> {
    return Math.random().toString(36).slice(2);
  }

  static async storeLockValue(
    userId: string,
    lockValue: string,
    PREFIX: string,
  ): Promise<void> {
    const key = this.generateLockKey(userId, PREFIX);
    await videoClient.hSet(`redis:lock-values:${PREFIX}`, key, lockValue);
  }

  static async getLockValue(
    userId: string,
    PREFIX: string,
  ): Promise<string | null> {
    const key = this.generateLockKey(userId, PREFIX);
    return await videoClient.hGet(`redis:lock-values:${PREFIX}`, key);
  }

  static async deleteStoredLockValue(
    userId: string,
    PREFIX: string,
  ): Promise<void> {
    const key = this.generateLockKey(userId, PREFIX);
    await videoClient.hDel(`redis:lock-values:${PREFIX}`, key);
  }
}

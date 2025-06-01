// import Redlock from 'redlock';
// import { client } from '../../configs/index.js'; // This should be a RedisClientType


// export class RedisLock {
//   private redlock: Redlock;

//   constructor() {
//     this.redlock = new Redlock(
//       [client as any, videoClient, videoClient2], // This should be an array of Redis clients
//       {
//         retryCount: 3,
//         retryDelay: 20,
//         retryJitter: 200,
//       }
//     );
//   }

//   async acquireLock(userId: string, ttl = 5000) {
//     const resource = `locks:user:${userId}`;
//     return await this.redlock.acquire([resource], ttl);
//   }
// }

// const redisLock = new RedisLock();
// export default redisLock;

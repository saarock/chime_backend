import { createClient } from "redis";



// use the redis lock to avoid the race condition


const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// General Redis client
const client = createClient({ url: REDIS_URL });
const videoClient = createClient({ url: REDIS_URL });
const videoClient2 = createClient({ url: REDIS_URL });



// Connection logging
const handleRedisError = (name: string) => (err: any) =>
  console.error(`❌ ${name} Error:`, err);

client.on("error", handleRedisError("Redis"));
client.on("connect", () => console.log("✅ Connected to Redis"));
client.on("reconnecting", () => console.log("♻️ Reconnecting to Redis..."));

const connectRedis = async () => {
  try {
    await Promise.all([
      client.connect(),
      videoClient.connect(),
      videoClient2.connect(),
    ]);
    console.log("✅ All Redis clients connected");
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
    throw error;
  }
};

export { connectRedis, client, videoClient, videoClient2 };

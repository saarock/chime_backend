import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || "rediss://default:AeMYAAIjcDEzZDNkMTlhZmE0MDQ0MTYwYjJmNmEzMDQzMGM1YTgzZHAxMA@clear-bug-58136.upstash.io:6379";

console.log(process.env.REDIS_URL);


// Create Redis clients
const client = createClient({ url: REDIS_URL });
const videoClient = createClient({ url: REDIS_URL });

// Event handlers for logging errors and connection status
const handleRedisError = (name: string) => (err: any) =>
  console.error(`❌ ${name} Error:`, err);

client.on("error", handleRedisError("Redis client"));
videoClient.on("error", handleRedisError("Video Redis client"));

client.on("connect", () => console.log("✅ Redis client connected"));
videoClient.on("connect", () => console.log("✅ Video Redis client connected"));

client.on("reconnecting", () => console.log("♻️ Redis client reconnecting..."));
videoClient.on("reconnecting", () => console.log("♻️ Video Redis client reconnecting..."));

// Connect both clients concurrently
const connectRedis = async () => {
  try {
    await Promise.all([client.connect(), videoClient.connect()]);
    console.log("✅ Both Redis clients connected");
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
    throw error;
  }
};

export { connectRedis, client, videoClient };

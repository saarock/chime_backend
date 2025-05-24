import { createClient } from 'redis';


// for user data only http client
const client = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries: number) => Math.min(retries * 50, 2000),
    connectTimeout: 5000,
  },
});

console.log(process.env.REDIS_URL);




client.on("error", (err: any) => console.error("❌ Redis Error:", err));
client.on("connect", () => console.log("✅ Connected to Redis"));
client.on("reconnecting", () => console.log("♻️ Reconnecting to Redis..."));

const connectRedis = async () => {
  try {
    await client.connect();
    console.log("✅ Redis connection established");
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
    throw error;
  }
};

export { connectRedis, client };

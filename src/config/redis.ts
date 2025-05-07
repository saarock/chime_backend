import { createClient } from 'redis';

const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
        connectTimeout: 5000,
    },
});

client.on('error', (err) => console.error('❌ Redis Error:', err));
client.on('connect', () => console.log('✅ Connected to Redis'));
client.on('reconnecting', () => console.log('♻️ Reconnecting to Redis...'));

// Instead of awaiting immediately, make a function to initialize
const connectRedis = async () => {
    try {

        await client.connect();
        console.log('✅ Redis connection established');
    } catch (error) {
        console.error('❌ Redis connection failed:', error);
        throw error;  // optional: rethrow or handle gracefully
    }
};

export { connectRedis, client };

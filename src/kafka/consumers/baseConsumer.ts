import { kafka } from "../index.js";
import type { Topics } from "../producer.js";


export const createConsumer = async (
    topic: Topics,
    groupId: string,
    handler: (message: any) => void
) => {
    const consumer = kafka.consumer({ groupId });

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    await consumer.run({
        eachMessage: async ({ message }) => {
            const value = message.value?.toString();
            if (value) {
                handler(JSON.parse(value));
            }
        },
    });

    console.log(`✅ Kafka Consumer running for topic: ${topic}`);
};
import { Partitioners } from "kafkajs";
import { kafka } from "./index.js";

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
});

export const connectProducer = async () => {
  await producer.connect();
};

export type Topics = "error-logs" | "video-end" | "match-user";

export const sendMessage = async (topic: Topics, message: object) => {
  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(message) }],
  });
};

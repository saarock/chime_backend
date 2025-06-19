// /kafka/index.ts
import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: "chimi-app", // change to your app name
  brokers: [(process.env.KAFKA_BROKER as string) || "localhost:9092"],
});

export default kafka;

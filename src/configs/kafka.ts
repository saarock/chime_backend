import { Kafka } from "kafkajs";
import fs from "fs";
import path from "path";

const brokersRaw = process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER;
if (!brokersRaw) throw new Error("Kafka env missing: set KAFKA_BROKERS or KAFKA_BROKER");

const brokers = brokersRaw.split(",").map((s) => s.trim()).filter(Boolean);

// Aiven needs TLS
const sslEnabled = process.env.KAFKA_SSL === "true";
if (!sslEnabled) throw new Error("KAFKA_SSL must be true for Aiven TLS");

const caFile = process.env.KAFKA_CA_FILE;
const certFile = process.env.KAFKA_CERT_FILE;
const keyFile = process.env.KAFKA_KEY_FILE;

if (!caFile || !certFile || !keyFile) {
  throw new Error("Missing Kafka cert env vars: KAFKA_CA_FILE, KAFKA_CERT_FILE, KAFKA_KEY_FILE");
}

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

// Debug (remove later)
console.log("✅ Kafka brokers:", brokers);
console.log("✅ Kafka cert paths:", { caFile, certFile, keyFile });

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || "chime-app",
  brokers,
  ssl: {
    ca: [read(caFile)],
    cert: read(certFile),
    key: read(keyFile),
  },
  connectionTimeout: 15000,
  authenticationTimeout: 15000,
  requestTimeout: 30000,
});

export default kafka;

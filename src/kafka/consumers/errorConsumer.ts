import { createConsumer } from "./baseConsumer.js";
import errorService from "../../services/databaseService/api/Error.service.js";
import { ERRORS_BATCH_SIZE, FLUSH_INTERVAL_MS } from "../../constant.js";

const errorBuffer: any[] = [];

// Flush function
const flushErrors = async () => {
  if (errorBuffer.length === 0) return;

  const batch = errorBuffer.splice(0, errorBuffer.length); // remove and get all

  try {
    await errorService.saveErrorsInBulk(batch); // assume this is a bulk insert method
  } catch (err) {
    console.error("Failed to save error batch:", err);
  }
};

// Periodic flush
setInterval(flushErrors, FLUSH_INTERVAL_MS);

export const handleErrors = async () => {
  createConsumer("error-logs", "error-group", async (message) => {
    const { where, userId } = message;

    errorBuffer.push({ where, message: message.message, userId });

    if (errorBuffer.length >= ERRORS_BATCH_SIZE) {
      await flushErrors(); // flush immediately if batch is full
    }
  });
};

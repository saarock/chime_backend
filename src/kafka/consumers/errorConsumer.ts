import { createConsumer } from "./baseConsumer.js";
import errorService from "../../services/databaseService/api/Error.service.js";
import { ERRORS_BATCH_SIZE, FLUSH_INTERVAL_MS } from "../../constant.js";

const errorBuffer: any[] = [];

// Flush function
let flushing = false;

const flushErrors = async () => {
  if (flushing) return;
  if (errorBuffer.length === 0) return;
  flushing = true;

  const batch = errorBuffer.splice(0, errorBuffer.length);
  try {
    await errorService.saveErrorsInBulk(batch);
  } finally {
    flushing = false;
  }
};

// Periodic flush
setInterval(flushErrors, FLUSH_INTERVAL_MS);

export const handleErrors = async () => {
  await createConsumer("error-logs", "error-group", async (message) => {
    const { where, userId } = message;

    errorBuffer.push({ where, message: message.message, userId });

    if (errorBuffer.length >= ERRORS_BATCH_SIZE) {
      flushErrors().catch(console.error);
    }
  });
};

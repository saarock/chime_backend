import { createConsumer } from "./baseConsumer.js";
import { LOGS_BATCH_SIZE, FLUSH_INTERVAL_MS } from "../../constant.js";
import callLogService from "../../services/databaseService/api/CallLog.service.js";

const callBuffer: any[] = [];

async function flushCallLogs() {
  await callLogService.saveCallLogs(callBuffer);
}

setInterval(flushCallLogs, FLUSH_INTERVAL_MS);

export const handleEndCalls = async () => {
  await createConsumer("video-end", "end-call-group", async (message) => {
    callBuffer.push(message);
    if (callBuffer.length >= LOGS_BATCH_SIZE) {
      await flushCallLogs();
    }
  });
};

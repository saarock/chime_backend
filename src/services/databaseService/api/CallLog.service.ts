import CallLogsModel from "../../../models/CallLogs.model.js";
import type { UserCallLogs } from "../../../types/index.js";

class CallLogServie {
  async saveCallLogs(callLogs: UserCallLogs[]) {
    if (callLogs.length <= 0) {
      return;
    }

    await CallLogsModel.insertMany(callLogs);
  }
}

const callLogService = new CallLogServie();

export default callLogService;

import CallLogsModel from "../../models/CallLogs.model.js";
import type { UserCallLogs } from "../../types/index.js";

class CallLogServie {
    async saveCallLogs(callLogs: UserCallLogs[]) {
        await CallLogsModel.insertMany(callLogs);
    }
}


const callLogService = new CallLogServie();

export default callLogService;

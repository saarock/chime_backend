import { ErrorModel, User } from "../../models/index.js";

class ErrorService {
    async saveErrorsInBulk(errors: Array<{where: string, message: string, userId: string}>) {
        await ErrorModel.insertMany(errors);
    }
}

const errorService = new ErrorService();
export default errorService;
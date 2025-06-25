import userHelper from "../../../helpers/user.helper.js";
import { User } from "../../../models/index.js";
import { ApiError } from "../../../utils/index.js";
import type { User as UserTypes } from "../../../types/index.js";

class AdminService {

    async makeAdmin(userId: string): Promise<string> {
        if (!userId || userId.toString().trim() === "") {
            throw new ApiError(400, "Unauthorize request");
        }
        const user = await User.findById(userId);
        user.role = user.role == "admin" ? "user" : "admin";
        user.set("refreshToken", undefined, { strict: false });
        await user.save();
        const safeUserData = await User.findById(userId).select("-password -refreshToken").lean<UserTypes>();
        await userHelper.cacheTheUserDataById(userId, JSON.stringify(safeUserData));
        if (!safeUserData?.role) {
            throw new ApiError(500, "Some things wrong pleased try again");
        }

        return safeUserData?.role;


    }

    async blockAndUnBlockUser(userId: string): Promise<boolean> {
        if (!userId || userId.toString().trim() === "") {
            throw new ApiError(400, "Unauthorize request");
        }

        const user = await User.findById(userId);
        user.active = !user.active;
        user.set("refreshToken", undefined, { strict: false });
        await user.save();
        const safeUserData = await User.findById(userId).select("-password -refreshToken").lean<UserTypes>();
        await userHelper.cacheTheUserDataById(userId, JSON.stringify(safeUserData));
        if (!safeUserData?.role) {
            throw new ApiError(500, "Some things wrong pleased try again");
        }

        return safeUserData?.active;
    }
}

const adminService = new AdminService();
export default adminService;

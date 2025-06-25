import verifyAdmin from "../../middlewares/verifyAdmin.middleware.js";
import { fetchUsers } from "../../controllers/admin/index.js";
import { Router } from "express";
import { blockAndUnBlockUser, makeAdmin } from "../../controllers/admin/adminManageUsers.controller.js";
import forceLogoutIfAnyUserDetailChange from "../../middlewares/forceToLogoutUserOnChange.js";
const dashBoardRoute = Router();



dashBoardRoute.get("/dashboard", verifyAdmin, forceLogoutIfAnyUserDetailChange, fetchUsers);
dashBoardRoute.post("/:userId/make-admin", verifyAdmin, forceLogoutIfAnyUserDetailChange, makeAdmin)
dashBoardRoute.post("/:userId/block", verifyAdmin, forceLogoutIfAnyUserDetailChange, blockAndUnBlockUser)



export default dashBoardRoute;
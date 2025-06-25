// Import all the necessary dependencies here
import { forceLogoutIfAnyUserDetailChange, verifyJWT, verifyJWTRefreshToken } from "../../middlewares/index.js";
import {
  generateAnotherAccessAndRefreshToken,
  loginFromTheGoogle,
  verifyUser,
} from "../../controllers/api/index.js";
import { Router } from "express";
import {
  addUserImportantData,
  logOutUser,
} from "../../controllers/api/user.controller.js";

const userRouter = Router();

// userRouters
userRouter.post("/login-with-google", loginFromTheGoogle);
//verify user
userRouter.get("/verify-user", verifyJWT, forceLogoutIfAnyUserDetailChange, verifyUser);
// refresh access and refresh token
userRouter.post(
  "/refresh-tokens",
  verifyJWTRefreshToken,
  forceLogoutIfAnyUserDetailChange,
  generateAnotherAccessAndRefreshToken,
);
// Logout user
userRouter.post("/logout-user", verifyJWT, forceLogoutIfAnyUserDetailChange, logOutUser);
// Add user importand data [age, country and gender]
userRouter.post("/add-user-important-details", verifyJWT, forceLogoutIfAnyUserDetailChange, addUserImportantData);
export default userRouter;

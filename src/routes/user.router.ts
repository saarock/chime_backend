// Imports
import { verifyJWT, verifyJWTRefreshToken } from "../middlewares/index.js";
import {
  generateAnotherAccessAndRefreshToken,
  loginFromTheGoogle,
  verifyUser,
} from "../controllers/index.js";
import { Router } from "express";
import { logOutUser } from "../controllers/user.controller.js";

const userRouter = Router();

// userRouters
userRouter.post("/login-with-google", loginFromTheGoogle);
//verify user
userRouter.get("/verify-user", verifyJWT, verifyUser);
// refresh access and refresh token
userRouter.post(
  "/refresh-tokens",
  verifyJWTRefreshToken,
  generateAnotherAccessAndRefreshToken,
);
// Logout user
userRouter.post("/logout-user", verifyJWT, logOutUser);
export default userRouter;

// Imports
import { verifyJWT, verifyJWTRefreshToken } from "../middlewares/index.js";
import {
  generateAnotherAccessAndRefreshToken,
  loginFromTheGoogle,
  verifyUser,
} from "../controllers/index.js";
import { Router } from "express";

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

export default userRouter;

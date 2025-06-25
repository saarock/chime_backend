import { saveFeedBack } from "../../controllers/api/feedBack.controller.js";
import { Router } from "express";

const feedBackRouter = Router();

feedBackRouter.post("/save-feedback", saveFeedBack);

export default feedBackRouter;

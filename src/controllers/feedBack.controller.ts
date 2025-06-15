import { feedBackService } from "../services/databaseService/index.js";
import { ApiResponse, asyncHandler } from "../utils/index.js";

export const saveFeedBack = asyncHandler(async (req, res) => {
  const userFeedBack = req.body;
  await feedBackService.saveFeedBack(userFeedBack);
  return res
    .status(200)
    .json(
      new ApiResponse(200, { isFeedbackSaved: true }, "Feedback successfull"),
    );
});

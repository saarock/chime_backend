import ApiError from "../../../utils/ApiError.js";
import type { Feedback } from "../../../types/index.js";
import FeedbackModel from "../../../models/FeedBack.model.js";

class FeedBackService {
  async saveFeedBack(userFeedBack: Feedback) {
    // Validate required fields
    const {
      userId,
      rating,
      category,
      callQuality,
      easeOfUse,
      wouldRecommend,
      features,
      feedback,
      improvements,
    } = userFeedBack;

    if (!userId) {
      throw new ApiError(400, "User ID is required");
    }

    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      throw new ApiError(400, "Rating must be a number between 1 and 5");
    }

    if (!category || typeof category !== "string") {
      throw new ApiError(400, "Feedback category is required");
    }

    if (!Array.isArray(features) || features.length === 0) {
      throw new ApiError(400, "At least one feature must be selected");
    }

    if (typeof callQuality !== "number" || typeof easeOfUse !== "number") {
      throw new ApiError(400, "Call quality and ease of use must be numbers");
    }

    if (typeof wouldRecommend !== "boolean") {
      throw new ApiError(400, "WouldRecommend must be a boolean");
    }

    if (!feedback) {
      throw new ApiError(400, "feedback message is requried");
    }

    if (!improvements) {
      throw new ApiError(400, "Improvement message is requried");
    }

    const newFeedback = await FeedbackModel.create({
      ...userFeedBack,
    });

    return;
  }
}

const feedBackService = new FeedBackService();
export default feedBackService;

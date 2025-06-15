import mongoose, { Schema } from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      match: /.+\@.+\..+/,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    category: {
      type: String,
      required: true,
    },
    callQuality: {
      type: Number,
      min: 1,
      max: 5,
    },
    easeOfUse: {
      type: Number,
      min: 1,
      max: 5,
    },
    wouldRecommend: {
      type: Boolean,
      default: false,
    },
    features: {
      type: [String], // Array of strings
      default: [],
    },
    feedback: {
      type: String,
      trim: true,
    },
    improvements: {
      type: String,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      requried: true,
    },
  },
  {
    timestamps: true,
  },
);

const FeedbackModel = mongoose.model("Feedback", feedbackSchema);

export default FeedbackModel;

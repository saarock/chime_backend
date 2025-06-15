import mongoose, { Schema } from "mongoose";

const errorSchema = new Schema(
  {
    where: {
      type: String,
      reqruied: true,
    },
    message: {
      type: String,
      requried: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

const ErrorModel = mongoose.model("Error", errorSchema);
export default ErrorModel;

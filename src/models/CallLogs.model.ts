import mongoose, { Schema, Document } from "mongoose";

export interface ICallLog extends Document {
  callerId: string;
  calleeId: string;
  callTime: string; // duration in seconds (string to match your Redis logic)
}

const CallLogSchema: Schema = new Schema(
  {
    callerId: {
      type: Schema.Types.ObjectId,
      required: "User",
    },
    calleeId: {
      type: Schema.Types.ObjectId,
      required: "User",
    },
    callTime: { type: String, required: true },
  },
  { timestamps: true },
);

export default mongoose.model<ICallLog>("CallLog", CallLogSchema);

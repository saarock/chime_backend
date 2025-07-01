// models/UserReport.ts
import mongoose from "mongoose"

const UserReportSchema = new mongoose.Schema({
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // optional
  reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["like", "dislike"], required: true },

},
{
  timestamps: true,
})

const UserReport = mongoose.model("UserReport", UserReportSchema)
export default UserReport;
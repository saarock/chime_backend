// All the necessary dependencies goes here
import mongoose from "mongoose";


// async function that make connection to the mongodb database
const connectMonogoDbDataBase = async () => {
  const mongogbURL = process.env.MONGO_DB_URL || "mongodb+srv://saarock:Aayush888999@cluster0.ubjye.mongodb.net/s_1";
  
  // connect to the database
  await mongoose
    .connect(mongogbURL)
    .then(() => {
      // If conncted sucessfully then print the message on the console
      console.log("✅ MongoDb connected successfully");
    })
    .catch((error) => {
      console.error("❌ Failed to connect to MongoDb:", error);
      // if Error happens throw error
      throw error;
    });
};

export default connectMonogoDbDataBase;

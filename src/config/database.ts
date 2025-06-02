import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

export async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}

export default mongoose;

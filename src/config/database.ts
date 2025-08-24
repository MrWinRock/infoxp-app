import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

export async function connectToDatabase() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log("Connected to MongoDB");

  try {
    const userColl = mongoose.connection.collection("users");
    const idx = await userColl.indexes();
    const emailIdx = idx.find(i => i.name === "email_1");
    if (emailIdx && !emailIdx.sparse) {
      console.log("Dropping old non-sparse email_1 index...");
      await userColl.dropIndex("email_1");
    }
  } catch (e) {
    console.warn("Index inspection/drop warning:", (e as Error).message);
  }
  try {
    const User = mongoose.model("Users");
    await User.syncIndexes();
    console.log("User indexes synced");
  } catch (e) {
    console.warn("syncIndexes warning:", (e as Error).message);
  }
}
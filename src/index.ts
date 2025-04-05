import express from "express";
import dotenv from "dotenv";
import { connectToDatabase } from "./config/database";
import userRoutes from "./routes/userRoutes";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Call the database connection function
connectToDatabase();

// Define a simple route
app.get("/", (req, res) => {
  res.send("Hello, world!");
});

// Use user routes
app.use("/api/users", userRoutes);

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

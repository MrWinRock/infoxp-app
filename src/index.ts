import express from "express";
import dotenv from "dotenv";
import { connectToDatabase } from "./config/database";
import userRoutes from "./routes/userRoutes";
import gameRoutes from "./routes/gameRoutes";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Call the database connection function
connectToDatabase();

// Define a simple route
app.get("/", (req, res) => {
  res.send("Hello, world!");
});

// Fish
app.get("/fish", (req, res) => {
  res.type("html").send("<><");
});

// Use user routes
app.use("/api/users", userRoutes);
app.use("/api/games", gameRoutes);

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

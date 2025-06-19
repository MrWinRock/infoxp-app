import express from "express";
import { handleChatMessage } from "../controllers/chatController";

const router = express.Router();

router.post("/", handleChatMessage);

export default router;

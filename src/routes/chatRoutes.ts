import express from "express";
import {
    handleChatMessage,
    getSessionByUserId,
    getSessionMessagesByUserId,
    listChatSessionsByUserId,
    endSessionById,
    deleteSessionById,
    getMessagesBySessionId,
} from "../controllers/chatController";

const router = express.Router();

router.post("/", handleChatMessage);
router.post("/:userId", handleChatMessage);

router.get("/session/:userId", getSessionByUserId);
router.get("/session/:userId/messages", getSessionMessagesByUserId);

router.get("/sessions/:userId", listChatSessionsByUserId);
router.get("/session/:sessionId/messages/by-id", getMessagesBySessionId);
router.post("/session/:sessionId/end", endSessionById);
router.delete("/session/:sessionId", deleteSessionById);

export default router;
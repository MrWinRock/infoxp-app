import { Request, Response } from "express";
import ChatSession from "../models/chatSessionModel";
import ChatMessage from "../models/chatMessageModel";
import { queryLLM } from "../services/llmService";
import mongoose from "mongoose";
import User from "../models/userModel";

export const handleChatMessage = async (req: Request, res: Response) => {
  let { userId, message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (!userId) {
      const guestUser = new User({
        name: `Guest_${new mongoose.Types.ObjectId().toHexString()}`,
        email: undefined,
      });
      await guestUser.save();
      userId = guestUser._id;
    }

    let chatSession = await ChatSession.findOne({
      user_id: new mongoose.Types.ObjectId(userId),
    });

    if (!chatSession) {
      chatSession = new ChatSession({
        user_id: new mongoose.Types.ObjectId(userId),
        session_started: new Date(),
      });
      await chatSession.save();
    }

    const userMessage = new ChatMessage({
      chat_session_id: chatSession._id,
      sender: "user",
      message: message,
    });
    await userMessage.save();

    const botResponseStream = await queryLLM(message);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    let accumulatedResponse = "";
    botResponseStream.on("data", (chunk: Buffer) => {
      const chunkStr = chunk.toString();
      // Ollama sends a stream of JSON objects, separated by newlines.
      const parts = chunkStr.split("\n").filter((s) => s.trim() !== "");
      for (const part of parts) {
        try {
          const parsed = JSON.parse(part);
          if (parsed.response) {
            res.write(parsed.response);
            accumulatedResponse += parsed.response;
          }
        } catch (e) {
          console.error("Failed to parse stream chunk", part, e);
        }
      }
    });

    botResponseStream.on("end", async () => {
      try {
        const botMessage = new ChatMessage({
          chat_session_id: chatSession!._id,
          sender: "chatbot",
          message: accumulatedResponse,
        });
        await botMessage.save();
      } catch (e) {
        console.error("Failed to save chat message", e);
      }
      res.end();
    });

    botResponseStream.on("error", (err: Error) => {
      console.error("Stream error:", err);
      if (!res.headersSent) {
        res.status(500).send("Stream error");
      } else {
        res.end();
      }
    });
  } catch (error) {
    console.error("Error handling chat message:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

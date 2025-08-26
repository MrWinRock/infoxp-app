import type { Request, Response } from "express";
import ChatSession from "../models/chatSessionModel";
import ChatMessage from "../models/chatMessageModel";
import { queryLLM } from "../services/llmService";
import mongoose from "mongoose";
import User from "../models/userModel";
import { getMcpClient } from "../mcp/mcpClient";

export const handleChatMessage = async (req: Request, res: Response) => {

  let { userId, message, toolName, toolArgs } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (!userId) {
      let guestUser = await User.findOne({ role: "guest" });
      if (!guestUser) {
        guestUser = new User({ name: "Guest", role: "guest" });
        try {
          await guestUser.save();
        } catch (e: any) {
          if (e?.code === 11000) {
            guestUser = await User.findOne({ role: "guest" });
          } else {
            throw e;
          }
        }
      }
      userId = guestUser!._id;
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

    let augmentedPrompt = message;
    if (toolName) {
      try {
        const mcp = await getMcpClient();
        const toolResult = await mcp.callTool({
          name: toolName,
          arguments: toolArgs || {}
        });
        const toolJson = JSON.stringify(toolResult, null, 2);
        augmentedPrompt =
          `You have access to tool outputs. Incorporate them helpfully.

Tool (${toolName}) returned:
${toolJson}

User message:
${message}`;
        await new ChatMessage({
          chat_session_id: chatSession._id,
          sender: "tool",
          message: `[${toolName}] ${toolJson}`
        }).save();
      } catch (e) {
        console.error("MCP tool invocation failed:", e);
        augmentedPrompt =
          `Tool (${toolName}) failed (proceed without tool data).
User message:
${message}`;
        await new ChatMessage({
          chat_session_id: chatSession._id,
          sender: "tool",
          message: `[${toolName}] ERROR: ${(e as Error).message}`
        }).save();
      }
    }

    const botResponseStream = await queryLLM(augmentedPrompt);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    let accumulatedResponse = "";

    if (!(botResponseStream as any).on) {
      res.write("LLM response error.\n");
      accumulatedResponse += "LLM response error.";
      const botMessage = new ChatMessage({
        chat_session_id: chatSession._id,
        sender: "chatbot",
        message: accumulatedResponse,
      });
      await botMessage.save();
      return res.end();
    }

    botResponseStream.on("data", (chunk: Buffer) => {
      const chunkStr = chunk.toString();
      const parts = chunkStr.split("\n").filter((s) => s.trim() !== "");
      for (const part of parts) {
        try {
          const parsed = JSON.parse(part);
          if (parsed.response) {
            res.write(parsed.response);
            accumulatedResponse += parsed.response;
          }
        } catch {
          // Ignore non‑JSON
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
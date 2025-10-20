import type { Request, Response } from "express";
import ChatSession from "../models/chatSessionModel";
import ChatMessage from "../models/chatMessageModel";
import { queryLLM } from "../services/llmService";
import mongoose from "mongoose";
import User from "../models/userModel";
import { getMcpClient } from "../mcp/mcpClient";

export const handleChatMessage = async (req: Request, res: Response) => {

  let { userId, message, toolName, toolArgs } = req.body;
  if (!userId && (req.params as any)?.userId) {
    userId = (req.params as any).userId;
  }

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
        // Default web_search args: use the user message as query if q not provided
        if (toolName === "web_search") {
          const depth = toolArgs?.depth === "advanced" ? "advanced" : "basic";
          const maxResults = Math.min(Math.max(Number(toolArgs?.maxResults ?? 5), 1), 10);
          toolArgs = {
            q: toolArgs?.q && String(toolArgs.q).trim().length ? String(toolArgs.q) : message,
            maxResults,
            depth
          };
        }

        const mcp = await getMcpClient();
        const toolResult = await mcp.callTool({
          name: toolName,
          arguments: toolArgs || {}
        });

        // Log a compact summary for debugging
        console.log("[mcp] tool ok", {
          name: toolName,
          args: toolArgs,
          contentItems: Array.isArray((toolResult as any)?.content) ? (toolResult as any).content.length : 0,
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

export const getSessionByUserId = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!/^[0-9a-fA-F]{24}$/.test(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    let chatSession = await ChatSession.findOne({
      user_id: new mongoose.Types.ObjectId(userId),
    }).sort({ createdAt: -1 });

    if (!chatSession) {
      chatSession = new ChatSession({
        user_id: new mongoose.Types.ObjectId(userId),
        session_started: new Date(),
      });
      await chatSession.save();
    }

    return res.json({ session: chatSession });
  } catch (e) {
    console.error("getSessionByUserId error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getSessionMessagesByUserId = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };
    const limit = Math.max(1, Math.min(500, Number(req.query.limit ?? 100)));

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!/^[0-9a-fA-F]{24}$/.test(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const chatSession = await ChatSession.findOne({
      user_id: new mongoose.Types.ObjectId(userId),
    }).sort({ createdAt: -1 });

    if (!chatSession) {
      return res.status(404).json({ error: "Session not found for userId" });
    }

    const messages = await ChatMessage.find({
      chat_session_id: chatSession._id,
    })
      .sort({ createdAt: 1 })
      .limit(limit);

    return res.json({
      sessionId: chatSession._id,
      messages,
    });
  } catch (e) {
    console.error("getSessionMessagesByUserId error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const listChatSessionsByUserId = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!/^[0-9a-fA-F]{24}$/.test(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const filter = { user_id: new mongoose.Types.ObjectId(userId) };

    const [sessions, total] = await Promise.all([
      ChatSession.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
      ChatSession.countDocuments(filter),
    ]);

    const sessionIds = sessions.map((s) => s._id);
    const counts = await ChatMessage.aggregate([
      { $match: { chat_session_id: { $in: sessionIds } } },
      { $group: { _id: "$chat_session_id", count: { $sum: 1 }, lastAt: { $max: "$createdAt" } } },
    ]);
    const countsMap = new Map(counts.map((c) => [String(c._id), { count: c.count, lastAt: c.lastAt }]));

    return res.json({
      total,
      page,
      pageSize: sessions.length,
      pages: Math.ceil(total / limit),
      sessions: sessions.map((s) => {
        const meta = countsMap.get(String(s._id)) || { count: 0, lastAt: s.updatedAt };
        return {
          _id: s._id,
          user_id: s.user_id,
          session_started: s.session_started,
          session_ended: s.session_ended,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: meta.count,
          lastMessageAt: meta.lastAt,
          isOpen: !s.session_ended,
        };
      }),
    });
  } catch (e) {
    console.error("listChatSessionsByUserId error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const endSessionById = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params as { sessionId: string };
    if (!sessionId || !/^[0-9a-fA-F]{24}$/.test(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }
    const s = await ChatSession.findByIdAndUpdate(
      sessionId,
      { session_ended: new Date() },
      { new: true }
    );
    if (!s) return res.status(404).json({ error: "Session not found" });
    return res.json({ session: s });
  } catch (e) {
    console.error("endSessionById error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteSessionById = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params as { sessionId: string };
    if (!sessionId || !/^[0-9a-fA-F]{24}$/.test(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }
    const sid = new mongoose.Types.ObjectId(sessionId);
    await ChatMessage.deleteMany({ chat_session_id: sid });
    const del = await ChatSession.deleteOne({ _id: sid });
    if (del.deletedCount === 0) return res.status(404).json({ error: "Session not found" });
    return res.json({ deleted: true });
  } catch (e) {
    console.error("deleteSessionById error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessagesBySessionId = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params as { sessionId: string };
    const limit = Math.max(1, Math.min(500, Number(req.query.limit ?? 100)));
    if (!sessionId || !/^[0-9a-fA-F]{24}$/.test(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }
    const sid = new mongoose.Types.ObjectId(sessionId);
    const exists = await ChatSession.exists({ _id: sid });
    if (!exists) return res.status(404).json({ error: "Session not found" });

    const messages = await ChatMessage.find({ chat_session_id: sid })
      .sort({ createdAt: 1 })
      .limit(limit);

    return res.json({ sessionId, messages });
  } catch (e) {
    console.error("getMessagesBySessionId error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
};
import { Router } from "express";
import { chatWithTools } from "../agent/ollamaTools";
export const agent = Router();

agent.post("/agent", async (req, res) => {
    try {
        const prompt: string = req.body?.prompt ?? "";
        if (!prompt) return res.status(400).json({ error: "prompt required" });
        const answer = await chatWithTools(prompt);
        res.json({ answer });
    } catch (e: any) {
        res.status(500).json({ error: e?.message || "error" });
    }
});
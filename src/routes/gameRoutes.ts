import express, { Request, Response } from "express";
import Game from "../models/gameModel";
import { queryLLM } from "../services/llmService";

const router = express.Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const games = await Game.find();
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch games." });
  }
});

router.post("/query", async (req: Request, res: Response) => {
  const { gameTitle } = req.body;
  try {
    const game = await Game.findOne({ title: gameTitle });
    if (!game) return res.status(404).json({ error: "Game not found." });

    const prompt = `Provide detailed information about the game titled "${game.title}". Description: ${game.description}`;
    const llmResponse = await queryLLM(prompt);

    res.json({ response: llmResponse });
  } catch (error) {
    res.status(500).json({ error: "Failed to process the request." });
  }
});

export default router;

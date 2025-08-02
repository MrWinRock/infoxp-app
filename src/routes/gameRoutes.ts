import { Router } from "express";
import {
  getGames,
  getGameById,
  queryGameWithLLM,
  searchGames,
  getGamesByGenre,
  createGame,
  updateGame,
  deleteGame,
  getAvailableGenres,
  getGamesByCategory,
  getGameStatistics,
  getTopGames,
  importGamesFromJSON,
  importGamesFromCSV,
  bulkImportSteamDBData
} from "../controllers/gameController";

const router = Router();

// Basic CRUD
router.get("/", getGames);
router.get("/search", searchGames);
router.get("/stats", getGameStatistics);
router.get("/top", getTopGames);
router.get("/genres", getAvailableGenres);
router.get("/category/:category", getGamesByCategory);
router.get("/genre/:genre", getGamesByGenre);
router.get("/:id", getGameById);
router.post("/", createGame);
router.put("/:id", updateGame);
router.delete("/:id", deleteGame);
router.post("/query", queryGameWithLLM);

// Import endpoints
router.post("/import/json", importGamesFromJSON);
router.post("/import/csv", importGamesFromCSV);
router.post("/import/steamdb", bulkImportSteamDBData);

export default router;
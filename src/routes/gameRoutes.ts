import { Router } from "express";
import {
  getGames,
  getGameById,
  queryGameWithLLM,
  searchGames,
  getGamesByGenre,
  getGamesByDeveloper,
  createGame,
  updateGame,
  deleteGame,
  getAvailableGenres,
  getAvailableDevelopers,
  getGamesByCategory,
  getGameStatistics,
  getTopGames,
  importGamesFromJSON,
  importGamesFromCSV,
  importFromCSVFile,
  bulkImportCustomCSV,
  updateGameImage,
  getGamesWithoutImages,
  bulkUpdateImages
} from "../controllers/gameController";

const router = Router();

// Basic CRUD routes
router.get("/", getGames);
router.get("/search", searchGames);
router.get("/stats", getGameStatistics);
router.get("/top", getTopGames);

// Genre and category routes
router.get("/genres", getAvailableGenres);
router.get("/genre/:genre", getGamesByGenre);
router.get("/category/:category", getGamesByCategory);

// Developer routes
router.get("/developers", getAvailableDevelopers);
router.get("/developer/:developer", getGamesByDeveloper);

// Image management routes
router.get("/without-images", getGamesWithoutImages);
router.put("/:id/image", updateGameImage);
router.post("/bulk-update-images", bulkUpdateImages);

// Game CRUD routes
router.get("/:id", getGameById);
router.post("/", createGame);
router.put("/:id", updateGame);
router.delete("/:id", deleteGame);

// LLM query route
router.post("/query", queryGameWithLLM);

// Import endpoints
router.post("/import/json", importGamesFromJSON);
router.post("/import/csv", importGamesFromCSV);
router.post("/import/csv-file", importFromCSVFile);
router.post("/import/custom-csv", bulkImportCustomCSV);

export default router;
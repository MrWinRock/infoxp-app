import type { Request, Response } from "express";
import Game from "../models/gameModel";
import { DataImportService, type SteamGameRecord } from "../services/dataImportService";
import { queryLLM } from "../services/llmService";
import { GAME_GENRES } from "../constants/genres";

const importService = new DataImportService();

// GET all games with pagination - returns Steam-like shape
export const getGames = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const total = await Game.countDocuments();
        const docs = await Game.find().skip(skip).limit(limit).lean();
        const data = docs.map(d => importService.toSteamShape(d));

        res.json({
            games: data,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Error fetching games:", error);
        res.status(500).json({ error: "Failed to fetch games" });
    }
};

// GET all games without pagination - returns Steam-like shape
export const getAllGames = async (req: Request, res: Response) => {
    try {
        const docs = await Game.find().lean();
        const data = docs.map(d => importService.toSteamShape(d));
        res.json(data);
    } catch (error) {
        console.error("Error fetching games:", error);
        res.status(500).json({ error: "Failed to fetch games" });
    }
};

// GET game by ID - returns Steam-like shape
export const getGameById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const game = await Game.findById(id).lean();

        if (!game) {
            return res.status(404).json({ error: "Game not found" });
        }

        res.json(importService.toSteamShape(game));
    } catch (error) {
        console.error("Error fetching game:", error);
        res.status(500).json({ error: "Failed to fetch game" });
    }
};

// POST query with LLM
export const queryGameWithLLM = async (req: Request, res: Response) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ error: "Query is required" });
        }

        // Get all games for context
        const games = await Game.find().lean();
        const gamesContext = games.map(g =>
            `${g.title} - ${g.genre.join(", ")} by ${g.developer?.join(", ")}`
        ).join("\n");

        const prompt = `Based on these games:\n${gamesContext}\n\nUser question: ${query}\n\nProvide a helpful response about the games.`;

        const stream = await queryLLM(prompt);

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        stream.pipe(res);
    } catch (error) {
        console.error("Error querying LLM:", error);
        res.status(500).json({ error: "Failed to query LLM" });
    }
};

// GET search games by query - returns Steam-like shape
export const searchGames = async (req: Request, res: Response) => {
    try {
        const { q, genre, developer, category } = req.query;

        const filter: any = {};

        if (q && typeof q === "string") {
            filter.$or = [
                { title: { $regex: q, $options: "i" } },
                { description: { $regex: q, $options: "i" } }
            ];
        }

        if (genre && typeof genre === "string") {
            filter.genre = genre;
        }

        if (developer && typeof developer === "string") {
            filter.developer = developer;
        }

        if (category && typeof category === "string") {
            filter.categories = category;
        }

        const docs = await Game.find(filter).lean();
        const data = docs.map(d => importService.toSteamShape(d));

        res.json(data);
    } catch (error) {
        console.error("Error searching games:", error);
        res.status(500).json({ error: "Failed to search games" });
    }
};

// GET games by genre - returns Steam-like shape
export const getGamesByGenre = async (req: Request, res: Response) => {
    try {
        const { genre } = req.params;
        const docs = await Game.find({ genre }).lean();
        const data = docs.map(d => importService.toSteamShape(d));
        res.json(data);
    } catch (error) {
        console.error("Error fetching games by genre:", error);
        res.status(500).json({ error: "Failed to fetch games by genre" });
    }
};

// GET games by developer - returns Steam-like shape
export const getGamesByDeveloper = async (req: Request, res: Response) => {
    try {
        const { developer } = req.params;
        const docs = await Game.find({ developer }).lean();
        const data = docs.map(d => importService.toSteamShape(d));
        res.json(data);
    } catch (error) {
        console.error("Error fetching games by developer:", error);
        res.status(500).json({ error: "Failed to fetch games by developer" });
    }
};

// GET games by category - returns Steam-like shape
export const getGamesByCategory = async (req: Request, res: Response) => {
    try {
        const { category } = req.params;
        const docs = await Game.find({ categories: category }).lean();
        const data = docs.map(d => importService.toSteamShape(d));
        res.json(data);
    } catch (error) {
        console.error("Error fetching games by category:", error);
        res.status(500).json({ error: "Failed to fetch games by category" });
    }
};

// GET available genres
export const getAvailableGenres = async (req: Request, res: Response) => {
    try {
        const genres = await Game.distinct("genre");
        res.json(genres);
    } catch (error) {
        console.error("Error fetching genres:", error);
        res.status(500).json({ error: "Failed to fetch genres" });
    }
};

// GET available developers
export const getAvailableDevelopers = async (req: Request, res: Response) => {
    try {
        const developers = await Game.distinct("developer");
        res.json(developers.flat());
    } catch (error) {
        console.error("Error fetching developers:", error);
        res.status(500).json({ error: "Failed to fetch developers" });
    }
};

// GET game statistics
export const getGameStatistics = async (req: Request, res: Response) => {
    try {
        const total = await Game.countDocuments();
        const genreCounts = await Game.aggregate([
            { $unwind: "$genre" },
            { $group: { _id: "$genre", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const developerCounts = await Game.aggregate([
            { $unwind: "$developer" },
            { $group: { _id: "$developer", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            total,
            genreCounts,
            topDevelopers: developerCounts
        });
    } catch (error) {
        console.error("Error fetching statistics:", error);
        res.status(500).json({ error: "Failed to fetch statistics" });
    }
};

// GET top games - returns Steam-like shape
export const getTopGames = async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        const docs = await Game.find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        const data = docs.map(d => importService.toSteamShape(d));
        res.json(data);
    } catch (error) {
        console.error("Error fetching top games:", error);
        res.status(500).json({ error: "Failed to fetch top games" });
    }
};

// GET games without images - returns Steam-like shape
export const getGamesWithoutImages = async (req: Request, res: Response) => {
    try {
        const docs = await Game.find({
            $or: [
                { image_url: { $exists: false } },
                { image_url: null },
                { image_url: "" }
            ]
        }).lean();
        const data = docs.map(d => importService.toSteamShape(d));
        res.json(data);
    } catch (error) {
        console.error("Error fetching games without images:", error);
        res.status(500).json({ error: "Failed to fetch games without images" });
    }
};

// PUT update game image
export const updateGameImage = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { image_url } = req.body;

        if (!image_url) {
            return res.status(400).json({ error: "image_url is required" });
        }

        const updated = await Game.findByIdAndUpdate(
            id,
            { image_url },
            { new: true, runValidators: true }
        ).lean();

        if (!updated) {
            return res.status(404).json({ error: "Game not found" });
        }

        res.json(importService.toSteamShape(updated));
    } catch (error) {
        console.error("Error updating image:", error);
        res.status(500).json({ error: "Failed to update image" });
    }
};

// POST bulk update images
export const bulkUpdateImages = async (req: Request, res: Response) => {
    try {
        const updates = req.body; // Array of { id, image_url }
        if (!Array.isArray(updates)) {
            return res.status(400).json({ error: "Body must be an array" });
        }

        const results = { success: 0, errors: [] as any[] };

        for (const { id, image_url } of updates) {
            try {
                await Game.findByIdAndUpdate(id, { image_url });
                results.success++;
            } catch (err: any) {
                results.errors.push({ id, error: err.message });
            }
        }

        res.json(results);
    } catch (error) {
        console.error("Error bulk updating images:", error);
        res.status(500).json({ error: "Failed to bulk update images" });
    }
};

// POST create game - accepts Steam-like shape
export const createGame = async (req: Request, res: Response) => {
    try {
        const gameData: SteamGameRecord = req.body;

        if (!gameData.Name) {
            return res.status(400).json({ error: "Name is required" });
        }

        const result = await importService.importFromJSON([gameData]);

        if (result.errors.length > 0) {
            return res.status(400).json({
                error: "Failed to create game",
                details: result.errors
            });
        }

        if (result.duplicates > 0) {
            return res.status(409).json({ error: "Game already exists" });
        }

        const created = await Game.findById(result.savedIds[0]).lean();
        res.status(201).json(importService.toSteamShape(created));
    } catch (error) {
        console.error("Error creating game:", error);
        res.status(500).json({ error: "Failed to create game" });
    }
};

// PUT update game - accepts Steam-like shape
export const updateGame = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const gameData: SteamGameRecord = req.body;

        const existing = await Game.findById(id);
        if (!existing) {
            return res.status(404).json({ error: "Game not found" });
        }

        const publishers = Array.isArray(gameData.Publishers)
            ? gameData.Publishers.join(", ")
            : (gameData.Publishers ?? undefined);
        const releaseDate = typeof gameData["Release date"] === "number"
            ? new Date(gameData["Release date"])
            : undefined;

        const updateData: any = {};
        if (gameData.Name) updateData.title = gameData.Name;
        if (gameData.AppID) updateData.steam_app_id = gameData.AppID;
        if (gameData.Developers) updateData.developer = gameData.Developers;
        if (publishers) updateData.publisher = publishers;
        if (releaseDate) updateData.release_date = releaseDate;
        if (gameData["About the game"]) updateData.description = gameData["About the game"];
        if (gameData["Header image"]) updateData.image_url = gameData["Header image"];
        if (gameData["Required age"] !== undefined) updateData.required_age = gameData["Required age"];
        if (gameData.Categories) updateData.categories = gameData.Categories;
        if (gameData.Genres) {
            const svc = new DataImportService();
            updateData.genre = (svc as any).parseGenres(gameData.Genres);
        }
        if (gameData.Windows !== undefined || gameData.Mac !== undefined || gameData.Linux !== undefined) {
            updateData.platforms = {
                windows: !!gameData.Windows,
                mac: !!gameData.Mac,
                linux: !!gameData.Linux
            };
        }

        const updated = await Game.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true
        }).lean();

        res.json(importService.toSteamShape(updated));
    } catch (error) {
        console.error("Error updating game:", error);
        res.status(500).json({ error: "Failed to update game" });
    }
};

// DELETE game
export const deleteGame = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const game = await Game.findByIdAndDelete(id);

        if (!game) {
            return res.status(404).json({ error: "Game not found" });
        }

        res.json({ message: "Game deleted successfully" });
    } catch (error) {
        console.error("Error deleting game:", error);
        res.status(500).json({ error: "Failed to delete game" });
    }
};

// POST import from JSON - accepts Steam-like array
export const importGamesFromJSON = async (req: Request, res: Response) => {
    try {
        if (!Array.isArray(req.body)) {
            return res.status(400).json({ error: "Body must be an array" });
        }
        const result = await importService.importFromJSON(req.body as SteamGameRecord[]);
        res.json(result);
    } catch (error) {
        console.error("Import from JSON failed:", error);
        res.status(500).json({ error: "Failed to import games" });
    }
};

// POST import from CSV (legacy - converts to Steam shape internally if needed)
export const importGamesFromCSV = async (req: Request, res: Response) => {
    try {
        // If you still have CSV data, parse it and convert to SteamGameRecord format
        // For now, return not implemented
        res.status(501).json({ error: "CSV import not implemented with new interface" });
    } catch (error) {
        console.error("CSV import failed:", error);
        res.status(500).json({ error: "Failed to import from CSV" });
    }
};

// POST import from CSV file (legacy)
export const importFromCSVFile = async (req: Request, res: Response) => {
    res.status(501).json({ error: "CSV file import not implemented with new interface" });
};

// POST bulk import custom CSV (legacy)
export const bulkImportCustomCSV = async (req: Request, res: Response) => {
    res.status(501).json({ error: "Custom CSV import not implemented with new interface" });
};

// POST bulk import - same as importGamesFromJSON
export const bulkImportGames = async (req: Request, res: Response) => {
    return importGamesFromJSON(req, res);
};
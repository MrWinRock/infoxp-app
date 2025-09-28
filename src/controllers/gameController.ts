import type { Request, Response } from "express";
import Game from "../models/gameModel";
import { queryLLM } from "../services/llmService";
import { GAME_GENRES, GENRE_CATEGORIES, POPULAR_GENRES, GENRE_MAPPING, isValidGenre, filterValidGenres } from "../constants/genres";
import { DataImportService } from "../services/dataImportService";

export const getGames = async (req: Request, res: Response) => {
    try {
        const games = await Game.find();
        res.json(games);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch games." });
    }
};

export const getGameById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const game = await Game.findById(id);

        if (!game) {
            return res.status(404).json({ error: "Game not found." });
        }

        res.json(game);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch game." });
    }
};

export const queryGameWithLLM = async (req: Request, res: Response) => {
    const { gameTitle } = req.body;

    try {
        const game = await Game.findOne({ title: gameTitle });
        if (!game) {
            return res.status(404).json({ error: "Game not found." });
        }

        const prompt = `Provide detailed information about the game titled "${game.title}". Description: ${game.description}`;
        const llmResponse = await queryLLM(prompt);

        res.json({ response: llmResponse });
    } catch (error) {
        res.status(500).json({ error: "Failed to process the request." });
    }
};

export const createGame = async (req: Request, res: Response) => {
    try {
        const gameData = req.body;

        if (gameData.genre) {
            gameData.genre = filterValidGenres(gameData.genre);
        }

        const newGame = new Game(gameData);
        await newGame.save();

        res.status(201).json({
            message: "Game created successfully",
            game: newGame
        });
    } catch (error) {
        console.error('Create game error:', error);
        res.status(400).json({ error: "Failed to create game." });
    }
};

export const updateGame = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (updateData.genre) {
            updateData.genre = filterValidGenres(updateData.genre);
        }

        const updatedGame = await Game.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!updatedGame) {
            return res.status(404).json({ error: "Game not found." });
        }

        res.json({
            message: "Game updated successfully",
            game: updatedGame
        });
    } catch (error) {
        console.error('Update game error:', error);
        res.status(400).json({ error: "Failed to update game." });
    }
};

export const searchGames = async (req: Request, res: Response) => {
    try {
        const { q, genre, developer, publisher, technology, minRating, maxRating, sortBy, order } = req.query;

        const searchQuery: any = {};

        if (q) {
            searchQuery.$or = [
                { title: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } },
                { franchise: { $regex: q, $options: 'i' } }
            ];
        }

        if (genre) {
            const genresRaw = typeof genre === 'string' ? genre.split(',') : [genre];
            const genres: string[] = genresRaw.map(g => typeof g === 'string' ? g : String(g));
            const validGenres = filterValidGenres(genres);
            if (validGenres.length > 0) {
                searchQuery.genres = { $in: validGenres };
            }
        }

        if (developer) {
            searchQuery.developer = { $regex: developer, $options: 'i' };
        }

        if (publisher) {
            searchQuery.publisher = { $regex: publisher, $options: 'i' };
        }

        if (technology) {
            searchQuery.technologies = { $in: [new RegExp(technology as string, 'i')] };
        }

        if (minRating || maxRating) {
            searchQuery.rating = {};
            if (minRating) searchQuery.rating.$gte = parseFloat(minRating as string);
            if (maxRating) searchQuery.rating.$lte = parseFloat(maxRating as string);
        }

        let sortOptions: any = {};
        if (sortBy) {
            const sortField = sortBy as string;
            const sortOrder = order === 'desc' ? -1 : 1;

            switch (sortField) {
                case 'rating':
                    sortOptions.rating = sortOrder;
                    break;
                case 'releaseDate':
                    sortOptions.releaseDate = sortOrder;
                    break;
                case 'title':
                    sortOptions.title = sortOrder;
                    break;
                case 'reviews':
                    sortOptions.reviewCount = sortOrder;
                    break;
                default:
                    sortOptions.title = 1
            }
        } else {
            sortOptions.title = 1
        }

        const games = await Game.find(searchQuery).sort(sortOptions);

        res.json({
            games,
            count: games.length,
            filters: {
                query: q,
                genre,
                developer,
                publisher,
                technology,
                rating: { min: minRating, max: maxRating }
            }
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to search games." });
    }
};

export const getGamesByGenre = async (req: Request, res: Response) => {
    try {
        const { genre } = req.params;

        if (!isValidGenre(genre)) {
            return res.status(400).json({
                error: "Invalid genre",
                availableGenres: POPULAR_GENRES
            });
        }

        const games = await Game.find({ genres: { $in: [genre] } });
        res.json({
            genre,
            games,
            count: games.length
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch games by genre." });
    }
};

export const deleteGame = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const deletedGame = await Game.findByIdAndDelete(id);

        if (!deletedGame) {
            return res.status(404).json({ error: "Game not found." });
        }

        res.json({ message: "Game deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete game." });
    }
};

export const getAvailableGenres = async (req: Request, res: Response) => {
    try {
        const genresInDb = await Game.distinct('genres');

        res.json({
            all: GAME_GENRES,
            inDatabase: genresInDb,
            categories: GENRE_CATEGORIES,
            popular: POPULAR_GENRES,
            total: GAME_GENRES.length,
            inDatabaseCount: genresInDb.length
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch genres." });
    }
};

export const getGamesByCategory = async (req: Request, res: Response) => {
    try {
        const { category } = req.params;
        const categoryKey = category.toUpperCase() as keyof typeof GENRE_CATEGORIES;
        const categoryGenres = GENRE_CATEGORIES[categoryKey];

        if (!categoryGenres) {
            return res.status(400).json({
                error: "Invalid category",
                availableCategories: Object.keys(GENRE_CATEGORIES).map(k => k.toLowerCase())
            });
        }

        const games = await Game.find({
            genres: { $in: categoryGenres }
        });

        res.json({
            category: category.toLowerCase(),
            genres: categoryGenres,
            games,
            count: games.length
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch games by category." });
    }
};

export const getGameStatistics = async (req: Request, res: Response) => {
    try {
        const totalGames = await Game.countDocuments();

        const genreStats = await Game.aggregate([
            { $unwind: '$genres' },
            { $group: { _id: '$genres', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 20 }
        ]);

        const developerStats = await Game.aggregate([
            { $group: { _id: '$developer', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        const technologyStats = await Game.aggregate([
            { $unwind: '$technologies' },
            { $group: { _id: '$technologies', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        const ratingStats = await Game.aggregate([
            {
                $bucket: {
                    groupBy: '$rating',
                    boundaries: [0, 20, 40, 60, 80, 100],
                    default: 'Unknown',
                    output: {
                        count: { $sum: 1 },
                        avgRating: { $avg: '$rating' }
                    }
                }
            }
        ]);

        res.json({
            total: totalGames,
            genres: genreStats,
            developers: developerStats,
            technologies: technologyStats,
            ratings: ratingStats
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch game statistics." });
    }
};

export const getTopGames = async (req: Request, res: Response) => {
    try {
        const { by = 'rating', limit = 10 } = req.query;

        let sortField = 'rating';
        switch (by) {
            case 'reviews':
                sortField = 'reviewCount';
                break;
            case 'recent':
                sortField = 'releaseDate';
                break;
            case 'rating':
            default:
                sortField = 'rating';
                break;
        }

        const games = await Game.find({})
            .sort({ [sortField]: -1 })
            .limit(parseInt(limit as string))
            .select('title steamAppId rating reviewCount releaseDate genres developer publisher');

        res.json({
            topGames: games,
            sortedBy: by,
            count: games.length
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch top games." });
    }
};

export const importFromCSVFile = async (req: Request, res: Response) => {
    try {
        const { filePath } = req.body;

        if (!filePath) {
            return res.status(400).json({
                error: "File path is required"
            });
        }

        const importService = new DataImportService();
        const results = await importService.importFromCSVFile(filePath);

        res.json({
            message: "CSV file import completed",
            results: {
                successful: results.success,
                duplicates: results.duplicates,
                errors: results.errors.length,
                errorDetails: results.errors
            }
        });
    } catch (error) {
        console.error('CSV file import error:', error);
        res.status(500).json({
            error: "Failed to import CSV file",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

// Enhanced bulk import for your custom CSV data
export const bulkImportCustomCSV = async (req: Request, res: Response) => {
    try {
        const { csvContent } = req.body;

        if (!csvContent) {
            return res.status(400).json({
                error: "CSV content is required"
            });
        }

        const importService = new DataImportService();
        const results = await importService.importFromCSV(csvContent);

        res.json({
            message: "Custom CSV import completed",
            results: {
                successful: results.success,
                duplicates: results.duplicates,
                errors: results.errors.length,
                errorDetails: results.errors
            }
        });
    } catch (error) {
        console.error('Custom CSV import error:', error);
        res.status(500).json({
            error: "Failed to import custom CSV",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const importGamesFromJSON = async (req: Request, res: Response) => {
    try {
        const { games } = req.body;

        console.log('Importing games from JSON:', games);

        if (!Array.isArray(games)) {
            return res.status(400).json({
                error: "Request body must contain a 'games' array"
            });
        }

        const normalized = games.map((g: any) => ({
            title: g.title,
            steam_app_id: g.steamAppId != null ? String(g.steamAppId) : undefined,
            genre: Array.isArray(g.genre) ? g.genre.join(', ') : g.genre,
            developer: Array.isArray(g.developer) ? g.developer.join(', ') : g.developer,
            publisher: g.publisher,
            technologies: Array.isArray(g.technologies) ? g.technologies.join(', ') : g.technologies,
            release_date: g.releaseDate,
            description: g.description,
            image_url: g.imageUrl
        })).filter((g: any) => !!g.title);

        const importService = new DataImportService();
        const results = await importService.importFromJSON(normalized);

        res.json({
            message: "Import completed",
            results: {
                totalReceived: games.length,
                totalProcessed: normalized.length,
                successful: results.success,
                duplicates: results.duplicates,
                errors: results.errors.length,
                errorDetails: results.errors
            }
        });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({
            error: "Failed to import games",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const importGamesFromCSV = async (req: Request, res: Response) => {
    try {
        const { csvContent } = req.body;

        if (!csvContent || typeof csvContent !== 'string') {
            return res.status(400).json({
                error: "Request body must contain 'csvContent' as a string"
            });
        }

        const importService = new DataImportService();
        const results = await importService.importFromCSV(csvContent);

        res.json({
            message: "CSV import completed",
            results: {
                successful: results.success,
                duplicates: results.duplicates,
                errors: results.errors.length,
                errorDetails: results.errors
            }
        });
    } catch (error) {
        console.error('CSV import error:', error);
        res.status(500).json({
            error: "Failed to import CSV",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const updateGameImage = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { image_url } = req.body;

        if (!image_url) {
            return res.status(400).json({
                error: "image_url is required"
            });
        }

        const updatedGame = await Game.findByIdAndUpdate(
            id,
            { $set: { image_url } },
            { new: true, runValidators: true }
        );

        if (!updatedGame) {
            return res.status(404).json({ error: "Game not found." });
        }

        res.json({
            message: "Game image updated successfully",
            game: updatedGame
        });
    } catch (error) {
        console.error('Update game image error:', error);
        res.status(400).json({ error: "Failed to update game image." });
    }
};

export const getGamesWithoutImages = async (req: Request, res: Response) => {
    try {
        const gamesWithoutImages = await Game.find({
            $or: [
                { image_url: { $exists: false } },
                { image_url: null },
                { image_url: "" }
            ]
        }).select('title steam_app_id developer publisher');

        res.json({
            games: gamesWithoutImages,
            count: gamesWithoutImages.length
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch games without images." });
    }
};

export const bulkUpdateImages = async (req: Request, res: Response) => {
    try {
        const { updates } = req.body;

        if (!Array.isArray(updates)) {
            return res.status(400).json({
                error: "Expected array of update objects with steam_app_id and image_url"
            });
        }

        const results = {
            updated: 0,
            errors: [] as Array<{ steam_app_id: number; error: string }>
        };

        for (const update of updates) {
            try {
                const result = await Game.findOneAndUpdate(
                    { steam_app_id: update.steam_app_id },
                    { $set: { image_url: update.image_url } },
                    { new: true, runValidators: true }
                );

                if (result) {
                    results.updated++;
                } else {
                    results.errors.push({
                        steam_app_id: update.steam_app_id,
                        error: "Game not found"
                    });
                }
            } catch (error) {
                results.errors.push({
                    steam_app_id: update.steam_app_id,
                    error: error instanceof Error ? error.message : "Unknown error"
                });
            }
        }

        res.json({
            message: "Bulk image update completed",
            results
        });
    } catch (error) {
        console.error('Bulk image update error:', error);
        res.status(500).json({ error: "Failed to bulk update images." });
    }
};

export const getGamesByDeveloper = async (req: Request, res: Response) => {
    try {
        const { developer } = req.params;

        const games = await Game.find({
            developer: { $in: [new RegExp(developer, 'i')] }
        });

        res.json({
            developer,
            games,
            count: games.length
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch games by developer." });
    }
};

// Add missing getAvailableDevelopers function
export const getAvailableDevelopers = async (req: Request, res: Response) => {
    try {
        const developers = await Game.distinct('developer');
        const flatDevelopers = developers.flat().filter(Boolean);
        const uniqueDevelopers = [...new Set(flatDevelopers)].sort();

        res.json({
            developers: uniqueDevelopers,
            count: uniqueDevelopers.length
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch developers." });
    }
};
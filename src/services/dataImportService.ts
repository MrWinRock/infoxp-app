import Game from "../models/gameModel";
import { GENRE_MAPPING, filterValidGenres, type GameGenre } from "../constants/genres";

interface RawGameData {
    title: string;
    appId?: string | number;
    appType?: string;
    developer?: string;
    publisher?: string;
    franchise?: string;
    supportedSystems?: string;
    technologies?: string;
    releaseDate?: string;
    rating?: string | number;
    reviewCount?: string | number;
    currentPlayers?: string | number;
    description?: string;
    genres?: string;
    tags?: string;
}

export class DataImportService {
    private parseGenres(genresStr: string): GameGenre[] {
        if (!genresStr) return [];

        // Handle different separators (comma, pipe, semicolon)
        const rawGenres = genresStr.split(/[,|;]/).map(g => g.trim());
        const mappedGenres: GameGenre[] = [];

        rawGenres.forEach(genre => {
            const upperGenre = genre.toUpperCase().replace(/\s+/g, '_');

            // Try direct mapping first
            const mapped = GENRE_MAPPING[upperGenre];
            if (mapped && !mappedGenres.includes(mapped)) {
                mappedGenres.push(mapped);
            }
            // Try original case
            else if (GENRE_MAPPING[genre] && !mappedGenres.includes(GENRE_MAPPING[genre]!)) {
                mappedGenres.push(GENRE_MAPPING[genre]!);
            }
        });

        return filterValidGenres(mappedGenres);
    }

    private parseRating(ratingStr: string | number): number | undefined {
        if (typeof ratingStr === 'number') return ratingStr;
        if (!ratingStr) return undefined;

        // Handle percentage format (86.22%)
        const percentMatch = ratingStr.toString().match(/(\d+\.?\d*)%/);
        if (percentMatch) {
            return parseFloat(percentMatch[1]);
        }

        // Handle decimal rating (8.93 M reviews -> extract rating if present)
        const decimalMatch = ratingStr.toString().match(/(\d+\.?\d*)/);
        if (decimalMatch) {
            const value = parseFloat(decimalMatch[1]);
            return value <= 10 ? value * 10 : value; // Convert 0-10 scale to 0-100
        }

        return undefined;
    }

    private parseReviewCount(reviewStr: string | number): number | undefined {
        if (typeof reviewStr === 'number') return reviewStr;
        if (!reviewStr) return undefined;

        const str = reviewStr.toString().toLowerCase();

        // Handle formats like "8.93 M reviews", "2.53M", "863,206"
        const millionMatch = str.match(/([\d.]+)\s*m/);
        if (millionMatch) {
            return Math.round(parseFloat(millionMatch[1]) * 1000000);
        }

        const thousandMatch = str.match(/([\d.]+)\s*k/);
        if (thousandMatch) {
            return Math.round(parseFloat(thousandMatch[1]) * 1000);
        }

        // Handle comma-separated numbers
        const numberMatch = str.match(/([\d,]+)/);
        if (numberMatch) {
            return parseInt(numberMatch[1].replace(/,/g, ''));
        }

        return undefined;
    }

    private parseReleaseDate(dateStr: string): Date | undefined {
        if (!dateStr) return undefined;

        try {
            // Handle various date formats
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return date;
            }

            // Handle format like "21 August 2012 – 17:00:00 UTC"
            const steamDateMatch = dateStr.match(/(\d{1,2}\s+\w+\s+\d{4})/);
            if (steamDateMatch) {
                return new Date(steamDateMatch[1]);
            }

            return undefined;
        } catch {
            return undefined;
        }
    }

    private parseTechnologies(techStr: string): string[] {
        if (!techStr) return [];

        return techStr
            .split(/[,|;]/)
            .map(t => t.trim())
            .filter(Boolean);
    }

    public async importGameData(gameData: RawGameData[]): Promise<{
        success: number;
        errors: Array<{ game: string; error: string }>;
        duplicates: number;
    }> {
        const results = {
            success: 0,
            errors: [] as Array<{ game: string; error: string }>,
            duplicates: 0
        };

        for (const rawGame of gameData) {
            try {
                if (!rawGame.title) {
                    results.errors.push({
                        game: 'Unknown',
                        error: 'Missing title'
                    });
                    continue;
                }

                // Check for existing game
                const steamAppId = rawGame.appId ? parseInt(rawGame.appId.toString()) : undefined;
                let existingGame = null;

                if (steamAppId) {
                    existingGame = await Game.findOne({ steam_app_id: steamAppId });
                }

                if (!existingGame) {
                    existingGame = await Game.findOne({
                        title: { $regex: new RegExp(`^${rawGame.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
                    });
                }

                if (existingGame) {
                    results.duplicates++;
                    console.log(`Duplicate found: ${rawGame.title}`);
                    continue;
                }

                // Process the game data
                const processedGame = {
                    title: rawGame.title,
                    steam_app_id: steamAppId,
                    developer: rawGame.developer,
                    publisher: rawGame.publisher,
                    franchise: rawGame.franchise,
                    technologies: this.parseTechnologies(rawGame.technologies || ''),
                    release_date: this.parseReleaseDate(rawGame.releaseDate || ''),
                    description: rawGame.description,
                    genre: this.parseGenres(rawGame.genres || rawGame.tags || ''),
                    rating: this.parseRating(rawGame.rating || ''),
                    reviewCount: this.parseReviewCount(rawGame.reviewCount || ''),
                    currentPlayers: rawGame.currentPlayers ? parseInt(rawGame.currentPlayers.toString()) : undefined,
                    supportedSystems: rawGame.supportedSystems?.split(/[,|;]/).map(s => s.trim()) || []
                };

                // Remove undefined values
                Object.keys(processedGame).forEach(key => {
                    if (processedGame[key as keyof typeof processedGame] === undefined) {
                        delete processedGame[key as keyof typeof processedGame];
                    }
                });

                const newGame = new Game(processedGame);
                await newGame.save();

                results.success++;
                console.log(`✅ Saved: ${rawGame.title} (ID: ${steamAppId || 'N/A'})`);

            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                results.errors.push({
                    game: rawGame.title || 'Unknown',
                    error: errorMsg
                });
                console.error(`❌ Error saving ${rawGame.title}:`, errorMsg);
            }
        }

        return results;
    }

    public async importFromJSON(jsonData: RawGameData[]): Promise<any> {
        console.log(`Starting import of ${jsonData.length} games from JSON...`);
        return await this.importGameData(jsonData);
    }

    public async importFromCSV(csvContent: string): Promise<any> {
        console.log('Parsing CSV content...');

        const lines = csvContent.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('CSV must contain at least a header and one data row');
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const gameData: RawGameData[] = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const game: any = {};

            headers.forEach((header, index) => {
                if (values[index]) {
                    // Map common CSV headers to our interface
                    const normalizedHeader = header.toLowerCase().replace(/[\s_-]+/g, '');

                    switch (normalizedHeader) {
                        case 'name':
                        case 'gamename':
                        case 'title':
                            game.title = values[index];
                            break;
                        case 'appid':
                        case 'steamappid':
                        case 'id':
                            game.appId = values[index];
                            break;
                        case 'genres':
                        case 'genre':
                        case 'categories':
                        case 'tags':
                            game.genres = values[index];
                            break;
                        case 'developer':
                        case 'dev':
                            game.developer = values[index];
                            break;
                        case 'publisher':
                        case 'pub':
                            game.publisher = values[index];
                            break;
                        case 'releasedate':
                        case 'released':
                        case 'date':
                            game.releaseDate = values[index];
                            break;
                        case 'rating':
                        case 'score':
                            game.rating = values[index];
                            break;
                        case 'reviews':
                        case 'reviewcount':
                            game.reviewCount = values[index];
                            break;
                        case 'description':
                        case 'summary':
                            game.description = values[index];
                            break;
                        case 'technologies':
                        case 'tech':
                        case 'engine':
                            game.technologies = values[index];
                            break;
                        default:
                            game[header] = values[index];
                    }
                }
            });

            if (game.title) {
                gameData.push(game as RawGameData);
            }
        }

        console.log(`Parsed ${gameData.length} games from CSV...`);
        return await this.importGameData(gameData);
    }
}
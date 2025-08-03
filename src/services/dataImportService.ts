import Game from "../models/gameModel";
import { GENRE_MAPPING, filterValidGenres, type GameGenre } from "../constants/genres";
import fs from 'fs';

interface RawGameData {
    title: string;
    steam_app_id?: string | number;
    genre?: string;
    developer?: string;
    publisher?: string;
    technologies?: string;
    release_date?: string;
    description?: string;
    image_url?: string;
}

export class DataImportService {
    private parseDevelopers(developerStr: string): string[] {
        if (!developerStr) return [];

        // Known company patterns that contain commas but should be treated as single entities
        const companyPatterns = [
            /(.+?),?\s+(Inc\.?|LLC\.?|Ltd\.?|Corporation|Corp\.?|Co\.?|Limited|AG|GmbH|S\.A\.?|PLC)$/i,
            /(.+?)\s+(Games?|Entertainment|Interactive|Studios?|Software|Digital|Media|Productions?)$/i
        ];

        // Check if this matches a known company pattern
        for (const pattern of companyPatterns) {
            const match = developerStr.match(pattern);
            if (match) {
                // If it's a company name with legal suffix, treat as single developer
                return [developerStr.trim()];
            }
        }

        // Special handling for quoted developers or developers with "Inc." etc.
        if (developerStr.includes('"')) {
            // Handle quoted strings - split by quotes first
            const quotedParts = developerStr.split('"').filter(part => part.trim());
            return quotedParts.map(part => part.replace(/^[,\s]+|[,\s]+$/g, '')).filter(Boolean);
        }

        // Check for known problematic cases
        const knownSingleDevelopers = [
            'FromSoftware, Inc.',
            'CAPCOM Co., Ltd.',
            'KRAFTON, Inc.',
            'Bandai Namco Entertainment',
            'Gaggle Studios, Inc.'
        ];

        if (knownSingleDevelopers.some(known => developerStr.includes(known))) {
            return [developerStr.trim()];
        }

        // If it contains " Inc." or similar, but has multiple parts, handle carefully
        if (developerStr.includes('Inc.') || developerStr.includes('Ltd.') || developerStr.includes('Corp.')) {
            // Split by comma, but rejoin parts that belong together
            const parts = developerStr.split(',').map(part => part.trim());
            const developers = [];
            let currentDev = '';

            for (let i = 0; i < parts.length; i++) {
                currentDev += (currentDev ? ', ' : '') + parts[i];

                // If this part ends with a company suffix or is the last part, treat as complete
                if (/\b(Inc\.?|LLC\.?|Ltd\.?|Corporation|Corp\.?|Co\.?)$/i.test(parts[i]) || i === parts.length - 1) {
                    developers.push(currentDev);
                    currentDev = '';
                }
            }
            return developers.filter(Boolean);
        }

        // Default: split by comma for multiple developers
        return developerStr
            .split(',')
            .map(dev => dev.trim())
            .filter(Boolean);
    }

    private parseGenres(genresStr: string): GameGenre[] {
        if (!genresStr) return [];

        // Remove quotes and split by comma
        const cleanGenres = genresStr.replace(/^"|"$/g, '');
        const rawGenres = cleanGenres.split(',').map(g => g.trim());
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

    private parseTechnologies(techStr: string): string[] {
        if (!techStr) return [];

        return techStr
            .split(/[,|;]/)
            .map(t => t.trim())
            .filter(Boolean);
    }

    private parseReleaseDate(dateStr: string): Date | undefined {
        if (!dateStr) return undefined;

        try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return date;
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    private parseImageUrl(rawGame: RawGameData): string | undefined {
        return rawGame.image_url || undefined;
    }

    public async importFromCSVFile(filePath: string): Promise<{
        success: number;
        errors: Array<{ game: string; error: string }>;
        duplicates: number;
    }> {
        try {
            const csvContent = fs.readFileSync(filePath, 'utf-8');
            return await this.importFromCSV(csvContent);
        } catch (error) {
            throw new Error(`Failed to read CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async importFromCSV(csvContent: string): Promise<{
        success: number;
        errors: Array<{ game: string; error: string }>;
        duplicates: number;
    }> {
        console.log('Parsing CSV content...');

        const lines = csvContent.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('CSV must contain at least a header and one data row');
        }

        // Parse CSV with proper quote handling
        const parseCSVLine = (line: string): string[] => {
            const result = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];

                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        };

        const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, ''));
        const gameData: RawGameData[] = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            const game: any = {};

            headers.forEach((header, index) => {
                if (values[index]) {
                    const normalizedHeader = header.toLowerCase().replace(/[\s_-]+/g, '');
                    const value = values[index].replace(/^"|"$/g, ''); // Remove surrounding quotes

                    switch (normalizedHeader) {
                        case 'title':
                            game.title = value;
                            break;
                        case 'steamappid':
                        case 'steam_app_id':
                        case 'appid':
                            game.steam_app_id = value;
                            break;
                        case 'genre':
                        case 'genres':
                            game.genre = value;
                            break;
                        case 'developer':
                        case 'developers':
                            game.developer = value;
                            break;
                        case 'publisher':
                            game.publisher = value;
                            break;
                        case 'technologies':
                        case 'tech':
                            game.technologies = value;
                            break;
                        case 'releasedate':
                        case 'release_date':
                            game.release_date = value;
                            break;
                        case 'description':
                            game.description = value;
                            break;
                        case 'imageurl':
                        case 'image_url':
                            game.image_url = value;
                            break;
                        default:
                            game[header] = value;
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
                const steamAppId = rawGame.steam_app_id ? parseInt(rawGame.steam_app_id.toString()) : undefined;
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
                const developers = this.parseDevelopers(rawGame.developer || '');
                const processedGame = {
                    title: rawGame.title,
                    steam_app_id: steamAppId,
                    developer: developers,
                    publisher: rawGame.publisher,
                    technologies: this.parseTechnologies(rawGame.technologies || ''),
                    release_date: this.parseReleaseDate(rawGame.release_date || ''),
                    description: rawGame.description,
                    genre: this.parseGenres(rawGame.genre || ''),
                    image_url: this.parseImageUrl(rawGame)
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
                console.log(`✅ Saved: ${rawGame.title} (ID: ${steamAppId || 'N/A'}) - Developers: [${developers.join(', ') || 'none'}] - Image: ${processedGame.image_url || 'none provided'}`);

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

    public async importFromJSON(gameData: RawGameData[]): Promise<{
        success: number;
        errors: Array<{ game: string; error: string }>;
        duplicates: number;
    }> {
        return await this.importGameData(gameData);
    }
}


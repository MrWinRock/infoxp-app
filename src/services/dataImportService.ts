import Game from "../models/gameModel";
import { GENRE_MAPPING, filterValidGenres, type GameGenre } from "../constants/genres";

export interface SteamGameRecord {
    _id?: string;
    AppID: number;
    Name: string;
    "Release date"?: number;
    "Required age"?: number;
    "About the game"?: string;
    "Header image"?: string;
    Windows?: boolean;
    Mac?: boolean;
    Linux?: boolean;
    Developers?: string[];
    Publishers?: string | string[];
    Categories?: string[];
    Genres?: string[];
}

export class DataImportService {
    private parseGenres(genres: string[] | undefined): GameGenre[] {
        if (!genres || genres.length === 0) return [];

        const mappedGenres: GameGenre[] = [];

        for (const genre of genres) {
            const upper = genre.toUpperCase().replace(/\s+/g, "_");
            const mapped = GENRE_MAPPING[upper] ?? GENRE_MAPPING[genre as keyof typeof GENRE_MAPPING];
            if (mapped && !mappedGenres.includes(mapped)) {
                mappedGenres.push(mapped);
            }
        }

        return filterValidGenres(mappedGenres);
    }

    public async importFromJSON(rows: SteamGameRecord[]): Promise<{
        success: number;
        errors: Array<{ game: string; error: string }>;
        duplicates: number;
        savedIds: string[];
    }> {
        const results = { success: 0, errors: [] as Array<{ game: string; error: string }>, duplicates: 0, savedIds: [] as string[] };

        for (const row of rows) {
            try {
                const title = row.Name?.trim();
                if (!title) {
                    results.errors.push({ game: "Unknown", error: "Missing Name" });
                    continue;
                }

                const appId = row.AppID || undefined;

                // Duplicate check by steam_app_id then exact title (case-insensitive)
                let existing: any = null;
                if (appId) {
                    existing = await Game.findOne({ steam_app_id: appId });
                }
                if (!existing) {
                    existing = await Game.findOne({
                        title: { $regex: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
                    });
                }
                if (existing) {
                    results.duplicates++;
                    continue;
                }

                const publishers = Array.isArray(row.Publishers) ? row.Publishers.join(", ") : (row.Publishers ?? undefined);
                const releaseDate = typeof row["Release date"] === "number" ? new Date(row["Release date"]) : undefined;

                const doc = new Game({
                    title,
                    steam_app_id: appId,
                    developer: row.Developers ?? [],
                    publisher: publishers,
                    technologies: [],
                    release_date: releaseDate,
                    description: row["About the game"],
                    genre: this.parseGenres(row.Genres ?? []),
                    image_url: row["Header image"],
                    required_age: row["Required age"] ?? 0,
                    platforms: {
                        windows: !!row.Windows,
                        mac: !!row.Mac,
                        linux: !!row.Linux
                    },
                    categories: row.Categories ?? []
                });

                await doc.save();
                results.success++;
                results.savedIds.push(String(doc._id));
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : "Unknown error";
                results.errors.push({ game: row.Name || "Unknown", error: errorMsg });
            }
        }

        return results;
    }

    // Helper to return DB docs in Steam-like response shape
    public toSteamShape(doc: any): SteamGameRecord {
        return {
            _id: doc?._id ? String(doc._id) : undefined,
            AppID: doc.steam_app_id,
            Name: doc.title,
            "Release date": doc.release_date ? new Date(doc.release_date).getTime() : undefined,
            "Required age": doc.required_age ?? 0,
            "About the game": doc.description,
            "Header image": doc.image_url,
            Windows: !!doc.platforms?.windows,
            Mac: !!doc.platforms?.mac,
            Linux: !!doc.platforms?.linux,
            Developers: doc.developer ?? [],
            Publishers: doc.publisher ?? undefined,
            Categories: doc.categories ?? [],
            Genres: doc.genre ?? []
        };
    }
}
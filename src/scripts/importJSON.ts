import "dotenv/config";
import mongoose from "mongoose";
import { promises as fs } from "fs";
import path from "path";
import { DataImportService, type SteamGameRecord } from "../services/dataImportService";

async function main() {
    const [, , inputPathArg] = process.argv;
    if (!inputPathArg) {
        console.error("Usage: bun run src/scripts/importJSON.ts <path-to-json>");
        process.exit(1);
    }

    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/infoxp";
    await mongoose.connect(uri);

    const absPath = path.resolve(inputPathArg);
    const raw = await fs.readFile(absPath, "utf-8");
    const data = JSON.parse(raw) as SteamGameRecord[]; // must be a JSON array

    const svc = new DataImportService();
    const result = await svc.importFromJSON(data);

    console.log("Import result:", JSON.stringify(result, null, 2));
    await mongoose.disconnect();

    // non-zero exit code if errors occurred
    if (result.errors.length > 0) process.exitCode = 2;
}

main().catch(async (err) => {
    console.error(err);
    try { await mongoose.disconnect(); } catch { }
    process.exit(1);
});
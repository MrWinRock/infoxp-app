import { connectToDatabase } from "../config/database";
import { DataImportService } from "../services/dataImportService";

const CSV_FILE_PATH = "c:\\Users\\mrwin\\Downloads\\infoxp_games - Sheet1 (1).csv";

(async () => {
    try {
        await connectToDatabase();

        console.log("🚀 Starting CSV import from your custom file...");
        console.log(`📁 Reading from: ${CSV_FILE_PATH}`);

        const importService = new DataImportService();
        const results = await importService.importFromCSVFile(CSV_FILE_PATH);

        console.log("\n📊 Import Results:");
        console.log(`✅ Successfully imported: ${results.success} games`);
        console.log(`🔄 Duplicates found: ${results.duplicates} games`);
        console.log(`❌ Errors: ${results.errors.length} games`);

        if (results.errors.length > 0) {
            console.log("\n❌ Error Details:");
            results.errors.forEach(error => {
                console.log(`  - ${error.game}: ${error.error}`);
            });
        }

        console.log("\n🎉 CSV import finished!");

        // Log some sample data to verify
        console.log("\n📋 Sample of imported games:");
        const Game = (await import("../models/gameModel")).default;
        const sampleGames = await Game.find({}).limit(3).select('title developer publisher image_url');
        sampleGames.forEach(game => {
            console.log(`  📦 ${game.title} by [${game.developer?.join(', ') || 'Unknown'}] - Image: ${game.image_url || 'none'}`);
        });

    } catch (error) {
        console.error("💥 CSV import failed:", error);
    } finally {
        process.exit(0);
    }
})();
import { connectToDatabase } from "./config/database";
import scrapeGameList from "./scraper/game8Scraper";

(async () => {
  await connectToDatabase();
  await scrapeGameList();
  process.exit(0);
})();

import { connectToDatabase } from "./config/database";
// import scrapeGameListFromGame8 from "./scraper/game8Scraper";
import { scrapeSteamDB } from "./scraper/steamDBScraper";

(async () => {
  await connectToDatabase();

  // console.log("Starting Game8 scraper...");
  // await scrapeGameListFromGame8();
  // console.log("Game8 scraper finished.");

  console.log("Starting SteamDB scraper...");
  await scrapeSteamDB(true);
  console.log("SteamDB scraper finished.");

  process.exit(0);
})();

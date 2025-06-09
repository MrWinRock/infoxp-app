import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Browser, Page } from "puppeteer";
import Game from "../models/gameModel";

const STEAMDB_BASE_URL = "https://steamdb.info";
const STEAMDB_CHARTS_URL = "https://steamdb.info/charts/";
// const MAX_GAMES_FROM_CHARTS_DEBUG = 10; // Optional: Limit for chart scraping during debug

// GameDetails remains as it's used for the individual game page scraping
interface GameDetails {
  developer?: string;
  publisher?: string;
  technologies?: string[];
  description?: string;
  releaseDate?: Date;
  genres?: string[];
}

// Interface for data extracted from the charts page rows
interface ChartRowData {
  title?: string | null;
  steamAppId?: number | null;
  gameChartPageUrl?: string | null;
}

function parseSteamDBReleaseTimestamp(
  timestamp: string | null | undefined
): Date | undefined {
  if (!timestamp) return undefined;
  const numTimestamp = parseInt(timestamp, 10);
  if (isNaN(numTimestamp) || numTimestamp === 0) return undefined;
  return new Date(numTimestamp * 1000);
}

function parseSteamDBReleaseText(
  dateText: string | null | undefined
): Date | undefined {
  if (
    !dateText ||
    dateText === "—" ||
    dateText.toLowerCase() === "tba" ||
    dateText.toLowerCase().includes("coming")
  ) {
    return undefined;
  }
  try {
    const parts = dateText.split(" ");
    if (parts.length === 2) {
      const month = parts[0];
      const year = parts[1];
      const parsedDate = new Date(`${month} 1, ${year}`);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }
    const date = new Date(dateText);
    return isNaN(date.getTime()) ? undefined : date;
  } catch (e) {
    console.warn(`Could not parse date text: "${dateText}"`, e);
    return undefined;
  }
}

const scrapeIndividualGamePage = async (
  page: Page,
  gamePageUrl: string
): Promise<GameDetails> => {
  const details: GameDetails = { technologies: [], genres: [] };
  try {
    await page.goto(gamePageUrl, { waitUntil: "networkidle2", timeout: 60000 });

    details.description = await page
      .$eval("p.header-description", (el) => el.textContent?.trim())
      .catch(() => undefined);

    const infoTableSelector = "table.table-bordered tbody";

    details.developer = await page
      .$eval(`${infoTableSelector} a[itemprop="author"]`, (el) =>
        el.textContent?.trim()
      )
      .catch(() =>
        page
          .$eval(`${infoTableSelector} a[href*="/developer/"]`, (el) =>
            el.textContent?.trim()
          )
          .catch(() => undefined)
      );

    details.publisher = await page
      .$eval(`${infoTableSelector} a[itemprop="publisher"]`, (el) =>
        el.textContent?.trim()
      )
      .catch(() =>
        page
          .$eval(`${infoTableSelector} a[href*="/publisher/"]`, (el) =>
            el.textContent?.trim()
          )
          .catch(() => undefined)
      );

    details.technologies = await page
      .$$eval(
        `${infoTableSelector} td a[href*="/tech/"]`,
        (els) =>
          els.map((el) => el.textContent?.trim()).filter(Boolean) as string[]
      )
      .catch(() => []);

    const releaseDateStr = await page
      .$eval(
        `${infoTableSelector} relative-time[itemprop="datePublished"]`,
        (el) => el.getAttribute("content")
      )
      .catch(() => null);

    if (releaseDateStr) {
      const parsedDate = new Date(releaseDateStr);
      if (!isNaN(parsedDate.getTime())) {
        details.releaseDate = parsedDate;
      }
    }

    details.genres = await page
      .$$eval("div.store-tags a.btn", (links) =>
        links
          .map((link) => link.textContent?.replace(/[\s\S]*?\s/, "").trim())
          .filter(
            (genre): genre is string => !!genre && genre !== "Unknown Genre"
          )
      )
      .catch(() => []);
  } catch (error) {
    console.error(`Error scraping game details from ${gamePageUrl}:`, error);
  }
  return details;
};

const scrapeSteamDBChartsPage = async (browser: Browser): Promise<void> => {
  let page: Page | null = null;
  console.log(`Scraping SteamDB charts page: ${STEAMDB_CHARTS_URL}`);
  try {
    page = await browser.newPage();
    // User-Agent is set from a previous modification, ensure it's a modern one.
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0"
    );
    await page.setViewport({ width: 1920, height: 1080 });

    console.log(`Navigating to ${STEAMDB_CHARTS_URL}...`);
    await page.goto(STEAMDB_CHARTS_URL, {
      waitUntil: "networkidle0", // Changed to networkidle0 for more comprehensive loading
      timeout: 120000, // Increased timeout to 2 minutes for page navigation with networkidle0
    });

    console.log(
      "Initial navigation complete. Pausing for 15 seconds to allow Cloudflare to present challenges..."
    );
    await new Promise((resolve) => setTimeout(resolve, 15000)); // 15-second initial pause

    // Enhanced instructions for manual intervention with a dedicated pause
    console.log(
      "\\\\n================================================================================"
    );
    console.log(
      "IMPORTANT: MANUAL INTERVENTION LIKELY REQUIRED FOR CLOUDFLARE"
    );
    console.log(
      "================================================================================"
    );
    console.log("A headful browser window ('Microsoft Edge') should be open.");
    console.log(
      "If a Cloudflare challenge (e.g., 'Verify you are human', CAPTCHA, checkbox) appears,"
    );
    console.log(
      "you MUST interact with it and solve it MANUALLY in that browser window."
    );
    console.log(
      "The script will now PAUSE for 2 MINUTES to give you time to do this."
    );
    console.log(
      "Please focus on the browser window and complete any necessary steps NOW."
    );
    console.log(
      "After 2 minutes, the script will attempt to find the game data."
    );
    console.log(
      "================================================================================\\\\n"
    );

    // Explicit 2-minute (120,000 ms) pause for manual intervention
    await new Promise((resolve) => setTimeout(resolve, 120000));

    console.log(
      "Manual intervention window finished. Checking page state comprehensively..."
    );

    const currentUrlAfterIntervention = page.url();
    const pageTitleAfterIntervention = await page.title();

    console.log(
      `Current URL after 2-min pause: ${currentUrlAfterIntervention}`
    );
    console.log(
      `Current Page Title after 2-min pause: \"${pageTitleAfterIntervention}\"`
    );

    try {
      if (page && !page.isClosed()) {
        const pageContentSnapshot = await page.content();
        console.log(
          "Page content snapshot immediately after 2-min pause (first 1500 chars):\\n",
          pageContentSnapshot.substring(0, 1500)
        );
      } else {
        console.warn(
          "Page was closed before content snapshot could be taken after 2-min pause."
        );
      }
    } catch (contentError) {
      console.error(
        "Error getting page content snapshot after 2-min pause:",
        contentError
      );
    }

    if (pageTitleAfterIntervention.includes("Just a moment...")) {
      console.error(
        `Cloudflare challenge likely still active after manual intervention. Page title is: "${pageTitleAfterIntervention}"`
      );
      console.log(
        "Manual intervention may not have been successful, or Cloudflare is re-challenging."
      );
      try {
        if (page && !page.isClosed()) {
          const pageContent = await page.content();
          console.log(
            "Page content after intervention attempt (first 2000 chars):",
            pageContent.substring(0, 2000)
          );
          const screenshotPath =
            "d:/Coding/infoxp-app/debug_steamdb_charts_after_intervention_still_cf.png";
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`Screenshot saved to ${screenshotPath}`);
        } else {
          console.warn(
            "Page was closed before logging Cloudflare persistence."
          );
        }
      } catch (logError) {
        console.error(
          "Error during logging after failed intervention (Cloudflare still active):",
          logError
        );
      }
      return; // Exit if Cloudflare is still present
    } else {
      console.log(
        `Page title is now: \"${pageTitleAfterIntervention}\". Verifying basic page content before looking for game table...`
      );

      const genericHeaderSelector = "h1"; // Main page heading
      let headerTextContent: string | null | undefined = null;
      try {
        console.log(
          `Attempting to find generic header: \"${genericHeaderSelector}\". Waiting up to 10 seconds...`
        );
        await page.waitForSelector(genericHeaderSelector, {
          timeout: 10000, // 10-second timeout for this basic check
          visible: true,
        });
        headerTextContent = await page.$eval(
          genericHeaderSelector,
          (el: Element) => el.textContent?.trim()
        );
        console.log(
          `Found generic header with text: \"${headerTextContent}\". Page seems to be loaded.`
        );
        // Check if header text indicates it's the charts page
        if (
          !headerTextContent ||
          (!headerTextContent.toLowerCase().includes("chart") &&
            !headerTextContent.toLowerCase().includes("played") &&
            !headerTextContent.toLowerCase().includes("popular") &&
            !headerTextContent.toLowerCase().includes("games"))
        ) {
          console.warn(
            `Generic header found (\"${headerTextContent}\"), but text might not be the expected charts page header (e.g., 'Most Popular Games', 'Charts'). Proceeding with caution.`
          );
        }
      } catch (headerError) {
        console.error(
          `Generic header selector \"${genericHeaderSelector}\" not found after Cloudflare pause. Page title was \"${pageTitleAfterIntervention}\". This suggests the page may not have loaded correctly despite the title change, or is not the expected SteamDB charts page.`
        );
        try {
          if (page && !page.isClosed()) {
            const pageContent = await page.content();
            console.log(
              "Page content when generic header not found (first 2000 chars):",
              pageContent.substring(0, 2000)
            );
            const screenshotPath =
              "d:/Coding/infoxp-app/debug_steamdb_charts_no_generic_header.png";
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Screenshot saved to ${screenshotPath}`);
          } else {
            console.warn(
              "Page was closed before logging generic header absence."
            );
          }
        } catch (logError) {
          console.error(
            "Error during logging (generic header not found):",
            logError
          );
        }
        return; // Exit if basic page structure isn't even there
      }
      // If we reach here, generic header was found.
      console.log(
        "Basic page content verified (or warning issued). Now attempting to find game rows selector..."
      );
    } // End of the 'else' block for title check

    const gameRowsSelector = "table#table-apps tbody tr.app[data-appid]";
    const waitForSelectorTimeout = 60000; // 1 minute timeout for selector
    try {
      console.log(
        `Attempting to find selector: \\"${gameRowsSelector}\\". Waiting up to ${
          waitForSelectorTimeout / 1000
        } seconds for it to become visible...`
      );
      // Timeout for waitForSelector after the dedicated manual intervention pause
      await page.waitForSelector(gameRowsSelector, {
        timeout: waitForSelectorTimeout,
        visible: true,
      });
      console.log(`Selector \\"${gameRowsSelector}\\" found successfully.`);
    } catch (e) {
      const currentTitle =
        page && !page.isClosed()
          ? await page.title()
          : "Page closed or inaccessible";
      console.error(
        `Selector "${gameRowsSelector}" not found on charts page: ${STEAMDB_CHARTS_URL}. This occurred after a ~2.25 minute pause (15s initial + 2min manual) for Cloudflare intervention, followed by up to a 1-minute wait for the selector. Current page title: \"${currentTitle}\". This might indicate a persistent Cloudflare block or a change in page structure.`,
        e
      );
      try {
        if (page && !page.isClosed()) {
          const pageContent = await page.content();
          console.log(
            "Page content on selector failure (first 5000 chars):",
            pageContent.substring(0, 5000)
          );
          const screenshotPath =
            "d:/Coding/infoxp-app/debug_steamdb_charts_selector_failure.png";
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`Screenshot saved to ${screenshotPath}`);
        } else {
          console.error(
            "Page was closed before failure logging could occur for selector not found."
          );
        }
      } catch (logError) {
        const logErrorMessage =
          logError instanceof Error ? logError.message : String(logError);
        console.error(
          `Error during failure logging (selector not found): ${logErrorMessage}`
        );
      }
      return; // Exit if selector not found
    }

    const chartsData: ChartRowData[] = await page.$$eval(
      gameRowsSelector,
      (rows) =>
        rows.map((row) => {
          const appId = row.getAttribute("data-appid");
          const titleEl =
            row.querySelector<HTMLAnchorElement>("td:nth-child(3) a");
          return {
            title: titleEl?.textContent?.trim(),
            steamAppId: appId ? parseInt(appId, 10) : null,
            gameChartPageUrl: titleEl?.getAttribute("href"),
          };
        })
    );

    if (chartsData.length === 0) {
      console.warn(
        // Kept as warn, but added more logging
        `No game data extracted from rows on charts page, even though selector "${gameRowsSelector}" was found. Check $$eval logic or page content.`
      );
      try {
        const pageContent = await page.content();
        console.log(
          "Page content when no data extracted (first 5000 chars):",
          pageContent.substring(0, 5000)
        );
        const screenshotPath =
          "d:/Coding/infoxp-app/debug_steamdb_charts_no_data_extracted.png";
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Screenshot saved to ${screenshotPath}`);
      } catch (logError) {
        console.error(
          "Error during failure logging (no data extracted):",
          logError
        );
      }
      return;
    }
    console.log(`Found ${chartsData.length} games on the charts page.`);
    let gamesProcessed = 0;

    for (const chartGame of chartsData) {
      // Optional: Implement a MAX_GAMES_FROM_CHARTS_DEBUG limit if needed
      // if (MAX_GAMES_FROM_CHARTS_DEBUG > 0 && gamesProcessed >= MAX_GAMES_FROM_CHARTS_DEBUG) {
      //   console.log(`Reached MAX_GAMES_FROM_CHARTS_DEBUG limit.`);
      //   break;
      // }

      if (!chartGame.steamAppId || !chartGame.title) {
        console.warn(
          "Skipping game with missing AppID or Title from charts:",
          chartGame
        );
        continue;
      }

      let gamePageUrl = null;
      if (chartGame.gameChartPageUrl) {
        const appSpecificPath = chartGame.gameChartPageUrl.replace(
          "/charts/",
          "/"
        );
        if (appSpecificPath.startsWith("/app/")) {
          gamePageUrl = `${STEAMDB_BASE_URL}${appSpecificPath}`;
        }
      }

      if (!gamePageUrl) {
        console.warn(
          `Could not derive game page URL for ${chartGame.title} (AppID: ${chartGame.steamAppId}). Skipping detail scraping.`
        );
        continue;
      }

      let gameDetails: GameDetails = {};
      let detailPage: Page | null = null;
      try {
        console.log(
          `Scraping details for ${chartGame.title} from ${gamePageUrl}`
        );
        detailPage = await browser.newPage();
        await detailPage.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        );
        gameDetails = await scrapeIndividualGamePage(detailPage, gamePageUrl);
      } catch (detailError) {
        console.error(
          `Failed to scrape details for ${chartGame.title} from ${gamePageUrl}`,
          detailError
        );
      } finally {
        if (detailPage && !detailPage.isClosed()) await detailPage.close();
      }

      try {
        const gameDataToSave = {
          title: chartGame.title,
          steam_app_id: chartGame.steamAppId,
          developer: gameDetails.developer,
          publisher: gameDetails.publisher,
          technologies: gameDetails.technologies || [],
          description: gameDetails.description,
          release_date: gameDetails.releaseDate,
          genre: gameDetails.genres || [],
        };

        const updatedGame = await Game.findOneAndUpdate(
          { steam_app_id: chartGame.steamAppId },
          { $set: gameDataToSave },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log(
          `Saved/Updated from charts: ${updatedGame.title} (AppID: ${updatedGame.steam_app_id})`
        );
        gamesProcessed++;
      } catch (dbError) {
        console.error(
          `Failed to save game ${chartGame.title} (from charts) to DB:`,
          dbError
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  } catch (error) {
    console.error(
      `Error scraping SteamDB charts page ${STEAMDB_CHARTS_URL}:`,
      error
    );
    if (page && !page.isClosed()) {
      // Check before screenshot on overall error
      try {
        const screenshotPath =
          "d:/Coding/infoxp-app/debug_steamdb_charts_overall_error.png";
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Screenshot on overall error saved to ${screenshotPath}`);
      } catch (screenshotError) {
        const screenshotErrorMessage =
          screenshotError instanceof Error
            ? screenshotError.message
            : String(screenshotError);
        console.error(
          `Error taking screenshot on overall error: ${screenshotErrorMessage}`
        );
      }
    } else if (!page) {
      console.error("Page was null during overall error handling.");
    } else {
      console.error(
        "Page was closed before overall error screenshot could be taken."
      );
    }
  } finally {
    if (page && !page.isClosed()) {
      await page.close();
    }
    console.log("Finished scraping SteamDB charts page.");
  }
};

export const scrapeSteamDB = async (headlessInput: boolean = true) => {
  // Renamed parameter to avoid conflict
  let browser: Browser | null = null;
  console.log("Starting SteamDB scraper (Charts Only) using Microsoft Edge...");
  try {
    puppeteerExtra.use(StealthPlugin());
    browser = await puppeteerExtra.launch({
      executablePath:
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", // Path to Edge
      headless: false, // Forcing headful for Cloudflare
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920,1080",
        "--disable-blink-features=AutomationControlled", // Kept for stealth
      ],
    });

    // Directly call the function to scrape the charts page.
    await scrapeSteamDBChartsPage(browser);

    console.log("SteamDB charts scraping finished.");
  } catch (error) {
    console.error("Error during SteamDB charts scraping process:", error);
  } finally {
    if (browser) await browser.close();
  }
};

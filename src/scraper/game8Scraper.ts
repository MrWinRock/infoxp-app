import puppeteer, { Browser } from "puppeteer";
import Game from "../models/gameModel";

const BASE_URL = "https://game8.co/games";

function parseReleaseDate(raw: string): Date | undefined {
  if (!raw) return undefined;
  // Remove day of week and extra text in parentheses
  let cleaned = raw
    .replace(/\(.*?\)/g, "")
    .replace(/(Mon\.|Tue\.|Wed\.|Thu\.|Fri\.|Sat\.|Sun\.)/gi, "")
    .replace(/(st|nd|rd|th)/gi, "") // Remove ordinal suffixes
    .replace(/[^a-zA-Z0-9,.\s:]/g, "") // Remove non-date chars except common ones
    .replace(/\s+/g, " ")
    .trim();

  // Try parsing with Date
  let date = new Date(cleaned);
  if (!isNaN(date.getTime())) return date;

  // Try parsing with month abbreviations (e.g., Jun. 06, 2023)
  cleaned = cleaned.replace(/\./g, "");
  date = new Date(cleaned);
  if (!isNaN(date.getTime())) return date;

  // Try MM/DD/YYYY
  const mmddyyyy = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (mmddyyyy) {
    date = new Date(`${mmddyyyy[3]}-${mmddyyyy[1]}-${mmddyyyy[2]}`);
    if (!isNaN(date.getTime())) return date;
  }

  // If all fails, return undefined
  return undefined;
}

const scrapeGameList = async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle2" });
  } catch (err) {
    console.error(`Failed to load ${BASE_URL}:`, err);
    await browser.close();
    return;
  }

  // Try to find the selector, but don't throw if not found
  const selector = ".c-gameList-content-title a";
  const selectorExists = await page.$(selector);

  if (!selectorExists) {
    console.warn(
      `Selector ${selector} not found on ${BASE_URL}. No games to scrape.`
    );
    await browser.close();
    return;
  }

  const foundElements = await page.$$eval(selector, (elements) =>
    elements.map((el) => ({
      tag: el.tagName,
      class: el.className,
      text: el.textContent?.trim(),
      href:
        (el as HTMLElement).getAttribute &&
        (el as HTMLElement).getAttribute("href"),
      children: Array.from(el.children).map((child) => ({
        tag: child.tagName,
        class: child.className,
        text: child.textContent?.trim(),
      })),
    }))
  );
  console.log("Found elements:", JSON.stringify(foundElements, null, 2));

  const games = await page.$$eval(selector, (elements) =>
    elements.map((el) => {
      const title = el.textContent?.trim();
      const url = el.getAttribute("href");
      return { title, url };
    })
  );

  console.log("Found games:", games.length);

  if (games.length === 0) {
    console.warn("No games found. Check the selector and page structure.");
    await browser.close();
    return;
  }
  for (const game of games) {
    if (!game.title || !game.url) continue;
    const detailUrl = game.url.startsWith("http")
      ? game.url
      : `https://game8.co${game.url}`;
    const details = await scrapeGameDetails(browser, detailUrl);
    if (!details.description || !details.genre || !details.release_date) {
      console.warn(`Skipping incomplete game: ${game.title}`);
      continue;
    }

    const newGame = new Game({
      title: details.title || game.title,
      genre: details.genre,
      description: details.description,
      release_date: details.release_date,
    });

    try {
      await newGame.save();
      console.log(`Saved: ${newGame.title}`);
    } catch (err) {
      console.error(`Failed to save ${newGame.title}:`, err);
    }
  }

  await browser.close();
};

const scrapeGameDetails = async (browser: Browser, url: string) => {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle2" });
  } catch (err) {
    console.error(`Failed to load ${url}:`, err);
    await page.close();
    return { description: "", genre: [], release_date: undefined, title: "" };
  }

  let description = "";
  let genre: string[] = [];
  let releaseDateText = "";
  let title = "";

  // 1. Try to get the title from the <h2> header
  try {
    title = await page.$eval(
      "h2.a-header--2#hl_24",
      (el) => el.textContent?.trim() || ""
    );
  } catch {}

  // 2. Try to get a summary/description from a common class or from the table
  try {
    description = await page.$eval(
      ".p-game-lead__text",
      (el) => el.textContent?.trim() || ""
    );
  } catch {
    // fallback: try to get from the table if not found
    try {
      description = await page.$$eval("table.a-table tr", (rows) => {
        for (const row of rows) {
          const th = row.querySelector("th")?.textContent?.trim();
          if (th && th.toLowerCase().includes("full title")) {
            return row.querySelector("td")?.textContent?.trim() || "";
          }
        }
        return "";
      });
    } catch {}
  }

  // 3. Parse the table for genre and release date
  try {
    const tableData = await page.$$eval("table.a-table tr", (rows) => {
      let genre: string[] = [];
      let releaseDate = "";
      let title = "";
      // Helper to get all text from th, including <b>
      function getThText(th: Element | null): string {
        if (!th) return "";
        return th.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "";
      }
      for (const row of rows) {
        const th = row.querySelector("th");
        const thText = getThText(th);
        const td = row.querySelector("td")?.textContent?.trim() || "";

        // Genre (robust for "genre" anywhere in th)
        if (thText.includes("genre")) {
          // Split by comma or <hr> or <br>
          genre = td
            .split(/,|・|<hr|<br/i)
            .map((g) => g.replace(/[\r\n]+/g, "").trim())
            .filter(Boolean);
        }
        // Release Date (robust for "release date" anywhere in th)
        if (thText.includes("release date")) {
          const bold = row.querySelector("b")?.textContent?.trim();
          releaseDate = bold || td;
        }
        // Full Title (EN)
        if (thText.includes("full title")) {
          const match = td.match(/EN:\s*([^\n<]+)/);
          if (match) title = match[1].trim();
          else title = td;
        }
        // Fallback: sometimes title is just the first row
        if (!title && thText.includes("title")) {
          title = td;
        }
      }
      return { genre, releaseDate, title };
    });

    genre = tableData.genre;
    releaseDateText = tableData.releaseDate;
  } catch {}

  await page.close();

  // 4. Fallback: use the page's <title> if no title found
  if (!title) {
    try {
      title = await page.title();
    } catch {}
  }

  return {
    description,
    genre,
    release_date: parseReleaseDate(releaseDateText),
    title,
  };
};

export default scrapeGameList;

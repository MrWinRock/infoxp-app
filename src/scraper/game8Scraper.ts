import puppeteer, { Browser } from "puppeteer";
import Game from "../models/gameModel";

const BASE_URL = "https://game8.co/games/letters";

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
    // Use the URL as-is if it starts with "http", otherwise prepend the domain
    const detailUrl = game.url.startsWith("http")
      ? game.url
      : `https://game8.co${game.url}`;
    const details = await scrapeGameDetails(browser, detailUrl);
    if (!details.description || !details.genre || !details.release_date) {
      console.warn(`Skipping incomplete game: ${game.title}`);
      continue;
    }

    const newGame = new Game({
      title: game.title,
      genre: details.genre,
      description: details.description,
      release_date: details.release_date,
    });

    try {
      await newGame.save();
      console.log(`Saved: ${game.title}`);
    } catch (err) {
      console.error(`Failed to save ${game.title}:`, err);
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
    return { description: "", genre: [], release_date: undefined };
  }

  let description = "";
  let genre: string[] = [];
  let releaseDateText = "";

  try {
    description = await page.$eval(
      ".c-gameDescription",
      (el) => el.textContent?.trim() || ""
    );
  } catch {}

  try {
    genre = await page.$$eval(".c-gameGenre", (els) =>
      els
        .map((el) => el.textContent?.trim())
        .filter(
          (text): text is string => typeof text === "string" && text.length > 0
        )
    );
  } catch {}

  try {
    releaseDateText = await page.$eval(
      ".c-releaseDate",
      (el) => el.textContent?.trim() || ""
    );
  } catch {}

  await page.close();

  return {
    description,
    genre,
    release_date: releaseDateText ? new Date(releaseDateText) : undefined,
  };
};

export default scrapeGameList;

// render-optimized server.js
import express from "express";
import cors from "cors";
import responseTime from "response-time";
import "dotenv/config";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;
let browser = null;
let engCache = "";
let krCache = "";
let isRefreshing = false;

async function getBrowser() {
  try {
    if (!browser || !browser.isConnected()) {
      console.log("Launching Chromium...");
      browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-software-rasterizer",
          "--no-zygote",
        ],
      });
    }
    return browser;
  } catch (error) {
    console.error("Browser launch failed:", error);
    throw error;
  }
}

async function fetchDotaRankings(selector) {
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );

    await page.goto("https://stratz.com/rankings", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await page.waitForSelector(selector, { timeout: 60000 });
    const element = await page.$(selector);
    if (!element) throw new Error(`Selector not found: ${selector}`);

    const text = await page.evaluate((el) => el.textContent, element);
    await page.close();
    return text;
  } catch (error) {
    console.error("Scraping failed:", error);
    return "Error fetching data";
  }
}

async function refreshCache() {
  if (isRefreshing) return;
  isRefreshing = true;

  console.log("Refreshing cache...");

  try {
    engCache = await fetchDotaRankings(
      "#root > div > div > div > div:nth-child(3) > div:nth-child(5) > div:nth-child(1) > div > span"
    );
    krCache = await fetchDotaRankings(
      "#root > div > div > div > div:nth-child(3) > div:nth-child(5) > div:nth-child(2) > div > span"
    );
    console.log("Cache updated.");
  } catch (error) {
    console.error("Cache refresh error:", error);
  } finally {
    isRefreshing = false;
  }
}

setInterval(refreshCache, 60 * 60 * 1000);
refreshCache();

app.use(cors());
app.use(responseTime());

app.get("/", (req, res) => {
  res.send("Nightbot Dota Ranking API (Render Optimized)");
});

function formatRank(text) {
  if (!text || text.includes("Error")) return "데이터 오류";
  return text.replace("Leaderboard : ", "Rank: ");
}

app.get("/nightbot", async (req, res) => {
  const { q } = req.query;
  if (!q || q !== "today") return res.send("다시 시도해주세요.");

  console.log("Nightbot request received.");

  const englishRank = formatRank(engCache);
  const koreanRank = formatRank(krCache);

  res.set(
    "User-Agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  );
  res.set("Cache-Control", "public, max-age=60");

  const response = `오늘 LOWPRIO에 빠질 확률은 [${englishRank}] 입니다.\n한국 TOP1도마찬가지입니다 : [${koreanRank}]`;
  res.send(response);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

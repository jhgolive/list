import express from "express";
import cors from "cors";
import responseTime from "response-time";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(responseTime());

let cachedData = null;
let lastUpdated = null;

// Render 서버에서 설치될 Chrome 경로
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";

const LAUNCH_OPTIONS = {
  executablePath: CHROME_PATH,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
  ],
};

async function getBrowser() {
  console.log("Launching Chromium at:", CHROME_PATH);
  return await puppeteer.launch(LAUNCH_OPTIONS);
}

async function fetchDotaRankings() {
  console.log("Launching browser...");
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    console.log("Scraping page...");
    await page.goto("https://www.opendota.com/leaderboards", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    const result = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("tbody tr")];
      return rows.map(row => {
        const tds = row.querySelectorAll("td");
        return {
          rank: tds[0]?.innerText.trim(),
          player: tds[1]?.innerText.trim(),
          mmr: tds[2]?.innerText.trim()
        };
      });
    });

    await browser.close();
    return result;
  } catch (err) {
    console.error("Scraping error:", err);
    await browser.close();
    return null;
  }
}

async function refreshCache() {
  console.log("Refreshing cache...");
  const data = await fetchDotaRankings();
  if (data) {
    cachedData = data;
    lastUpdated = new Date().toISOString();
    console.log("Cache updated successfully.");
  } else {
    console.log("Cache update failed.");
  }
}

refreshCache();
setInterval(refreshCache, 5 * 60 * 1000);

app.get("/", (req, res) => {
  res.send({
    updated: lastUpdated,
    count: cachedData?.length || 0,
    data: cachedData
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

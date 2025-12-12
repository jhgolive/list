import express from "express";
import cors from "cors";
import responseTime from "response-time";
import dotenv from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Puppeteer Stealth 적용
puppeteer.use(StealthPlugin());

// Puppeteer 기본 launch 옵션 (Render + Docker 환경 최적화)
const LAUNCH_OPTIONS = {
  headless: "new",
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--no-first-run",
    "--no-zygote",
    "--single-process"
  ]
};

// 기본 세팅
app.use(cors());
app.use(express.json());
app.use(responseTime());

// ===============================
//   테스트용 Health Check
// ===============================
app.get("/", (req, res) => {
  res.send("Dota Ranking Server is running!");
});

// ===============================
//   Nightbot 호출 API 예시
//   /ranking?player=닉네임
// ===============================
app.get("/ranking", async (req, res) => {
  const player = req.query.player;

  if (!player) {
    return res.status(400).send("player 파라미터가 필요합니다.");
  }

  let browser;
  try {
    console.log("Launching browser...");
    browser = await puppeteer.launch(LAUNCH_OPTIONS);
    const page = await browser.newPage();

    const url = `https://example.com/ranking/${encodeURIComponent(player)}`;
    console.log("Opening:", url);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // 예: 랭킹 텍스트 추출
    const result = await page.evaluate(() => {
      const rank = document.querySelector(".rank");
      return rank ? rank.innerText.trim() : "랭킹 정보를 찾을 수 없습니다.";
    });

    res.send(`${player}님 랭킹: ${result}`);

  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("오류가 발생했습니다. (Puppeteer Launch 실패 or Selector 변경)");
  } finally {
    if (browser) await browser.close();
  }
});

// ===============================
//   서버 시작
// ===============================
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

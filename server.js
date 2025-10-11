// filename: server-puppeteer.js
import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

// /nightbot?date=2025-10-14
app.get("/nightbot", async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0,10); // YYYY-MM-DD
  const url = `https://kukmin.libertysocial.co.kr/assembly?date=${encodeURIComponent(date)}`;

  let browser;
  try {
    browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true
    });
    const page = await browser.newPage();
    // 필요한 경우 user agent 설정
    await page.setUserAgent("Mozilla/5.0 (compatible; NightbotFetcher/1.0)");
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // 시도할 선택자들 (사이트 구조에 따라 조정)
    const content = await page.evaluate(() => {
      // 우선 전체 본문 텍스트를 가져오되,
      // 더 정확히 데이터가 들어있는 element가 있으면 그걸 우선시
      const candidates = [
        document.querySelector("main"),
        document.querySelector("#__next"),
        document.querySelector("body"),
      ];
      for (const el of candidates) {
        if (el && el.innerText.trim().length > 10) {
          return el.innerText.trim();
        }
      }
      return document.body.innerText.trim();
    });

    // 텍스트 길이 제한(나이트봇 등에서 너무 길면 잘릴 수 있으니 적당히 잘라서 반환)
    const snippet = content.length > 1500 ? content.slice(0, 1500) + "…(생략)" : content;
    res.type("text/plain").send(snippet);
  } catch (err) {
    console.error(err);
    res.status(500).send("ERROR: failed to fetch page");
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

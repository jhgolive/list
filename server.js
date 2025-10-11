import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

// MMDD → YYYY-MM-DD (현재 연도)
function parseMMDD(mmdd) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const month = mmdd.slice(0, 2);
  const day = mmdd.slice(2, 4);
  return `${currentYear}-${month}-${day}`;
}

app.get("/nightbot", async (req, res) => {
  let input = req.query.date || "";
  let dateStr;

  if (/^\d{4}$/.test(input)) {
    dateStr = parseMMDD(input); // MMDD → YYYY-MM-DD
  } else {
    const today = new Date();
    dateStr = today.toISOString().slice(0, 10); // 오늘 날짜
  }

  const url = `https://kukmin.libertysocial.co.kr/assembly?date=${encodeURIComponent(dateStr)}`;

  let browser;
  try {
    browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (compatible; NightbotFetcher/1.0)");
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // 일정 항목만 추출 (사이트 구조에 맞게 조정 가능)
    const content = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("div[class*='assembly-item']"));
      if (items.length > 0) {
        return items.map(i => i.innerText.trim()).join("\n\n");
      }
      // fallback: 전체 텍스트
      return document.body.innerText.trim();
    });

    // 나이트봇 메시지 길이 제한
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

import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", async (req, res) => {
  let input = req.query.date || "";
  
  // 입력값: 1014 → 2025-10-14
  let dateStr;
  if (/^\d{4}$/.test(input)) {
    const month = input.slice(0,2);
    const day = input.slice(2,4);
    dateStr = `2025-${month}-${day}`; // 연도 고정 가능, 필요시 현재 연도 사용
  } else {
    // 올바른 형식이 아니면 오늘 날짜
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');
    dateStr = `${yyyy}-${mm}-${dd}`;
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

    // 일정 목록만 추출
    const content = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("div[class*='assembly-item']"));
      if (items.length > 0) {
        return items.map(i => i.innerText.trim()).join("\n\n");
      }
      // fallback: 전체 텍스트
      return document.body.innerText.trim();
    });

    // 나이트봇 메시지 길이 제한 대비
    const snippet = content.length > 1500 ? content.slice(0,1500) + "…(생략)" : content;

    res.type("text/plain").send(snippet);
  } catch (err) {
    console.error(err);
    res.status(500).send("ERROR: failed to fetch page");
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

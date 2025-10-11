import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

// MMDD → YYYY-MM-DD 변환 (현재 연도 자동 적용)
function parseMMDD(mmdd) {
  const today = new Date();
  const year = today.getFullYear();
  const month = mmdd.slice(0, 2);
  const day = mmdd.slice(2, 4);
  return `${year}-${month}-${day}`;
}

app.get("/nightbot", async (req, res) => {
  let input = req.query.date || "";
  let dateStr;

  if (/^\d{4}$/.test(input)) {
    dateStr = parseMMDD(input);
  } else {
    const today = new Date();
    dateStr = today.toISOString().slice(0, 10);
  }

  const url = `https://kukmin.libertysocial.co.kr/assembly?date=${encodeURIComponent(dateStr)}`;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // 페이지 전체 텍스트 추출
    const text = await page.evaluate(() => document.body.innerText);

    let cleaned = text
      // "알림광장"부터 "제주"까지만 제거 (다음 줄은 남겨둠)
      .replace(/알림광장[\s\S]*?제주(?!\S)/, "")
      .trim();

    // 일정 블록만 추출 (제목 + 시작 + 종료)
    const matches = [...cleaned.matchAll(/(.+?)\s*시작\s*([0-9:]+)\s*종료\s*([0-9:]+)/g)];
    let output = matches
      .map((m) => `📅 ${m[1].trim()}\n⏰ ${m[2]} ~ ${m[3]}`)
      .join("\n\n");

    if (!output) output = "해당 날짜에 일정이 없습니다.";

    // 나이트봇 길이 제한 1500자
    const result = output.length > 1500 ? output.slice(0, 1500) + "…(생략)" : output;

    res.type("text/plain").send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send("ERROR: failed to fetch schedule");
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

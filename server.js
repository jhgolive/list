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

    // 불필요한 상단 메뉴와 지역명 제거
    let cleaned = text
      .replace(/알림광장[\s\S]*?(전국\s*서울\s*부산\s*대구\s*인천\s*광주\s*대전\s*울산\s*세종\s*경기\s*강원\s*충청\s*전라\s*경상\s*제주)/, "")
      .trim();

    // 날짜별 일정 블록 추출 (시간 없어도 포함)
    const matches = [
      ...cleaned.matchAll(
        /(\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*\([^)]*\)[\s\S]*?)(?=\d{4}년\s*\d{1,2}월\s*\d{1,2}일|\s*해당 날짜에 일정이 없습니다|$)/g
      ),
    ];
    
    let output = matches
      .map((m) =>
        m[1]
          .trim()
          .replace(/\n{2,}/g, "\n")
          .replace(/\s{2,}/g, " ")
      )
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

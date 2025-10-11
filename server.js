import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

// MMDD → 한국식 날짜 (YYYY년 MM월 DD일 (요일))
function parseMMDD(mmdd) {
  const today = new Date();
  const year = today.getFullYear();
  const month = parseInt(mmdd.slice(0, 2), 10);
  const day = parseInt(mmdd.slice(2, 4), 10);
  const date = new Date(year, month - 1, day);

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const weekday = weekdays[date.getDay()];

  return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

// 한국 시간 기준 오늘 날짜 → YYYY-MM-DD (URL용)
function todayYYYYMMDD_KST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC → KST
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 한국 시간 기준 오늘 날짜 → 한국식 문자열
function todayKoreanStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getFullYear();
  const m = kst.getMonth() + 1;
  const d = kst.getDate();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const weekday = weekdays[kst.getDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

app.get("/nightbot", async (req, res) => {
  let input = req.query.date || ""; // MMDD 입력 가능
  let dateStr;       // 한국식 날짜 문자열
  let urlDateStr;    // URL용 YYYY-MM-DD

  if (/^\d{4}$/.test(input)) {
    dateStr = parseMMDD(input);
    const today = new Date();
    urlDateStr = `${today.getFullYear()}-${input.slice(0, 2)}-${input.slice(2, 4)}`;
  } else {
    dateStr = todayKoreanStr();
    urlDateStr = todayYYYYMMDD_KST();
  }

  const url = `https://kukmin.libertysocial.co.kr/assembly?date=${encodeURIComponent(urlDateStr)}`;

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
      .replace(/(전국\s*서울\s*부산\s*대구\s*인천\s*광주\s*대전\s*울산\s*세종\s*경기\s*강원\s*충청\s*전라\s*경상\s*제주)/, "")
      .trim();

    // 일정 블록만 추출 (제목 + 시작 + 종료)
    const matches = [...cleaned.matchAll(/(.+?)\s*(.+?)\s*시작\s*([0-9:]+)\s*종료\s*([0-9:]+)/g)];
    let scheduleText = matches
      .map((m) => `${m[1].trim()}\n📅 ${m[2].trim()}\n⏰ ${m[3]} ~ ${m[4]}`)
      .join("\n\n");

    if (!scheduleText) scheduleText = "해당 날짜에 일정이 없습니다.";

    // 맨 위에 한국식 날짜 한 번만 추가
    const output = `${dateStr}\n\n${scheduleText}`;

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

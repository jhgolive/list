import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

// 한국 시간 기준 오늘 날짜 → YYYY-MM-DD (URL용)
function todayYYYYMMDD_KST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

app.get("/nightbot", async (req, res) => {
  let input = req.query.date || "";
  let urlDateStr = "";

  if (/^\d{4}$/.test(input)) {
    const today = new Date();
    urlDateStr = `${today.getFullYear()}-${input.slice(0, 2)}-${input.slice(2, 4)}`;
  } else {
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

    const text = await page.evaluate(() => document.body.innerText);

    // 알림광장~제주 사이 텍스트만 가져오기
    const sectionMatch = text.match(/알림광장[\s\S]*?제주/);
    const sectionText = sectionMatch ? sectionMatch[0] : "";

    // 날짜만 추출 (YYYY년 MM월 DD일 (요일))
    const dateMatch = sectionText.match(/\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*\([월화수목금토일]\)/);
    const dateStr = dateMatch ? dateMatch[0] : "날짜 없음";

    // 일정 블록만 추출 (제목 + 시작 + 종료)
    const cleaned = sectionText.replace(/\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*\([월화수목금토일]\)/g, ""); // 날짜 제거
    const matches = [...cleaned.matchAll(/(.+?)\s*(.+?)\s*시작\s*([0-9:]+)\s*종료\s*([0-9:]+)/g)];
    let scheduleText = matches
      .map((m) => `${m[1].trim()}\n📅 ${m[2].trim()}\n⏰ ${m[3]} ~ ${m[4]}`)
      .join("\n\n");

    if (!scheduleText) scheduleText = "해당 날짜에 일정이 없습니다.";

    // 맨 위에 날짜 한 번만 추가
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

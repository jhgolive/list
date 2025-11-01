import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

// =====================
// 전역 브라우저 재사용
// =====================
let browser;
async function getBrowser() {
  if (!browser || !browser.isConnected?.()) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    console.log("🚀 Puppeteer 브라우저 새로 실행됨");
  }
  return browser;
}

// =====================
// 브라우저 종료 처리
// =====================
async function closeBrowser() {
  if (browser && browser.isConnected?.()) {
    await browser.close();
    console.log("🛑 Puppeteer 브라우저 종료됨");
  }
}

process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});

process.on("exit", async () => {
  await closeBrowser();
});

process.on("uncaughtException", async (err) => {
  console.error("💥 예외 발생:", err);
  await closeBrowser();
  process.exit(1);
});

// =====================
// 날짜/시간 함수
// =====================
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
function getKSTDate(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}
function formatKoreanDate(date = new Date()) {
  const kst = getKSTDate(date);
  return `${kst.getFullYear()}년 ${kst.getMonth() + 1}월 ${kst.getDate()}일 (${WEEKDAYS[kst.getDay()]})`;
}
function formatYYYYMMDD(date = new Date()) {
  const kst = getKSTDate(date);
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${kst.getFullYear()}-${m}-${d}`;
}
function toKST(timeStr) {
  if (!timeStr || !/^\d{1,2}:\d{2}$/.test(timeStr.trim())) return timeStr;
  const [h, m] = timeStr.split(":").map(Number);
  const utc = new Date(Date.UTC(2000, 0, 1, h, m));
  const kst = getKSTDate(utc);
  return `${String(kst.getHours()).padStart(2, "0")}:${String(kst.getMinutes()).padStart(2, "0")}`;
}
function convertTimeRangeToKST(range) {
  if (!range) return range;
  const parts = range.split("~").map(s => s.trim());
  return parts.length === 2 ? `${toKST(parts[0])} ~ ${toKST(parts[1])}` : toKST(parts[0]);
}
function timeToNumber(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}
function parseMMDD(mmdd) {
  const today = getKSTDate();
  const year = today.getFullYear();
  const month = parseInt(mmdd.slice(0, 2), 10);
  const day = parseInt(mmdd.slice(2, 4), 10);
  return formatKoreanDate(new Date(year, month - 1, day));
}
function formatKSTTime() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  const hh = String(kst.getHours()).padStart(2, "0");
  const mm = String(kst.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

// =====================
// /nightbot 라우터
// =====================
app.get("/nightbot", async (req, res) => {
  let input = req.query.date || "";
  let dateStr, urlDateStr;

  // ⚙️ 날짜 처리 그대로 유지
  if (/^\d{4}$/.test(input)) {
    dateStr = parseMMDD(input);
    const today = getKSTDate();
    urlDateStr = `${today.getFullYear()}-${input.slice(0, 2)}-${input.slice(2, 4)}`;
  } else {
    dateStr = formatKoreanDate();
    urlDateStr = formatYYYYMMDD();
  }

  const url = `https://kukmin.libertysocial.co.kr/assembly?date=${encodeURIComponent(urlDateStr)}`;

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href*='/assembly/']"))
        .map(a => a.href)
        .filter((v, i, arr) => arr.indexOf(v) === i)
    );
    await page.close();

    if (!links.length) {
      res.type("text/plain").send(`${dateStr}\n\n해당 날짜에 일정이 없습니다.`);
      return;
    }

    const results = [];

    for (const link of links) {
      const detailPage = await browser.newPage();
      try {
        await detailPage.goto(link, { waitUntil: "networkidle2", timeout: 60000 });
        await detailPage
          .waitForSelector("header.flex.justify-between h1.line-clamp-2", { timeout: 10000 })
          .catch(() => {});

        const event = await detailPage.evaluate(() => {
          const title = document.querySelector("header.flex.justify-between h1.line-clamp-2")?.innerText.trim() || null;
          const container = document.querySelector(".flex.flex-col.gap-2.border-b.px-4.pb-4.pt-2");
          if (!container) return { title };

          const info = {};
          container.querySelectorAll("div.flex.w-full.min-w-0.flex-1.items-center.justify-start.gap-2").forEach(div => {
            const label = div.querySelector("div.font-semibold.text-kukmin-secondary")?.innerText;
            const value = div.querySelector("div.min-w-0.flex-1")?.innerText.trim();
            if (label) info[label] = value;
          });

          return {
            title,
            date: info["날짜"] || "-",
            time: info["시간"] || "-",
            place: info["장소"] || "-",
            organizer: info["주관"] || "-",
          };
        });

        if (event && event.title) {
          results.push(
`제목: ${event.title}
주관: ${event.organizer}
장소: ${event.place}
시간: ${event.time}`
          );
        }
      } finally {
        await detailPage.close();
      }
    }

    if (!results.length) {
      res.type("text/plain").send(`${dateStr}\n\n해당 날짜에 일정이 없습니다.`);
      return;
    }

    // 👉 단순 출력
    const output = `${dateStr}\n\n${results.join("\n\n")}`;
    res.type("text/plain").send(output);

  } catch (err) {
    console.error(err);
    res.status(500).send(`에러 발생: ${err.message}`);
  }
});

// =====================
// 서버 시작
// =====================
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

해당 날짜에 일정이 없습니다.
이렇게 나오는데 복잡한 수식 다 빼고 내용 나오는지만 확인하게 만들어줘

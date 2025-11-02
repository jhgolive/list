// puppeteer 숨겨서 차단 안되게
import express from "express";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

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
// 텍스트 분할
// =====================
function splitMessage(text, limit = 350) { 
  const parts = [];
  while (text.length > 0) {
    parts.push(text.slice(0, limit));
    text = text.slice(limit);
  }
  return parts;
}

// =====================
// /nightbot 라우터
// =====================
app.get("/nightbot", async (req, res) => {
  let input = req.query.date || "";
  let dateStr, urlDateStr;

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

    const concurrency = 1; // 병렬처리 브라우저 갯수
    const results = [];

    for (let i = 0; i < links.length; i += concurrency) {
      const chunk = links.slice(i, i + concurrency);
      const chunkResults = await Promise.allSettled(
        chunk.map(async link => {
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
                date: info["날짜"] || null,
                time: info["시간"] || null,
                place: info["장소"] || null,
                organizer: info["주관"] || null,
              };
            });

            if (event && event.title) {
              const kstTime = convertTimeRangeToKST(event.time);
              const [startStr, endStr] = kstTime?.split("~").map(t => t.trim()) || [];
              return {
                text: `: ${event.title}\n주관: ${event.organizer || "-"}\n장소: ${event.place || "-"}\n시간: ${kstTime || "-"}\n`,
                //time: kstTime ? timeToNumber(kstTime.split("~")[0].trim()) : 0,
                start: startStr ? timeToNumber(startStr) : 0,
                end: endStr ? timeToNumber(endStr) : 9999, // 종료시간 없으면 뒤로 보내기
              };
            }
            return null;
          } finally {
            await detailPage.close();
          }
        })
      );

      chunkResults.forEach(r => {
        if (r.status === "fulfilled" && r.value) results.push(r.value);
      });
    }

    if (results.length === 0) {
      res.type("text/plain").send(`${dateStr}\n\n해당 날짜에 일정이 없습니다.`);
      return;
    }

    //results.sort((a, b) => a.time - b.time);
    results.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start; // 시작시간 우선
      return a.end - b.end; // 시작시간 같으면 종료시간으로
    });

    // =====================
    // 나이트봇용 한 줄 + 구분자 출력
    // =====================
    const updatedTime = formatKSTTime();
    //const output = `${dateStr}\n\n${results.map(r => `📌 ${r.text.replace(/\n/g, " | ")}`).join(" — ")}`; // 이벤트 간 구분
    //const output = `${dateStr}\n\n${results.map(r => `📌 ${r.text.replace(/\n/g, "\n | ")}`).join("\n — ")}`; // 이벤트 간 구분
    //const output = `📌 ${dateStr}\n${results.map(r => `💥 ${r.text.trim().replace(/\n/g, "\n | ")}`).join("\n  \n")}`;
    const output = `🌟 ${dateStr}\n \n${results.map((r, i) => `💥No${i + 1}${r.text.trim().replace(/\n/g, "\n | ")}`).join("\n \n")}\n \n💫 ${updatedTime} 업데이트`; // 앞에 넘버
        
    //const output = `${dateStr}\n\n${results.map(r => r.text).join("\n")}`; 
    const result = output.length > 3000 ? output.slice(0, 3000) + "…(생략)" : output;

    //res.type("text/plain").send(result);
    const part = parseInt(req.query.part || "1", 10);
    const chunks = splitMessage(result);
    const output = chunks[part - 1] || "더 이상 내용이 없습니다";
    
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

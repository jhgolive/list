import fs from "fs";
import express from "express";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv";
dotenv.config();

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// =====================
// Puppeteer Launch Options (Render + Docker 완전 대응)
// =====================
const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable"
].filter(Boolean);

function findChrome() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  console.error("❌ Chrome 실행 파일을 찾을 수 없음. 경로 리스트:", CHROME_PATHS);
  return null;
}

const PUPPETEER_OPTIONS = {
  headless: "new",
  executablePath: findChrome(),
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--no-first-run",
    "--no-zygote",
    "--single-process"
  ]
};

// =====================
// 전역 브라우저
// =====================
let browser;
async function getBrowser() {
  if (!browser || !browser.isConnected?.()) {
    console.log("🚀 Puppeteer launching...");
    browser = await puppeteer.launch(PUPPETEER_OPTIONS);
    console.log("✅ Puppeteer launched.");
  }
  return browser;
}

// =====================
// 날짜 함수
// =====================
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function getKSTDate(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

function formatKoreanDate(date = new Date()) {
  const kst = getKSTDate(date);
  const day = String(kst.getDate()).padStart(2, "0");
  const month = String(kst.getMonth() + 1).padStart(2, "0");
  return `${kst.getFullYear()}년 ${month}월 ${day}일 (${WEEKDAYS[kst.getDay()]})`;
}

function formatYYYYMMDD(date = new Date()) {
  const kst = getKSTDate(date);
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${kst.getFullYear()}-${m}-${d}`;
}

function parseMMDD(mmdd) {
  const today = getKSTDate();
  const year = today.getFullYear();
  const month = parseInt(mmdd.slice(0, 2), 10);
  const day = parseInt(mmdd.slice(2, 4), 10);
  const monthStr = String(month).padStart(2, "0");
  const dayStr = String(day).padStart(2, "0");
  return {
    pretty: formatKoreanDate(new Date(year, month - 1, day)),
    iso: `${year}-${monthStr}-${dayStr}`,
  };
}

function formatKSTTime() {
  const kst = getKSTDate();
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  const hh = String(kst.getHours()).padStart(2, "0");
  const mm = String(kst.getMinutes()).padStart(2, "0");
  //return `${y}-${m}-${d} ${hh}:${mm}`;
  return `${m}-${d} ${hh}:${mm}`;  // 연도 제거
}

// =====================
// 시간 변환
// =====================
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

function splitByEvents(texts, perChunk = 1) {
  const chunks = [];
  for (let i = 0; i < texts.length; i += perChunk) {
    chunks.push(texts.slice(i, i + perChunk).join("\n\n"));
  }
  return chunks;
}

function isDateSum18(dateIso) {
  // dateIso: "YYYY-MM-DD"
  const digits = dateIso.replace(/-/g, "").split("").map(Number);
  const sum = digits.reduce((a, b) => a + b, 0);
  return sum === 18;
}

// =====================
// 캐시 저장소
// =====================
const cache = new Map();

// =====================
// 일정 크롤링
// =====================
async function fetchEventsForDate(dateIso, datePretty) {
  console.log(`📅 크롤링: ${dateIso}`);
  const browser = await getBrowser();
  const page = await browser.newPage();

  //const url = `https://kukmin.libertysocial.co.kr/assembly?date=${encodeURIComponent(dateIso)}`;
  const url = `https://kukmin.libertysocial.co.kr/assembly?tab=calendar&date=${encodeURIComponent(dateIso)}`;
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href*='/assembly/']"))
      .map((a, i) => ({ href: a.href, order: i })) // order = 사이트 등록 순서
      .filter((v, i, arr) => arr.findIndex(x => x.href === v.href) === i)
  );

  await page.close();

  //if (!links.length) {
    //const text = `${datePretty}\n\n해당 날짜에 일정이 없습니다.`;
    //cache.set(dateIso, { updated: Date.now(), full: text, chunks: [text], count: 0 });
    //return;
  //}
  if (!links.length) {
    //const warningLine = isDateSum18(dateIso) ? "\n💢 재난 사고 조심 💢\n" : "\n";
    //const text = `✨ ${datePretty}  0건` + warningLine + `\n해당 날짜에 일정이 없습니다.\n\n💫 ${formatKSTTime()} ✨신규 💢레드데이  @쩡햄Live`;

    const warningLine = isDateSum18(dateIso) ? `💢 ${datePretty} 사고조심  0건` : `✨ ${datePretty}  0건`;

    const text = warningLine + `\n\n   - 해당 날짜에 일정이 없습니다. -\n\n💫${formatKSTTime()} ✨신규 💢레드데이  🍖쩡햄Live`;
    
    cache.set(dateIso, { updated: Date.now(), full: text, chunks: [text], count: 0 });
    return;
  }

  const results = [];

  for (const { href, order } of links) {
    const detail = await browser.newPage();
    try {
      await detail.goto(href, { waitUntil: "networkidle2", timeout: 60000 });
  
      const event = await detail.evaluate(() => {
        const title = document.querySelector("header.flex.justify-between h1.line-clamp-2")?.innerText.trim();
        const container = document.querySelector(".flex.flex-col.gap-2.border-b.px-4.pb-4.pt-2");

        const info = {};
        if (container) {
          container.querySelectorAll("div.flex.w-full.min-w-0.flex-1.items-center.justify-start.gap-2").forEach(div => {
            const label = div.querySelector("div.font-semibold.text-kukmin-secondary")?.innerText;
            const value = div.querySelector("div.min-w-0.flex-1")?.innerText.trim();
            if (label) info[label] = value;
          });
        }

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
  
        results.push({
          text: `: ${event.title}\n주관: ${event.organizer || "-"}\n장소: ${event.place || "-"}\n시간: ${kstTime || "-"}\n${href}`,
          start: startStr ? timeToNumber(startStr) : 0,
          end: endStr ? timeToNumber(endStr) : 9999,
          order, // 🔥 등록 순서
        });
      }
    } finally {
      await detail.close();
    }
  }

  results.sort((a, b) => (a.start - b.start) || (a.end - b.end));

  // 목록 마지막 3개 NEW 아이콘 표시
  //const formatted = results.map((r, i) => `💥No${i + 1}${r.text.replace(/\n/g, "\n⚡")}`);
  const NEW_COUNT = 3;
  const newOrders = results
    .sort((a, b) => b.order - a.order)
    .slice(0, NEW_COUNT)
    .map(r => r.order);
  
  results.sort((a, b) => (a.start - b.start) || (a.end - b.end));

  //const formatted = results.map((r, i) => {
    //const isNew = newOrders.includes(r.order);
    //const icon = isNew ? `💢No${i + 1}` : `💥No${i + 1}`;
    
    //return `${icon}${r.text.replace(/\n/g, "\n⚡")}`;
  //});

  const formatted = results.map((r, i) => {
    const isNew = newOrders.includes(r.order);
    const lines = r.text.split("\n");
  
    // 첫 줄 (제목)
    let text = lines[0];
  
    // 나머지 줄
    const rest = lines.slice(1).map(line => `⚡${line}`).join("\n");
  
    if (isNew) {
      text += `✨\n${rest}`;
    } else {
      text += `\n${rest}`;
    }
  
    return `💥No${i + 1}${text}`;
  });
  
  const chunks = splitByEvents(formatted, 1);

  const updatedTime = formatKSTTime();

  //const full = `✨ ${datePretty}  ${results.length}건\n\n${chunks.join("\n\n")}\n\n💫 ${updatedTime} ✨신규  @쩡햄Live`;
  //const warningLine = isDateSum18(dateIso) ? "\n💢 재난 사고 조심 💢\n" : "\n";
  //const full = `✨ ${datePretty}  ${results.length}건` + warningLine + `\n${chunks.join("\n\n")}\n\n💫 ${updatedTime} ✨신규 💢레드데이  @쩡햄Live`;

  const warningLine = isDateSum18(dateIso) ? `💢 ${datePretty} 사고조심  ${results.length}건` : `✨ ${datePretty}  ${results.length}건`;

  const full = warningLine + `\n\n${chunks.join("\n\n")}\n\n💫${updatedTime} ✨신규 💢레드데이  🍖쩡햄Live`;
  
  cache.set(dateIso, {
    updated: Date.now(),
    full,
    chunks,
    count: results.length,
  });

  console.log(`✅ 캐시 완료: ${dateIso} (${results.length}건)`);
}

// =====================
// 1시간마다 자동 갱신
// =====================
async function refreshCache() {
  console.log("♻️ 2일치 캐시 갱신 시작");
  const today = getKSTDate();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 2; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const iso = formatYYYYMMDD(date);
    const pretty = formatKoreanDate(date);

    await fetchEventsForDate(iso, pretty);
  }
  console.log("✅ 캐시 갱신 완료");
}
setInterval(refreshCache, 60 * 60 * 1000);
refreshCache();

// =====================
// /nightbot
// =====================
app.get("/nightbot", async (req, res) => {
  let dateInput = req.query.q || req.query.query || req.query.text || req.query.date || "";
  dateInput = decodeURIComponent(dateInput).trim();

  const dateMatch = dateInput.match(/(\d{4})/);
  const dateInfo = dateMatch
    ? parseMMDD(dateMatch[1])
    : { pretty: formatKoreanDate(), iso: formatYYYYMMDD() };

  const { pretty: dateStr, iso: dateIso } = dateInfo;

  let part = null;
  if (req.query.part) part = parseInt(req.query.part, 10);
  else {
    const m = dateInput.match(/(?:파트|part)?\s*(\d+)\s*$/i);
    if (m && (!dateMatch || m[1] !== dateMatch[1])) part = parseInt(m[1], 10);
  }

  const cached = cache.get(dateIso);

  if (cached) {
    if (!part) return res.type("text/plain").send(cached.full);

    const chunk = cached.chunks[part - 1];
    if (!chunk) return res.type("text/plain").send("");

    let out = "";
    if (part === 1) out += `✨ ${dateStr}  ${cached.count}건\n\n`;

    out += chunk;

    if (part === cached.chunks.length) {
      const updated = new Date(cached.updated);
      const kst = getKSTDate(updated);
      const y = kst.getFullYear();
      const m = String(kst.getMonth() + 1).padStart(2, "0");
      const d = String(kst.getDate()).padStart(2, "0");
      const hh = String(kst.getHours()).padStart(2, "0");
      const mm = String(kst.getMinutes()).padStart(2, "0");
      //out += `\n\n💫 ${y}-${m}-${d} ${hh}:${mm} 업데이트`;
      out += `\n\n💫 ${m}-${d} ${hh}:${mm}`;  // 연도 제거
    }

    return res.type("text/plain").send(out);
  }

  // 캐시에 없음 → 즉시 크롤링
  await fetchEventsForDate(dateIso, dateStr);
  const newData = cache.get(dateIso);
  return res.type("text/plain").send(newData?.full || `${dateStr}\n\n데이터를 불러오지 못했습니다.`);
});

// =====================
// 서버 시작
// =====================
app.listen(PORT, () => console.log(`✅ Server running on ${PORT}`));

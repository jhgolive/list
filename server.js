// puppeteer 숨겨서 차단 안되게 + 7일치 캐시 + 지난 날짜 자동삭제 + part 분할 + 1시간마다 자동 갱신 + 쿼리에 파트 명령어 적용 + 총 건수
import express from "express";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// =====================
// 전역 브라우저
// =====================
let browser;
async function getBrowser() {
  if (!browser || !browser.isConnected?.()) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    console.log("🚀 Puppeteer 브라우저 실행됨");
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
  return `${y}-${m}-${d} ${hh}:${mm}`;
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
function splitByEvents(texts, perChunk = 3) {
  const chunks = [];
  for (let i = 0; i < texts.length; i += perChunk) {
    chunks.push(texts.slice(i, i + perChunk).join("\n\n"));
  }
  return chunks;
}

// =====================
// 캐시 저장소
// =====================
const cache = new Map(); // key: YYYY-MM-DD → { updated, full, chunks }

// =====================
// 일정 크롤링
// =====================
async function fetchEventsForDate(dateIso, datePretty) {
  console.log(`📅 ${dateIso} 일정 크롤링 중...`);
  const browser = await getBrowser();
  const page = await browser.newPage();
  const url = `https://kukmin.libertysocial.co.kr/assembly?date=${encodeURIComponent(dateIso)}`;
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href*='/assembly/']"))
      .map(a => a.href)
      .filter((v, i, arr) => arr.indexOf(v) === i)
  );
  await page.close();

  if (!links.length) {
    const text = `${datePretty}\n\n해당 날짜에 일정이 없습니다.`;
    cache.set(dateIso, { updated: Date.now(), full: text, chunks: [text] });
    return;
  }

  const results = [];
  for (const link of links) {
    const detailPage = await browser.newPage();
    try {
      await detailPage.goto(link, { waitUntil: "networkidle2", timeout: 60000 });
      await detailPage.waitForSelector("header.flex.justify-between h1.line-clamp-2", { timeout: 10000 }).catch(() => {});
      const event = await detailPage.evaluate(() => {
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
          text: `: ${event.title}\n주관: ${event.organizer || "-"}\n장소: ${event.place || "-"}\n시간: ${kstTime || "-"}`,
          start: startStr ? timeToNumber(startStr) : 0,
          end: endStr ? timeToNumber(endStr) : 9999,
        });
      }
    } finally {
      await detailPage.close();
    }
  }

  results.sort((a, b) => (a.start - b.start) || (a.end - b.end));
  const updatedTime = formatKSTTime();

  const formatted = results.map((r, i) => `💥No${i + 1}${r.text.replace(/\n/g, "\n❤‍🔥 ")}`);
  const chunks = splitByEvents(formatted, 1); // part당 1개 일정씩 출력

  const header = `🌟 ${datePretty}  ${results.length}건`;
  const footer = `💫 ${updatedTime} 업데이트 @쩡햄Live`;
  const fullText = `${header}\n\n${chunks.join("\n\n")}\n\n${footer}`;

  cache.set(dateIso, { updated: Date.now(), full: fullText, chunks, count: results.length });
  console.log(`✅ ${dateIso} 일정 캐시 완료 (${results.length}건)`);
}

// =====================
// 백그라운드 갱신 (1시간마다)
// =====================
async function refreshCache() {
  console.log("♻️ 일주일치 일정 캐시 갱신 시작");

  const oldKeys = [...cache.keys()];
  const newCache = new Map();

  const today = getKSTDate();
  today.setHours(0, 0, 0, 0); // 🔹 한국시간 기준 자정으로 고정
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i); // 🔹 날짜 단위로 더하기 (로컬 기준)
    const iso = formatYYYYMMDD(date);
    const pretty = formatKoreanDate(date);
    await fetchEventsForDate(iso, pretty);
    newCache.set(iso, cache.get(iso));
  }

  // 새 캐시 완성 후 교체
  cache.clear();
  for (const [k, v] of newCache.entries()) cache.set(k, v);
  console.log("✅ 일주일치 캐시 갱신 완료");
}
setInterval(refreshCache, 60 * 60 * 1000); // 1시간마다
refreshCache(); // 서버 시작 시 즉시 실행

// =====================
// /nightbot
// =====================
app.get("/nightbot", async (req, res) => {
  let dateInput = req.query.q || req.query.query || req.query.text || req.query.date || "";
  dateInput = decodeURIComponent(dateInput).trim();

  // ✅ 날짜 추출
  const dateMatch = dateInput.match(/(\d{4})/);
  const dateInfo = dateMatch
    ? parseMMDD(dateMatch[1])
    : { pretty: formatKoreanDate(), iso: formatYYYYMMDD() };
  const { pretty: dateStr, iso: urlDateStr } = dateInfo;

  // ✅ part는 별도 파라미터 또는 문구 내에서 추출
  let part = null;
  if (req.query.part) {
    part = parseInt(req.query.part, 10);
  } else {
    const partMatch = dateInput.match(/(?:파트|part)?\s*0*(\d+)\s*$/i);
    if (partMatch && (!dateMatch || partMatch[1] !== dateMatch[1])) {
      part = parseInt(partMatch[1], 10);
    }
  }

  console.log(`🎯 요청: "${dateInput}" → 날짜=${urlDateStr}, part=${part}`);

  const cached = cache.get(urlDateStr);

  if (cached) {
    if (part) {
      const chunk = cached.chunks[part - 1];
      if (!chunk) return res.type("text/plain").send("");

      let text = "";
      if (part === 1) text += `🌟 ${dateStr}  ${cached.count || cached.chunks.length}건\n\n`;
      text += chunk;

      if (part === cached.chunks.length) {
        const updated = new Date(cached.updated);
        const kst = getKSTDate(updated);
        const y = kst.getFullYear();
        const m = String(kst.getMonth() + 1).padStart(2, "0");
        const d = String(kst.getDate()).padStart(2, "0");
        const hh = String(kst.getHours()).padStart(2, "0");
        const mm = String(kst.getMinutes()).padStart(2, "0");
        text += `\n\n💫 ${y}-${m}-${d} ${hh}:${mm} 업데이트`;
      }

      return res.type("text/plain").send(text);
    } else {
      return res.type("text/plain").send(cached.full);
    }
  }

  // 캐시에 없으면 즉시 새로 크롤링
  await fetchEventsForDate(urlDateStr, dateStr);
  const newData = cache.get(urlDateStr);
  res.type("text/plain").send(newData?.full || `${dateStr}\n\n데이터를 불러오지 못했습니다.`);
});

// =====================
// 서버 시작
// =====================
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

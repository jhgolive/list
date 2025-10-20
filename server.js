import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_DIR = "./cache";

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

// ========================
// 📅 날짜 관련 함수
// ========================
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function getKSTDate(offsetDays = 0) {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function formatYYYYMMDD(offsetDays = 0) {
  const d = getKSTDate(offsetDays);
  return d.toISOString().slice(0, 10);
}

function formatKoreanDate(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getFullYear()}년 ${kst.getMonth() + 1}월 ${kst.getDate()}일 (${WEEKDAYS[kst.getDay()]})`;
}

// ========================
// 🕒 한국시간 포맷
// ========================
function formatKST(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const Y = kst.getFullYear();
  const M = String(kst.getMonth() + 1).padStart(2, "0");
  const D = String(kst.getDate()).padStart(2, "0");
  const h = String(kst.getHours()).padStart(2, "0");
  const m = String(kst.getMinutes()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}`;
}

function getKSTNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

// ========================
// 🧭 Puppeteer 데이터 수집
// ========================
async function fetchAssemblyData(dateStr) {
  const url = `https://kukmin.libertysocial.co.kr/assembly?date=${encodeURIComponent(dateStr)}`;
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href*='/assembly/']"))
      .map(a => a.href)
      .filter((v, i, arr) => arr.indexOf(v) === i)
  );
  await page.close();

  if (!links.length) {
    await browser.close();
    return `${formatKoreanDate(new Date(dateStr))}\n\n📭 해당 날짜에 일정이 없습니다.`;
  }

  const results = [];

  for (const link of links) {
    const detail = await browser.newPage();
    try {
      await detail.goto(link, { waitUntil: "domcontentloaded", timeout: 30000 });
      await detail.waitForSelector("header.flex.justify-between h1.line-clamp-2", { timeout: 10000 }).catch(() => {});

      const data = await detail.evaluate(() => {
        const title = document.querySelector("header.flex.justify-between h1.line-clamp-2")?.innerText.trim() || "";
        const info = {};
        document
          .querySelectorAll(".flex.flex-col.gap-2.border-b.px-4.pb-4.pt-2 div.flex.w-full.min-w-0.flex-1.items-center.justify-start.gap-2")
          .forEach(div => {
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

      results.push(`💥 ${data.title}\n | 주관: ${data.organizer}\n | 장소: ${data.place}\n | 시간: ${data.time}`);
    } catch (err) {
      console.error(`❌ ${link} 오류: ${err.message}`);
    } finally {
      await detail.close();
    }
  }

  await browser.close();
  return `🌟 ${formatKoreanDate(new Date(dateStr))}\n\n${results.join("\n\n")}`;
}

// ========================
// 💾 캐시 저장 & 읽기
// ========================
function saveCache(dateStr, data) {
  const file = path.join(CACHE_DIR, `${dateStr}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ updated: formatKST(getKSTNow()), data }, null, 2)
  );
}

function readCache(dateStr) {
  const file = path.join(CACHE_DIR, `${dateStr}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// ========================
// 🧩 주간 캐싱 + 이전 캐시 삭제
// ========================
async function updateWeekCache() {
  console.log("🕐 주간 캐싱 시작...");
  const keepDates = [];

  for (let i = 0; i < 7; i++) {
    const dateStr = formatYYYYMMDD(i);
    keepDates.push(dateStr);

    try {
      console.log(`📅 ${dateStr} 수집 중...`);
      const data = await fetchAssemblyData(dateStr);
      saveCache(dateStr, data);
      console.log(`✅ ${dateStr} 캐싱 완료`);
    } catch (err) {
      console.error(`❌ ${dateStr} 실패:`, err.message);
    }
  }

  // 🔥 이전 날짜 캐시 삭제
  const files = fs.readdirSync(CACHE_DIR);
  for (const file of files) {
    const dateStr = file.replace(".json", "");
    if (!keepDates.includes(dateStr)) {
      fs.unlinkSync(path.join(CACHE_DIR, file));
      console.log(`🗑️ ${file} 삭제됨`);
    }
  }

  console.log("🏁 주간 캐싱 완료 + 이전 캐시 정리 완료");
}

// ========================
// 📡 수동 갱신용
// ========================
app.get("/update", async (req, res) => {
  await updateWeekCache();
  res.send("✅ 수동 업데이트 완료 (오늘부터 7일치 캐시, 이전 캐시 삭제됨)");
});

// ========================
// 🤖 Nightbot용
// ========================
app.get("/nightbot", (req, res) => {
  const query = req.query.date || "";
  let targetDate;

  if (/^\d{4}$/.test(query)) {
    const year = getKSTDate().getFullYear();
    targetDate = `${year}-${query.slice(0, 2)}-${query.slice(2, 4)}`;
  } else {
    targetDate = formatYYYYMMDD(0);
  }

  const cache = readCache(targetDate);
  if (!cache) {
    return res.type("text/plain").send(`❌ ${targetDate} 데이터 없음 (자동갱신 대기 중)`);
  }

  res.type("text/plain").send(`${cache.data}\n\n🕒 갱신: ${cache.updated}`);
});

// ========================
// ⏰ 1시간마다 자동 갱신
// ========================
setInterval(updateWeekCache, 60 * 60 * 1000);
updateWeekCache(); // 서버 시작 시 즉시 실행

// ========================
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

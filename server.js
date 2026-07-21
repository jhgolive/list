import fs from "fs";
import express from "express";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv";
dotenv.config();

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;
const fetching = new Map();

// =====================//배포1
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
    "--no-first-run",
    "--no-zygote",
  
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--mute-audio"

    //"--single-process",
    //"--memory-pressure-off",
    //"--disable-features=site-per-process"
  ]
};

// =====================
// 전역 브라우저
// =====================
let browser;
async function getBrowser() {
  if (!browser || !browser.isConnected?.()) {
    console.log("♻️ 브라우저 재시작...");
    try {
      browser = await puppeteer.launch(PUPPETEER_OPTIONS);

      browser.on("disconnected", () => {
        console.log("💥 브라우저 연결 끊김 → 초기화");
        browser = null;
      });

      console.log("✅ Puppeteer launched.");
    } catch (e) {
      console.error("❌ Puppeteer launch 실패:", e.message);
      browser = null;
      throw e;
    }
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
// 날씨
// =====================
async function fetchAllWeather() {
  //if (
    //weatherAllCache &&
    //Date.now() - weatherAllCacheTime < 60 * 60 * 1000
  //) {
    //return weatherAllCache;
  //}

  // 성공 캐시 또는 실패 캐시 모두 1시간 유지
  if (
    weatherAllCacheTime &&
    Date.now() - weatherAllCacheTime < 60 * 60 * 1000
  ) {
    if (weatherAllFailed) {
      throw new Error("날씨 API 최근 실패");
    }
  
    return weatherAllCache;
  }
  
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&hourly=temperature_2m,precipitation_probability,precipitation,weathercode&timezone=Asia/Seoul";
  
    const res = await fetch(url);
  
    if (!res.ok) {      
      throw new Error(`HTTP ${res.status}`);
    }
  
    weatherAllCache = await res.json();
    weatherAllCacheTime = Date.now();
    weatherAllFailed = false;
  
    console.log("🌤️ 날씨 API 실제 호출");
  
    return weatherAllCache;
  } catch (e) {
  
      weatherAllCacheTime = Date.now(); // 실패도 기록
      weatherAllFailed = true;
  
      throw e;
  }
}

async function fetchWeather(dateIso) {
  try {
    const cached = weatherCache.get(dateIso);
    
    if (cached && Date.now() - cached.time < 60 * 60 * 1000) {
      return cached.data;
    }
    
    //const url = `https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&hourly=temperature_2m,precipitation_probability,precipitation,weathercode&timezone=Asia/Seoul`;

    //const res = await fetch(url);
    //const data = await res.json();

    //const hours = data.hourly.time;
    //const temps = data.hourly.temperature_2m;
    //const pops = data.hourly.precipitation_probability;
    //const precs = data.hourly.precipitation;
    //const codes = data.hourly.weathercode;
    
    /*
    const res = await fetch(url);
    
    if (!res.ok) {
      //throw new Error(`HTTP ${res.status}`);

      console.log("⚠️ 날씨 API 실패 → 이전 캐시 사용");
    
      if (cached) {
        return cached.data;
      }
    
      throw new Error(`HTTP ${res.status}`);
    }
    
    const text = await res.text();
    
    if (!text.trim()) {
      throw new Error("빈 응답");
    }
    
    let data;
    
    try {
      data = JSON.parse(text);
    } catch {
      console.log("❌ 날씨 원본 응답:", text.slice(0, 300));
      throw new Error("JSON 파싱 실패");
    }
    */

    const data = await fetchAllWeather();
    
    const hourly = data?.hourly;
    
    if (!hourly) {
      throw new Error("hourly 데이터 없음");
    }
    
    const hours = hourly.time || [];
    const temps = hourly.temperature_2m || [];
    const pops = hourly.precipitation_probability || [];
    const precs = hourly.precipitation || [];
    const codes =
      hourly.weathercode ||
      hourly.weather_code ||
      [];

    // 해당 날짜 필터
    const dayData = hours.map((t, i) => ({
      time: t,
      temp: temps[i],
      pop: pops[i],
      prec: precs[i],
      code: codes[i]
    })).filter(v => v.time.startsWith(dateIso));

    if (!dayData.length) {
      throw new Error("날짜 데이터 없음");
    }

    // 🌡️ 최저/최고
    const minTemp = Math.min(...dayData.map(v => v.temp));
    const maxTemp = Math.max(...dayData.map(v => v.temp));

    // 💧 최대 강수량
    const maxPrecip = Math.max(...dayData.map(v => v.prec));

    // ⏱️ 6시간씩 4구간
    const chunks = [[], [], [], []];
    dayData.forEach(v => {
      const hour = parseInt(v.time.split("T")[1].slice(0, 2));
      const idx = Math.floor(hour / 6);
      chunks[idx].push(v);
    });

    function getIcon(block) {
      if (!block.length) return "⛅";

      // 🌧️ 비/눈 우선
      if (block.some(v => v.code >= 70 && v.code < 80)) return "❄️";
      if (block.some(v => v.prec > 0)) return "☔";
      //if (block.some(v => v.prec > 1 && v.pop > 30)) return "☔";
      if (block.some(v => v.pop >= 40)) return "☔"; // 확률 높을 때만

      // 🌤️ 지배적인 날씨
      const counts = {};
      block.forEach(v => {
        counts[v.code] = (counts[v.code] || 0) + 1;
      });

      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

      if (dominant == 0) return "☀️";
      if (dominant < 3) return "⛅";
      return "☁️";
    }

    function getPop(block) {
      if (!block.length) return 0;
      return Math.max(...block.map(v => v.pop));
    }

    const icons = chunks.map(getIcon);
    const pops4 = chunks.map(getPop);

    //return {
      //min: Math.round(minTemp),
      //max: Math.round(maxTemp),
      //icons,
      //pops: pops4,
      //maxPrecip: Math.round(maxPrecip)
    //};
    
    const result = {
      min: Math.round(minTemp),
      max: Math.round(maxTemp),
      icons,
      pops: pops4,
      maxPrecip: Math.round(maxPrecip)
    };
    
    weatherCache.set(dateIso, {
      time: Date.now(),
      data: result
    });
    
    return result;
    
  } catch (e) {
    console.error("❌ 날씨 가져오기 실패:", e.message);
  
    const cached = weatherCache.get(dateIso);
  
    if (cached) {
      console.log("♻️ 이전 날씨 캐시 사용");
      return cached.data;
    }
  
    return {
      min: "-",
      max: "-",
      icons: ["⛅", "⛅", "⛅", "⛅"],
      pops: [0, 0, 0, 0],
      maxPrecip: 0
    };
  }
}

// =====================
// 날짜 클릭
// =====================
function getNextCachedDate(currentDateIso) {
  const dates = [...cache.keys()].sort();

  if (!dates.length) return currentDateIso;

  const idx = dates.indexOf(currentDateIso);

  if (idx === -1) return dates[0];

  return dates[(idx + 1) % dates.length];
}

// =====================
// 계좌 복사
// =====================
function copyAccount() {
  return `
<script>
function copyAccountNumber() {
  navigator.clipboard.writeText('33330-7696-7896');
  alert('계좌번호가 복사되었습니다.');
}
</script>
`;
}

// =====================
// 오늘 방문자/조회수/좋아요
// =====================
const dailyStats = {
  date: "",
  visitors: new Set(),
  likedIPs: new Set(),
  views: 0,
  likes: 0
};

function getTodayKST() {
  return formatYYYYMMDD();
}

function resetDailyStats() {
  const today = getTodayKST();

  if (dailyStats.date !== today) {
    dailyStats.date = today;
    dailyStats.visitors = new Set();
    dailyStats.likedIPs = new Set();
    dailyStats.views = 0;
    dailyStats.likes = 0;
  }
}

// =====================
// 캐시 저장소
// =====================
const cache = new Map();
const weatherCache = new Map();
let weatherAllCache = null;
let weatherAllCacheTime = 0;
let weatherAllFailed = false;

const MAX_PAGES = 3;
let activePages = 0;

// =====================
// 일정 크롤링
// =====================
async function fetchEventsForDate(dateIso, datePretty) {
  if (fetching.get(dateIso)) {
    console.log(`⏳ 이미 크롤링 중: ${dateIso}`);
    return;
  }

  const oldCache = cache.get(dateIso);
  
  fetching.set(dateIso, true);

  try {
    console.log(`📅 크롤링: ${dateIso}`);
    let currentBrowser = await getBrowser();
    let page;
    
    try {
      page = await currentBrowser.newPage();
    } catch (e) {
      console.log("💥 newPage 실패 → 브라우저 재시작");
    
      if (currentBrowser) {
        try { await currentBrowser.close(); } catch {}
      }

      browser = null;   // 추가
      currentBrowser = null; // 💥 핵심
    
      currentBrowser = await getBrowser();
      page = await currentBrowser.newPage();
    }

    const weather = await fetchWeather(dateIso);
    let weatherLine = "\n";

    if (weather) {
      //weatherLine =
        //`      ${weather.min}°/${weather.max}°` +
        //`${weather.icons[0]}${weather.pops[0]}%/` +
        //`${weather.icons[1]}${weather.pops[1]}%/` +
        //`${weather.icons[2]}${weather.pops[2]}%/` +
        //`${weather.icons[3]}${weather.pops[3]}%/` +
        //`${weather.maxPrecip}mm\n\n`;

      function formatIconPop(icon, pop) {
        return pop > 4 ? `${icon}${pop}%` : `${icon}`;
      }
      
      weatherLine =
        `✨ ${weather.min}°/${weather.max}° ` +
        `${formatIconPop(weather.icons[0], weather.pops[0])}/` +
        `${formatIconPop(weather.icons[1], weather.pops[1])}/` +
        `${formatIconPop(weather.icons[2], weather.pops[2])}/` +
        `${formatIconPop(weather.icons[3], weather.pops[3])}/ ` +
        `${weather.maxPrecip}mm\n\n`;
    }
    
    //const url = `https://kukmin.libertysocial.co.kr/assembly?date=${encodeURIComponent(dateIso)}`;
    //const url = `https://kukmin.libertysocial.co.kr/assembly?tab=calendar&date=${encodeURIComponent(dateIso)}`;
    const url = `https://kukmin.libertysocial.co.kr/events?date=${encodeURIComponent(dateIso)}`;
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    //await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000});
  
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href*='/assembly/']"))
        .map((a, i) => ({ href: a.href, order: i })) // order = 사이트 등록 순서
        .filter((v, i, arr) => arr.findIndex(x => x.href === v.href) === i)
    );
  
    try {
      if (!page.isClosed()) {
        await page.close();
      }
    } catch (e) {
      console.log("⚠️ 메인 페이지 close 에러 무시:", e.message);
    }
  
    //if (!links.length) {
      //const text = `${datePretty}\n\n해당 날짜에 일정이 없습니다.`;
      //cache.set(dateIso, { updated: Date.now(), full: text, chunks: [text], count: 0 });
      //return;
    //}
    if (!links.length) {
        if (oldCache && oldCache.count > 0) {
          //console.log(`♻️ 링크 0개 → 기존 캐시 유지: ${dateIso}`);
          console.log(`♻️ 링크 0개 → 기존 캐시 유지: ${dateIso} (${oldCache.count}건)`);
          cache.set(dateIso, oldCache);
          return;
        }
      //const warningLine = isDateSum18(dateIso) ? "\n💢 재난 사고 조심 💢\n" : "\n";
      //const text = `✨ ${datePretty}  0건` + warningLine + `\n해당 날짜에 일정이 없습니다.\n\n💫 ${formatKSTTime()} ✨신규 💢레드데이  @Live`;
  
      //const warningLine = isDateSum18(dateIso) ? `💢 ${datePretty} 사고조심  0건` : `✨ ${datePretty}  0건`;
      const warningLine = isDateSum18(dateIso) ? `✨ ${datePretty} 💢사고조심  0건` : `✨ ${datePretty}  0건`;
      const supportLine =
      `⚡지원: <a href="#" onclick="copyAccountNumber();return false;" style="text-decoration:underline;color:inherit;">카카오 33330-7696-7896 오J한</a>, ` +
      `<a href="https://qr.kakaopay.com/FT8wKBNyw" target="_blank" style="text-decoration:underline;color:inherit;">카카오페이</a>`;
  
      //const text = warningLine + `\n\n   - 해당 날짜에 일정이 없습니다. -\n\n💫${formatKSTTime()} ✨신규 💢레드데이  🍖Live`;
      //const text = warningLine + `\n` + weatherLine  + `   - 해당 날짜에 일정이 없습니다. -\n\n` + `💫${formatKSTTime()} ✨신규 💢레드데이` + `\n✨서울 최저/최고 새벽/아침/낮/저녁/최대량  🍖쩡햄Live`;
      //const text = warningLine + `\n` + weatherLine  + `   - 해당 날짜에 일정이 없습니다. -\n\n` + `✨서울 최저/최고 새벽/아침/낮/저녁/최대량` + `\n✨신규 💢레드데이 💫${formatKSTTime()}  🍖쩡햄Live`;
      //const text = warningLine + `\n` + weatherLine  + `   - 해당 날짜에 일정이 없습니다. -\n\n` + `✨신규 💢레드데이` + `\n✨서울 최저/최고 새벽/아침/낮/밤/최대량` + `\n💫${formatKSTTime()} 🍖쩡햄Live`;
      //const text = warningLine + `\n` + weatherLine  + `   - 해당 날짜에 일정이 없습니다. -\n\n` + `✨신규 💢레드데이` + `\n✨서울 최저/최고 새벽/아침/낮/밤/최대량` + `\n💫${formatKSTTime()} 🍖<a href="https://www.youtube.com/channel/UChqJ-rp_I9NKwZOtzI11jNw?sub_confirmation=1" target="_blank" style="color:inherit;text-decoration:underline;">쩡햄<span style="color:red;">L</span>ive</a>`;
      const text = warningLine + `\n` + weatherLine  + `   - 해당 날짜에 일정이 없습니다. -\n\n` + `✨날짜클릭:7일캐싱 💢레드데이 ✨신규` + `\n✨서울 최저/최고 새벽/아침/낮/밤/최대량` + `\n💫${formatKSTTime()} 🍖<a href="https://www.youtube.com/channel/UChqJ-rp_I9NKwZOtzI11jNw?sub_confirmation=1" target="_blank" style="color:inherit;text-decoration:underline;">순대전사</a>\n\n` + supportLine;
      
      cache.set(dateIso, { updated: Date.now(), full: text, chunks: [text], count: 0 });
      return;
    }
  
    const results = [];

    async function safeNewPage(browser) {
      while (activePages >= MAX_PAGES) {
        await new Promise(r => setTimeout(r, 200));
      }
    
      activePages++;
      const page = await browser.newPage();
    
      const originalClose = page.close.bind(page);
      page.close = async () => {
        activePages--;
        return originalClose();
      };
    
      return page;
    }
    
    console.log(`${dateIso} 링크수: ${links.length}`);
    for (const { href, order } of links) {
      //const detail = await currentBrowser.newPage();
      const detail = await safeNewPage(currentBrowser);
      try {
        //await detail.goto(href, { waitUntil: "networkidle2", timeout: 60000 });
        await detail.goto(href, { waitUntil: "domcontentloaded", timeout: 30000 });
    
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
            //text: `: ${event.title}\n주관: ${event.organizer || "-"}\n장소: ${event.place || "-"}\n시간: ${kstTime || "-"}\n${href}`,
            text: `: ${event.title}\n주관: ${event.organizer || "-"}\n장소: ${event.place || "-"}\n시간: ${kstTime || "-"}\n<a href="${href}" target="_blank">${href}</a>`,
            start: startStr ? timeToNumber(startStr) : 0,
            end: endStr ? timeToNumber(endStr) : 9999,
            order, // 🔥 등록 순서
          });
        }
      } catch (e) {
        console.log("⚠️ 상세 페이지 실패:", href, e.message);
      } finally {
        await detail.close().catch(() => {});
      }
    }

    //try {
      //if (!detail.isClosed()) {
        //await detail.close();
      //}
    //} catch (e) {
      //console.log("⚠️ detail close 실패:", e.message);
    //}
  
    //results.sort((a, b) => (a.start - b.start) || (a.end - b.end));
  
    // 목록 마지막 3개 NEW 아이콘 표시
    //const formatted = results.map((r, i) => `💥No${i + 1}${r.text.replace(/\n/g, "\n⚡")}`);
    const NEW_COUNT = 3;
    //const newOrders = results
    const newOrders = [...results]
      .sort((a, b) => b.order - a.order)
      .slice(0, NEW_COUNT)
      .map(r => r.order);
    
    if (results.length === 0 && oldCache) {
      //console.log(
        //`♻️ 모든 상세페이지 실패 → 기존 캐시 유지: ${dateIso} (링크 ${links.length}개)`
      //);
      console.log(
        `♻️ 모든 상세페이지 실패 → 기존 캐시 유지: ${dateIso} (${oldCache.count}건, 링크 ${links.length}개)`
      );
      cache.set(dateIso, oldCache);
      return;
    }
    
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
      //const rest = lines.slice(1).map(line => `⚡${line}`).join("\n");

      // 시간 값 색상
      const rest = lines.slice(1).map(line => {
      
        if (line.startsWith("시간:")) {
          return `⚡${line.replace(
            /^시간:\s*(\d{2}:\d{2})\s*~\s*(\d{2}:\d{2})$/,
            '시간: <span style="color:red;">$1</span> ~ <span style="color:red;">$2</span>'
          )}`;
        }
      
        return `⚡${line}`;
      
      }).join("\n");
      
      // 제목: ':' 뒤만 굵게
      //let text = lines[0].replace(
      //  /^([^:]+:\s*)(.*)$/,
      //  '$1<b>$2</b>'
      //);
      
      // 나머지 줄
      //const rest = lines.slice(1).map(line => {
      
        // 시간: 값만 굵게
        //if (line.startsWith("시간:")) {
        //  return `⚡${line.replace(
        //    /^시간:\s*(.*)$/,
        //    '시간: <b>$1</b>'
        //  )}`;
        //}
      
        //return `⚡${line}`;
      //}).join("\n");
      
      if (isNew) {
        text += `✨\n${rest}`;
      } else {
        text += `\n${rest}`;
      }
    
      //return `💥No${i + 1}${text}`; 번호
      return `💥No<span style="color:darkorange;font-weight:bold;">${i + 1}</span>${text}`;
    });
    
    const chunks = splitByEvents(formatted, 1);
  
    const updatedTime = formatKSTTime();
  
    //const full = `✨ ${datePretty}  ${results.length}건\n\n${chunks.join("\n\n")}\n\n💫 ${updatedTime} ✨신규  @쩡햄Live`;
    //const warningLine = isDateSum18(dateIso) ? "\n💢 재난 사고 조심 💢\n" : "\n";
    //const full = `✨ ${datePretty}  ${results.length}건` + warningLine + `\n${chunks.join("\n\n")}\n\n💫 ${updatedTime} ✨신규 💢레드데이  @쩡햄Live`;
  
    //const warningLine = isDateSum18(dateIso) ? `💢 ${datePretty} 사고조심  ${results.length}건` : `✨ ${datePretty}  ${results.length}건`;
    const warningLine = isDateSum18(dateIso) ? `✨ ${datePretty} 💢사고조심  ${results.length}건` : `✨ ${datePretty}  ${results.length}건`;
    const supportLine =
    `⚡지원: <a href="#" onclick="copyAccountNumber();return false;" style="text-decoration:underline;color:inherit;">카카오 33330-7696-7896 오J한</a>, ` +
    `<a href="https://qr.kakaopay.com/FT8wKBNyw" target="_blank" style="text-decoration:underline;color:inherit;">카카오페이</a>`;
  
    //const full = warningLine + `\n\n${chunks.join("\n\n")}\n\n💫${updatedTime} ✨신규 💢레드데이  🍖쩡햄Live`;
    //const full = warningLine + `\n` + weatherLine + `${chunks.join("\n\n")}\n\n` + `💫${updatedTime} ✨신규 💢레드데이` + `\n✨서울 최저/최고 새벽/아침/낮/저녁/최대량  🍖쩡햄Live`;
    //const full = warningLine + `\n` + weatherLine + `${chunks.join("\n\n")}\n\n` + `✨서울 최저/최고 새벽/아침/낮/저녁/최대량` + `\n✨신규 💢레드데이 💫${updatedTime}  🍖쩡햄Live`;
    //const full = warningLine + `\n` + weatherLine + `${chunks.join("\n\n")}\n\n` + `✨신규 💢레드데이` + `\n✨서울 최저/최고 새벽/아침/낮/밤/최대량` + `\n💫${updatedTime} 🍖쩡햄Live`;
    //const full = warningLine + `\n` + weatherLine + `${chunks.join("\n\n")}\n\n` + `✨신규 💢레드데이` + `\n✨서울 최저/최고 새벽/아침/낮/밤/최대량` + `\n💫${updatedTime} 🍖<a href="https://www.youtube.com/channel/UChqJ-rp_I9NKwZOtzI11jNw?sub_confirmation=1" target="_blank" style="color:inherit;text-decoration:underline;">쩡햄<span style="color:red;">L</span>ive</a>`;
    const full = warningLine + `\n` + weatherLine + `${chunks.join("\n\n")}\n\n` + `✨날짜클릭:7일캐싱 💢레드데이 ✨신규` + `\n✨서울 최저/최고 새벽/아침/낮/밤/최대량` + `\n💫${updatedTime} 🍖<a href="https://www.youtube.com/channel/UChqJ-rp_I9NKwZOtzI11jNw?sub_confirmation=1" target="_blank" style="color:inherit;text-decoration:underline;">순대전사</a>\n\n` + supportLine;
    
    cache.set(dateIso, {
      updated: Date.now(),
      full,
      chunks,
      count: results.length,
    });

    console.log(`📦 ${dateIso} 저장 여부:`, cache.has(dateIso));
    //console.log(`✅ 캐시 완료: ${dateIso} (${results.length}건)`);
    //console.log(`✅ 캐시 완료: ${dateIso} (${results.length}건, 이전 ${oldCache?.count ?? 0}건)`);
    console.log(`✅ 캐시 완료: ${dateIso} (${oldCache?.count ?? 0} → ${results.length}건)`);
  } catch (e) {
    console.error(`❌ 일정 크롤링 실패 (${dateIso}):`, e.message);
  
    if (oldCache) {
      //console.log(`♻️ 이전 캐시 유지: ${dateIso}`);
      console.log(`♻️ 이전 캐시 유지: ${dateIso} (${oldCache.count}건)`);
      cache.set(dateIso, oldCache);
    }    
  } finally {
    fetching.delete(dateIso);
  }
}

// =====================
// 1시간마다 자동 갱신
// =====================
let isRefreshing = false;

async function refreshCache() {
  if (isRefreshing) {
    console.log("⏳ 이미 캐시 갱신 중");
    return;
  }

  isRefreshing = true;

  try {
    console.log("♻️ 7일치 캐시 갱신 시작");

    const today = getKSTDate();
    today.setHours(0, 0, 0, 0);
    const validDates = new Set();

    //몇일치
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const iso = formatYYYYMMDD(date);
      const pretty = formatKoreanDate(date);

      validDates.add(iso);
      await fetchEventsForDate(iso, pretty);
    }

    // 🔥 7일 밖 캐시 삭제
    for (const key of cache.keys()) {
      if (!validDates.has(key)) {
        cache.delete(key);
      }
    }

    // 🔥 7일 밖 날씨 캐시 삭제
    for (const key of weatherCache.keys()) {
      if (!validDates.has(key)) {
        weatherCache.delete(key);
      }
    }
    
    console.log("✅ 캐시 갱신 완료");
    if (browser) {
      try {
        await browser.close();
      } catch {}
    
      browser = null;
      console.log("🧹 브라우저 메모리 정리");
    }
  } finally {
    isRefreshing = false;
  }
}
setInterval(refreshCache, 60 * 60 * 1000);
refreshCache();

// =====================
// /nightbot
// =====================
//app.get("/nightbot", async (req, res) => {
app.get(["/", "/nightbot"], async (req, res) => {
  
  if (req.path === "/favicon.ico") return res.sendStatus(204);
  
  resetDailyStats();
    
  const ip =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";

  const isHtmlRequest =
  req.headers.accept?.includes("text/html");

  if (isHtmlRequest && (req.path === "/" || req.path === "/nightbot")) {
    dailyStats.views++;
    dailyStats.visitors.add(ip);
  }
  
  let dateInput = req.query.q || req.query.query || req.query.text || req.query.date || "";
  dateInput = decodeURIComponent(dateInput).trim();

  const dateMatch = dateInput.match(/(\d{4})/);
  const dateInfo = dateMatch
    ? parseMMDD(dateMatch[1])
    : { pretty: formatKoreanDate(), iso: formatYYYYMMDD() };

  const { pretty: dateStr, iso: dateIso } = dateInfo;

  // 오늘 00:00 기준
  const today = getKSTDate();
  today.setHours(0,0,0,0);
  
  const [y,m,d] = dateIso.split("-").map(Number);
  const targetDate = new Date(y,m-1,d);
  targetDate.setHours(0,0,0,0);

  // 과거 날짜 차단
  if (targetDate < today) {
    return res.type("text/html").send(`
    <title>집회 일정 - 순대전사</title>
    <meta name="description" content="집회 일정 및 날씨 정보">
    <meta property="og:title" content="집회 일정">
    <meta property="og:description" content="집회 일정 및 날씨 정보">
    <meta property="og:url" content="https://godwar.onrender.com">
    <meta property="og:type" content="website">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    
<pre>

지난 날짜는 조회할 수 없습니다.


       <a href="/">오늘로 이동</a></pre>
    `);
  }
  
  let part = null;
  if (req.query.part) part = parseInt(req.query.part, 10);
  else {
    const m = dateInput.match(/(?:파트|part)?\s*(\d+)\s*$/i);
    if (m && (!dateMatch || m[1] !== dateMatch[1])) part = parseInt(m[1], 10);
  }

  const cached = cache.get(dateIso);

  if (cached) {
    //if (!part) return res.type("text/plain").send(cached.full);
    //if (!part) return res.type("text/html").send(cached.full.replace(/\n/g, "<br>"));
    //if (!part) return res.type("text/html").send(`<pre>${cached.full}</pre>`);
    if (!part) {
      const nextDate = getNextCachedDate(dateIso);
      const nextMMDD = nextDate.slice(5).replace("-", "");
    
      const lines = cached.full.split("\n");
      const header = lines.shift();
      const body = lines.join("\n");

      const liked = dailyStats.likedIPs.has(ip);
      
      const heart = liked
        ? `<a href="#" onclick="return false;" style="text-decoration:none;color:red;">❤️</a>`
        : `<a href="#" onclick="like();return false;" style="text-decoration:none;font-size:14px;display:inline-block;line-height:1;transform: translateY(0px) scaleX(1.2);-webkit-text-stroke: 1.1px #555;color:transparent;">♡</a>`;

const topLink = `

<h1>- 점검 중 -</h1>
💥 <a href="/" style="color:darkorange;text-decoration:none;font-weight:bold;">자유는 그냥 오지 않는다</a> 💥
`;
      
      // 날짜 부분만 추출
      //const linkedHeader = header.replace(
      //  /(\d{4}년 \d{2}월 \d{2}일 \([^)]+\))/,
      //  `<a href="/nightbot?date=${nextMMDD}" style="color:inherit;text-decoration:underline;font-weight:bold;">$1</a>`
      //);

      // 날짜 부분만 추출, 색상
      const linkedHeader = header.replace(
        /(\d{4})년 (\d{2})월 (\d{2})일 \(([^)]+)\)/,
        `<a href="/nightbot?date=${nextMMDD}" style="color:inherit;text-decoration:underline;"><span style="color:red;font-weight:bold;">$1</span>년 <span style="color:red;font-weight:bold;">$2</span>월 <span style="color:red;font-weight:bold;">$3</span>일 (<span style="color:red;font-weight:bold;">$4</span>)</a>`);

return res.type("text/html").send(`<title>집회 일정 - 순대전사</title><meta name="description" content="집회 일정 및 날씨 정보"><meta property="og:title" content="집회 일정"><meta property="og:description" content="집회 일정 및 날씨 정보"><meta property="og:url" content="https://godwar.onrender.com"><meta property="og:type" content="website"><meta name="viewport" content="width=device-width, initial-scale=1">${copyAccount()}<pre>${topLink}

${linkedHeader}
${body}</pre>

<hr>

<pre style="text-align:left;">
⚡오늘: 방문자 ${dailyStats.visitors.size}  조회수 ${dailyStats.views}  <span id="heart">${heart}</span> <span id="likeCount">${dailyStats.likes}</span>         <a href="#" onclick="sharePage();return false;">📤공유</a>
</pre>

<script>
async function like() {
  const r = await fetch('/like');
  const d = await r.json();

  const heart = document.getElementById('heart');
  const count = document.getElementById('likeCount');

  // 하트 변경
  heart.innerHTML = "❤️";
  heart.style.color = "red";

  // 숫자 변경
  count.innerText = d.likes;
}

// 공유 하기
function sharePage() {
  const url = 'https://godwar.onrender.com';

  if (navigator.share) {
    navigator.share({
      //title: '쩡햄Live',
      text: '집회 일정 확인',
      //url: location.href  //현재 페이지
      url
    });
  } else {
    //navigator.clipboard.writeText(location.href);  //현재 페이지
    navigator.clipboard.writeText(url);
    alert('주소가 복사되었습니다.');
  }
}
</script>
`);
    }
    
    const chunk = cached.chunks[part - 1];
    //if (!chunk) return res.type("text/plain").send("");
    if (!chunk) return res.type("text/html").send("");

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

    //return res.type("text/plain").send(out);
    return res.type("text/html").send(`<title>집회 일정 - 순대전사</title><meta name="description" content="집회 일정 및 날씨 정보"><meta property="og:title" content="집회 일정"><meta property="og:description" content="집회 일정 및 날씨 정보"><meta property="og:url" content="https://godwar.onrender.com"><meta property="og:type" content="website"><meta name="viewport" content="width=device-width, initial-scale=1"><pre>${out}</pre>`);
  }

  // 캐시에 없음 → 즉시 크롤링
  const before = cache.get(dateIso);
  
  await fetchEventsForDate(dateIso, dateStr);
  
  const newData = cache.get(dateIso) || before;
  //return res.type("text/plain").send(newData?.full || `${dateStr}\n\n데이터를 불러오지 못했습니다.`);
  //return res.type("text/html").send((newData?.full || `${dateStr}\n\n데이터를 불러오지 못했습니다.`).replace(/\n/g, "<br>"));
  return res.type("text/html").send(`<title>집회 일정 - 순대전사</title><meta name="description" content="집회 일정 및 날씨 정보"><meta property="og:title" content="집회 일정"><meta property="og:description" content="집회 일정 및 날씨 정보"><meta property="og:url" content="https://godwar.onrender.com"><meta property="og:type" content="website"><meta name="viewport" content="width=device-width, initial-scale=1"><pre>${newData?.full || `${dateStr}\n\n데이터를 불러오지 못했습니다.`}</pre>`);
});

// =====================
// 서버 시작
// =====================
app.get("/like", (req, res) => {
  resetDailyStats();

  const ip =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";

  if (!dailyStats.likedIPs.has(ip)) {
    dailyStats.likedIPs.add(ip);
    dailyStats.likes++;
  }

  res.json({
    likes: dailyStats.likes
  });
});
app.listen(PORT, () => console.log(`✅ Server running on ${PORT}`));

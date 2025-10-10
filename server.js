import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/", async (req, res) => {
  const d = req.query.d;
  if (!d) return res.send("날짜 없음 (예: ?d=1009)");

  // 날짜 포맷 변환 1009 → 10-09
  const formatted = d.slice(0, 2) + "-" + d.slice(2);
  const url = `https://kukmin.libertysocial.co.kr/assembly?tab=list&date=2025-${formatted}`;

  try {
    const html = await fetch(url).then(r => r.text());

    // 새 정규식 적용
    const regex = /<div class="schedule-item">.*?<span class="schedule-title">\[([^\]]+)\](.*?)<\/span>.*?<span class="schedule-time">([0-9]{2}:[0-9]{2})\s*~\s*([0-9]{2}:[0-9]{2})<\/span>.*?<span class="schedule-location">(.*?)<\/span>/gs;
    const events = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      const category = match[1].trim();
      const title = match[2].trim();
      const start = match[3].trim();
      const end = match[4].trim();
      const location = match[5].trim();
      events.push(`[${category}] ${title} (${start}~${end}) @ ${location}`);
    }

    // 출력
    const output = events.length
      ? `2025-${formatted} 일정\n` + events.map((e,i) => `${i+1}️⃣ ${e}`).join("\n")
      : "해당 날짜 일정 없음";

    res.set("Content-Type", "text/plain; charset=utf-8");
    res.send(output);
  } catch (err) {
    res.send("오류 발생: " + err.message);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ kukmin-schedule API running on port ${PORT}`));

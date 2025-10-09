import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/", async (req, res) => {
  const d = req.query.d;
  if (!d) return res.send("날짜 없음 (예: ?d=1009)");

  const formatted = d.slice(0, 2) + "-" + d.slice(2);
  const url = `https://kukmin.libertysocial.co.kr/assembly?tab=list&date=2025-${formatted}`;

  try {
    const html = await fetch(url).then(r => r.text());

    // li 태그 안 텍스트만 추출
    const listMatches = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gs)];
    const events = listMatches.map(m =>
      m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    );

    // 시간 포함 이벤트만 필터링
    const regex = /(.*?)(?:시작\s*([0-9:]+))?(?:종료\s*([0-9:]+))?/;
    const parsed = events
      .map(e => {
        const match = e.match(regex);
        if (!match) return null;
        const title = match[1].trim();
        const start = match[2] || "";
        const end = match[3] || "";
        const time = start && end ? `(${start}~${end})` : "";
        return title ? `${title} ${time}`.trim() : null;
      })
      .filter(Boolean)
      .slice(0, 5); // 최대 5개 이벤트

    const output = parsed.length
      ? `2025-${formatted} 일정\n` + parsed.map((e, i) => `${i + 1}️⃣ ${e}`).join("\n")
      : "해당 날짜 일정 없음";

    res.set("Content-Type", "text/plain; charset=utf-8");
    res.send(output);
  } catch (err) {
    res.send("오류 발생: " + err.message);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ kukmin-schedule API running on port ${PORT}`));

import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/", async (req, res) => {
  const d = req.query.d;
  if (!d) return res.send("날짜 없음 (예: ?d=1009)");

  const formatted = d.slice(0, 2) + "-" + d.slice(2);
  const url = "https://kukmin.libertysocial.co.kr/assembly?tab=list&date=2025-" + formatted;

  try {
    const html = await fetch(url).then(r => r.text());
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const match = text.match(/(집회|모임|일정)[^]+?(?=등록|Copyright|KUKMIN)/);
    res.set("Content-Type", "text/plain; charset=utf-8");
    res.send(match ? match[0].substring(0, 400) : "해당 날짜 일정 없음");
  } catch (err) {
    res.send("오류 발생: " + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ kukmin-schedule API running on port", PORT));

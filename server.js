import express from "express";
import fetch from "node-fetch";

const app = express();

// 날짜별 전체 일정 목록 가져오기
app.get("/", async (req, res) => {
  const date = req.query.date || "2025-10-11"; // 기본값
  const url = `https://kukmin.libertysocial.co.kr/assembly?tab=list&date=${date}`;

  try {
    const html = await fetch(url).then(r => r.text());

    // 일정 목록 추출 정규식
    const regex =
      /<a[^>]+href="\/assembly\/(\d+)[^>]*"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>[\s\S]*?(\d{4}년\s*\d{1,2}월\s*\d{1,2}일)[\s\S]*?([0-9]{2}:[0-9]{2})\s*~\s*([0-9]{2}:[0-9]{2})[\s\S]*?장소\s*<\/div>\s*<div[^>]*>([^<]+)<\/div>/g;

    const results = [];
    let match;

    while ((match = regex.exec(html)) !== null) {
      results.push({
        id: match[1],
        title: match[2].trim(),
        date: match[3].trim(),
        start: match[4].trim(),
        end: match[5].trim(),
        location: match[6].trim(),
        url: `https://kukmin.libertysocial.co.kr/assembly/${match[1]}`,
      });
    }

    if (results.length === 0) {
      return res.send(`📅 ${date} 일정 없음`);
    }

    // 출력 포맷
    const text = results
      .map(
        r =>
          `📍 ${r.title}\n🗓 ${r.date} ${r.start}~${r.end}\n📌 ${r.location}\n🔗 ${r.url}\n`
      )
      .join("\n-----------------\n");

    res.set("Content-Type", "text/plain; charset=utf-8");
    res.send(text);
  } catch (err) {
    res.send("❌ 오류: " + err.message);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`서버 실행 중: ${PORT}`));

import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/", async (req, res) => {
  const date = req.query.date || "2025-10-11";
  const url = `https://kukmin.libertysocial.co.kr/assembly?tab=list&date=${date}`;

  try {
    const html = await fetch(url).then(r => r.text());
    const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);

    if (!jsonMatch) {
      return res.send("❌ 데이터를 찾을 수 없음");
    }

    const data = JSON.parse(jsonMatch[1]);
    // SSR에서 props 경로 찾기
    const list = data.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data?.data || [];

    if (!list.length) {
      return res.send(`📅 ${date} 일정 없음`);
    }

    const text = list
      .map(r => {
        const id = r.id;
        const title = r.title;
        const start = r.startTime || "";
        const end = r.endTime || "";
        const location = r.place || "";
        const dateText = r.date || date;

        return `📍 ${title}\n🗓 ${dateText} ${start}~${end}\n📌 ${location}\n🔗 https://kukmin.libertysocial.co.kr/assembly/${id}\n`;
      })
      .join("\n-----------------\n");

    res.set("Content-Type", "text/plain; charset=utf-8");
    res.send(text);
  } catch (err) {
    res.send("❌ 오류: " + err.message);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`서버 실행 중: ${PORT}`));

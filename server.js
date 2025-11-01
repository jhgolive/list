app.get("/nightbot", async (req, res) => {
  let input = req.query.date || "";
  let dateStr, urlDateStr;

  // ⚙️ 날짜 처리 그대로 유지
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

    const results = [];

    for (const link of links) {
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
            date: info["날짜"] || "-",
            time: info["시간"] || "-",
            place: info["장소"] || "-",
            organizer: info["주관"] || "-",
          };
        });

        if (event && event.title) {
          results.push(
`제목: ${event.title}
주관: ${event.organizer}
장소: ${event.place}
시간: ${event.time}`
          );
        }
      } finally {
        await detailPage.close();
      }
    }

    if (!results.length) {
      res.type("text/plain").send(`${dateStr}\n\n해당 날짜에 일정이 없습니다.`);
      return;
    }

    // 👉 단순 출력
    const output = `${dateStr}\n\n${results.join("\n\n")}`;
    res.type("text/plain").send(output);

  } catch (err) {
    console.error(err);
    res.status(500).send(`에러 발생: ${err.message}`);
  }
});

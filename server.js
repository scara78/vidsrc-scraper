import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 9000;

async function extractStream(url) {

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  let stream = null;
  let subtitles = [];

  page.on("response", async (response) => {

    const r = response.url();

    if (r.includes(".m3u8")) {
      stream = r;
    }

    if (r.includes(".vtt") || r.includes(".srt")) {
      subtitles.push(r);
    }

  });

  await page.goto(url, { waitUntil: "domcontentloaded" });

  await page.waitForTimeout(5000);

  try {

    const servers = await page.$$(".server, .server-item, button");

    if (servers.length) {
      await servers[0].click();
    }

  } catch {}

  for (let i = 0; i < 15; i++) {

    if (stream) break;

    await page.waitForTimeout(1000);

  }

  await browser.close();

  return { stream, subtitles };

}

app.get("/movie/:id", async (req, res) => {

  const id = req.params.id;

  const url = `https://vidsrc.cc/v2/embed/movie/${id}`;

  const result = await extractStream(url);

  res.json(result);

});

app.get("/tv/:id/:season/:episode", async (req, res) => {

  const { id, season, episode } = req.params;

  const url = `https://vidsrc.cc/v2/embed/tv/${id}/${season}/${episode}`;

  const result = await extractStream(url);

  res.json(result);

});

app.get("/proxy", async (req, res) => {

  const url = req.query.url;

  if (!url) {
    return res.status(400).send("missing url");
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://vidsrc.cc/"
    }
  });

  const body = await response.text();

  res.set("content-type", "application/vnd.apple.mpegurl");
  res.send(body);

});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log("API running on port", PORT);
});

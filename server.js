const express = require("express");
const cors = require("cors");
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const puppeteer = require("puppeteer");

puppeteerExtra.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(cors());

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function extractStreamAndSubs(url, opts = {}) {
  const timeoutMs = opts.timeoutMs || 20000;
  const browser = await puppeteerExtra.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"]
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  await page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9", "referer": url });
  await page.setViewport({ width: 1280, height: 800 });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3] });
  });

  let foundStream = null;
  const streamSet = new Set();
  const subsMap = new Map();

  const registerStream = (u) => {
    if (!u) return;
    if (!streamSet.has(u)) {
      streamSet.add(u);
      if (!foundStream) foundStream = u;
    }
  };

  const registerSub = (u, meta = {}) => {
    if (!u) return;
    if (!subsMap.has(u)) subsMap.set(u, Object.assign({ url: u, label: meta.label || null, lang: meta.lang || null, source: meta.source || null }, meta));
  };

  page.on("response", async (res) => {
    try {
      const rUrl = res.url();
      const headers = res.headers() || {};
      const ct = (headers["content-type"] || "").toLowerCase();

      if (rUrl.match(/\.m3u8(\?|$)/i) || ct.includes("mpegurl") || ct.includes("vnd.apple.mpegurl") || ct.includes("application/vnd.apple.mpegurl")) {
        registerStream(rUrl);
      }

      if (rUrl.match(/\.(?:vtt|srt|ttml|dfxp)(?:\?|$)/i) || ct.includes("vtt") || ct.includes("subtitle") || ct.includes("xml")) {
        registerSub(rUrl, { source: "response", contentType: ct });
      }

      if (ct.includes("application/json") || ct.includes("text/html") || ct.includes("application/javascript") || ct.includes("text/plain")) {
        let text = "";
        try { text = await res.text(); } catch (e) { text = ""; }
        if (text) {
          const subs = text.match(/https?:\/\/[^"'\\\s]+?\.(?:vtt|srt|ttml|dfxp)[^"'\\\s]*/ig) || [];
          subs.forEach(s => registerSub(s, { source: "embedded-json/html" }));
          const m3u8s = text.match(/https?:\/\/[^"'\\\s]+?\.m3u8[^"'\\\s]*/ig) || [];
          m3u8s.forEach(m => registerStream(m));
        }
      }
    } catch (e) {}
  });

  page.on("request", (req) => {
    try {
      const rUrl = req.url();
      if (rUrl.match(/\.m3u8(\?|$)/i)) registerStream(rUrl);
      if (rUrl.match(/\.(?:vtt|srt|ttml|dfxp)(?:\?|$)/i)) registerSub(rUrl, { source: "request" });
    } catch (e) {}
  });

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    const domScan = await page.evaluate(() => {
      const results = { tracks: [], htmlSubs: [], sources: [], playerCandidates: [] };
      try {
        const trackEls = Array.from(document.querySelectorAll('track[kind="subtitles"], track[kind="captions"], track'));
        trackEls.forEach(t => results.tracks.push({ src: t.src, srclang: t.srclang || null, label: t.label || null, kind: t.kind || null }));
        const srcMatches = (document.documentElement.innerHTML || '').match(/https?:\/\/[^"'\\\s]+?\.(?:vtt|srt|ttml|dfxp|m3u8)[^"'\\\s]*/ig) || [];
        results.htmlSubs = srcMatches.slice(0,200);
        const videoSources = Array.from(document.querySelectorAll('video source')).map(s=>s.src).filter(Boolean);
        results.sources = videoSources;
        const playerCandidates = [];
        try {
          for (const k of Object.keys(window)) {
            if (k.toLowerCase().includes('player') || k.toLowerCase().includes('video')) {
              try { playerCandidates.push(String(window[k])); } catch(e){}
            }
          }
        } catch(e){}
        results.playerCandidates = playerCandidates.slice(0,20);
      } catch(e){}
      return results;
    });

    domScan.tracks.forEach(t => { if (t.src) registerSub(t.src, { label: t.label, lang: t.srclang, source: "dom-track" }); });
    domScan.htmlSubs.forEach(s => registerSub(s, { source: "dom-scan" }));
    domScan.sources.forEach(s => { if (s.match(/\.m3u8(\?|$)/i)) registerStream(s); });

    for (const candidate of domScan.playerCandidates) {
      const matches = (candidate || '').match(/https?:\/\/[^"'\\\s]+?\.(?:vtt|srt|ttml|dfxp|m3u8)[^"'\\\s]*/ig) || [];
      matches.forEach(m => {
        if (m.match(/\.m3u8(\?|$)/i)) registerStream(m); else registerSub(m, { source: "player-config" });
      });
    }

    const playSelectors = ['button[aria-label*="play"]', '.vjs-play-control', '.plyr__control--play', '.jw-icon-play', '.play', '.btn-play', 'button.play'];
    for (const sel of playSelectors) {
      try {
        const exists = await page.$(sel);
        if (exists) {
          await Promise.all([ page.click(sel).catch(()=>{}), sleep(300) ]);
        }
      } catch(e){}
    }

    try {
      const videoHandle = await page.$('video');
      if (videoHandle) await videoHandle.click().catch(()=>{});
    } catch(e){}

    const start = Date.now();
    while ((Date.now() - start) < timeoutMs) {
      try {
        const perfEntries = await page.evaluate(() => performance.getEntries().map(e=>e.name).filter(Boolean));
        (perfEntries || []).forEach(n => {
          if (n.match(/\.m3u8(\?|$)/i)) registerStream(n);
          if (n.match(/\.(?:vtt|srt|ttml|dfxp)(?:\?|$)/i)) registerSub(n, { source: "performance" });
        });
      } catch(e){}
      if (foundStream && subsMap.size) break;
      await sleep(800);
    }

    await browser.close();

    const finalStream = foundStream || (streamSet.size ? Array.from(streamSet)[0] : null);
    const subtitles = Array.from(subsMap.values()).map(s => ({ url: s.url, label: s.label || null, lang: s.lang || null, source: s.source || null }));

    return { stream: finalStream, subtitles };

  } catch (err) {
    try { await browser.close(); } catch(e){}
    throw err;
  }
}

app.get("/api/movie/:tmdbId", async (req, res) => {
  try {
    const tmdbId = req.params.tmdbId;
    if (!tmdbId) return res.status(400).json({ success: false, error: "Missing TMDb ID" });
    const embedUrl = `https://vidsrc.cc/v2/embed/movie/${tmdbId}`;
    const result = await extractStreamAndSubs(embedUrl, { timeoutMs: 25000 });
    if (!result || (!result.stream && !result.subtitles.length)) return res.json({ success: false, error: "No stream or subtitles found" });
    return res.json({ success: true, stream: result.stream || null, subtitles: result.subtitles });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.toString() });
  }
});

app.get("/api/tv/:tmdbId/:season", async (req, res) => {
  try {
    const { tmdbId, season } = req.params;
    if (!tmdbId || !season) return res.status(400).json({ success:false, error:"Missing params" });
    const embedUrl = `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}`;
    const result = await extractStreamAndSubs(embedUrl, { timeoutMs: 25000 });
    if (!result || (!result.stream && !result.subtitles.length)) return res.json({ success: false, error: "No stream or subtitles found" });
    return res.json({ success: true, stream: result.stream || null, subtitles: result.subtitles });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.toString() });
  }
});

app.get("/api/tv/:tmdbId/:season/:episode", async (req, res) => {
  try {
    const { tmdbId, season, episode } = req.params;
    if (!tmdbId || !season || !episode) return res.status(400).json({ success:false, error:"Missing params" });
    const embedUrl = `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}`;
    const result = await extractStreamAndSubs(embedUrl, { timeoutMs: 25000 });
    if (!result || (!result.stream && !result.subtitles.length)) return res.json({ success: false, error: "No stream or subtitles found" });
    return res.json({ success: true, stream: result.stream || null, subtitles: result.subtitles });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.toString() });
  }
});

app.listen(3000, () => console.log("API running on http://localhost:3000"));

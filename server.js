import express from "express";
import axios from "axios";
import cors from "cors";
import * as cheerio from "cheerio";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 9000;

async function getServers(id) {

  const url = `https://vidsrc.cc/v2/embed/movie/${id}`;

  const html = (await axios.get(url)).data;

  const $ = cheerio.load(html);

  let servers = [];

  $("a").each((i, el) => {

    const link = $(el).attr("data-link");

    if (link) servers.push(link);

  });

  return servers;

}

async function findM3U8(url) {

  const page = (await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://vidsrc.cc/"
    }
  })).data;

  const m = page.match(/https?:\/\/.*?\.m3u8/g);

  if (m) return m[0];

  return null;

}

app.get("/movie/:id", async (req, res) => {

  try {

    const id = req.params.id;

    const servers = await getServers(id);

    if (!servers.length) {
      return res.json({ error: "no servers" });
    }

    for (let s of servers) {

      const stream = await findM3U8(s);

      if (stream) {

        return res.json({
          stream: stream
        });

      }

    }

    res.json({ error: "stream not found" });

  } catch (e) {

    res.json({
      error: e.message
    });

  }

});

app.get("/health", (req,res)=>res.send("ok"));

app.listen(PORT, ()=>{

  console.log("API running on port",PORT);

});

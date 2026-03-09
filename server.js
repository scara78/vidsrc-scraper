import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 9000;

/* ===============================
   PROVIDER MODULES
=================================*/

async function vidsrcMovie(imdb) {

  try {

    const embed = `https://vidsrc.cc/v2/embed/movie/${imdb}`;

    const r = await axios.get(embed,{
      headers:{
        "User-Agent":"Mozilla/5.0",
        "Referer":"https://vidsrc.cc/"
      }
    });

    const match = r.data.match(/https?:\/\/[^"]+\.m3u8/g);

    if(match) {
      return {
        source: "vidsrc",
        stream: match[0]
      };
    }

  } catch(e){}

  return null;

}

async function vidsrcTv(imdb,season,episode){

  try{

    const embed=`https://vidsrc.cc/v2/embed/tv/${imdb}/${season}/${episode}`;

    const r=await axios.get(embed,{
      headers:{
        "User-Agent":"Mozilla/5.0",
        "Referer":"https://vidsrc.cc/"
      }
    });

    const match=r.data.match(/https?:\/\/[^"]+\.m3u8/g);

    if(match){
      return {
        source:"vidsrc",
        stream:match[0]
      };
    }

  }catch(e){}

  return null;

}

/* ===============================
   STREAM API
=================================*/

app.get("/stream/movie/:imdb", async (req,res)=>{

  const imdb=req.params.imdb;

  const sources=[];

  const vidsrc=await vidsrcMovie(imdb);

  if(vidsrc) sources.push(vidsrc);

  if(!sources.length){
    return res.json({
      streams:[]
    });
  }

  res.json({
    streams:sources
  });

});

app.get("/stream/tv/:imdb/:season/:episode", async (req,res)=>{

  const {imdb,season,episode}=req.params;

  const sources=[];

  const vidsrc=await vidsrcTv(imdb,season,episode);

  if(vidsrc) sources.push(vidsrc);

  res.json({
    streams:sources
  });

});

/* ===============================
   PROXY
=================================*/

app.get("/proxy", async (req,res)=>{

  const url=req.query.url;

  if(!url) return res.status(400).send("missing url");

  const r=await axios.get(url,{
    headers:{
      "User-Agent":"Mozilla/5.0",
      "Referer":"https://vidsrc.cc/"
    }
  });

  res.set("content-type","application/vnd.apple.mpegurl");
  res.send(r.data);

});

/* ===============================
   HEALTH
=================================*/

app.get("/health",(req,res)=>{

  res.json({status:"ok"});

});

app.listen(PORT,()=>{

  console.log("Stream API running on port",PORT);

});

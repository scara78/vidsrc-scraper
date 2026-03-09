import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 9000;

/* -------------------------
   PROVIDER: SUPEREMBED
--------------------------*/

async function superembedMovie(imdb) {

  try {

    const url = `https://multiembed.mov/?video_id=${imdb}&tmdb=1`;

    const r = await axios.get(url,{
      headers:{
        "User-Agent":"Mozilla/5.0"
      }
    });

    const match = r.data.match(/https?:\/\/[^"]+\.m3u8/g);

    if(match){
      return {
        provider:"superembed",
        stream:match[0]
      };
    }

  } catch(e){}

  return null;

}

/* -------------------------
   PROVIDER: VIDSRC
--------------------------*/

async function vidsrcMovie(imdb){

  try{

    const url=`https://vidsrc.cc/v2/embed/movie/${imdb}`;

    const r=await axios.get(url,{
      headers:{
        "User-Agent":"Mozilla/5.0",
        "Referer":"https://vidsrc.cc/"
      }
    });

    const match=r.data.match(/https?:\/\/[^"]+\.m3u8/g);

    if(match){
      return {
        provider:"vidsrc",
        stream:match[0]
      };
    }

  }catch(e){}

  return null;

}

/* -------------------------
   MAIN STREAM API
--------------------------*/

app.get("/stream/movie/:imdb", async (req,res)=>{

  const imdb=req.params.imdb;

  const providers=[
    superembedMovie,
    vidsrcMovie
  ];

  for(const provider of providers){

    const result=await provider(imdb);

    if(result){
      return res.json({
        streams:[result]
      });
    }

  }

  res.json({
    streams:[]
  });

});

/* -------------------------
   PROXY STREAM
--------------------------*/

app.get("/proxy", async (req,res)=>{

  const url=req.query.url;

  if(!url) return res.status(400).send("missing url");

  const r=await axios.get(url,{
    headers:{
      "User-Agent":"Mozilla/5.0"
    }
  });

  res.set("content-type","application/vnd.apple.mpegurl");
  res.send(r.data);

});

/* -------------------------
   HEALTH
--------------------------*/

app.get("/health",(req,res)=>{
  res.json({status:"ok"});
});

app.listen(PORT,()=>{
  console.log("Universal Stream API running on port",PORT);
});

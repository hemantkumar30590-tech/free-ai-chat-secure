const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(__dirname));
app.use((req,res,next)=>{
  res.header('Access-Control-Allow-Origin','*');
  res.header('Access-Control-Allow-Headers','Content-Type');
  res.header('Access-Control-Allow-Methods','POST,GET,OPTIONS');
  if(req.method==='OPTIONS') return res.sendStatus(200);
  next();
});
app.post('/api/chat', async (req,res)=>{
  try{
    const {message, search} = req.body;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const SERPER_API_KEY = process.env.SERPER_API_KEY;
    if(!GROQ_API_KEY) return res.status(500).json({error:'GROQ_API_KEY missing'});
    let searchContext = '';
    if(search && SERPER_API_KEY){
      try{
        const sr = await fetch('https://google.serper.dev/search',{
          method:'POST',
          headers:{'X-API-KEY':SERPER_API_KEY,'Content-Type':'application/json'},
          body: JSON.stringify({q: message, gl:'in', num:5})
        });
        const sd = await sr.json();
        if(sd.organic){
          searchContext = "\nLATEST WEB RESULTS:\n" + sd.organic.slice(0,5).map((r,i)=>`${i+1}. ${r.title}: ${r.snippet}`).join("\n");
        }
      }catch(e){}
    }
    const systemPrompt = `You are MOE AI - Today's AI News + General Assistant. ${searchContext? 'Use web results for latest info.' : ''} Language: Hinglish friendly.`;
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Authorization':`Bearer ${GROQ_API_KEY}`,'Content-Type':'application/json'},
      body: JSON.stringify({
        model:'llama-3.1-8b-instant',
        messages:[{role:'system',content: systemPrompt + searchContext},{role:'user',content: message}],
        temperature:0.7,
        max_tokens: 1000
      })
    });
    const data = await groqRes.json();
    if(data.error) return res.status(500).json({error: data.error.message});
    res.json({reply: data.choices[0].message.content});
  }catch(err){
    res.status(500).json({error: err.message});
  }
});
app.get('*',(req,res)=> res.sendFile(path.join(__dirname,'index.html')));
const PORT = process.env.PORT || 10000;
app.listen(PORT,()=> console.log('Running on '+PORT));

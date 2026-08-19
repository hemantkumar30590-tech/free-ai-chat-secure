const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const GROQ_KEY = process.env.GROQ_API_KEY;
const SERPER_KEY = process.env.SERPER_API_KEY;

async function searchSerper(query){
  if(!SERPER_KEY) return null;
  try{
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 5 })
    });
    const data = await res.json();
    if(data.organic){
      return data.organic.map(o=>`${o.title}: ${o.snippet}`).join('\n');
    }
    return null;
  }catch(e){ return null; }
}

app.post('/api/chat', async (req,res)=>{
  try{
    const { message } = req.body;
    let context = '';
    const needsSearch = /latest|today|current|news|chhattisgarh|price|weather|who is|kab|kahan/i.test(message);
    if(needsSearch){
      const searchResult = await searchSerper(message);
      if(searchResult) context = `\n\nLatest Google Search Results:\n${searchResult}\nUse this for latest info.`;
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'You are Free AI Chat MOE, helpful assistant. Answer in same language user asked.' + context },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    const data = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content || 'No reply';
    res.json({ reply });
  }catch(e){
    res.status(500).json({reply: 'Server error'});
  }
});

app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log('Running on '+PORT));

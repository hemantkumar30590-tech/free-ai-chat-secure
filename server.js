const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const GROQ_KEY = process.env.GROQ_API_KEY;
const SERPER_KEY = process.env.SERPER_API_KEY;

console.log('GROQ KEY:', GROQ_KEY? 'YES ✅ len:'+GROQ_KEY.length : 'NO ❌ MISSING');
console.log('SERPER KEY:', SERPER_KEY? 'YES ✅' : 'NO ❌');

app.post('/api/chat', async (req,res)=>{
  try{
    const { message } = req.body;
    if(!GROQ_KEY) return res.json({reply: '❌ GROQ_API_KEY missing in Render ENV! Go to Render > Environment > Add GROQ_API_KEY'});

    let searchText = '';
    if(SERPER_KEY && /latest|today|news|price|weather|chhattisgarh|kab|kahan/i.test(message)){
      try{
        const sRes = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: message, num: 3 })
        });
        const sData = await sRes.json();
        if(sData.organic) searchText = sData.organic.map(o=>o.snippet).join('\n');
      }catch(e){}
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
          { role: 'system', content: `You are Free AI Chat MOE. Helpful assistant. ${searchText? 'Latest info: '+searchText : ''}` },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    const data = await groqRes.json();
    console.log('Groq response:', JSON.stringify(data).substring(0,500));

    if(data.error){
      return res.json({reply: 'Groq Error: ' + data.error.message + ' (Check API key)'});
    }

    const reply = data.choices?.[0]?.message?.content;
    if(!reply) return res.json({reply: 'Groq returned empty: '+JSON.stringify(data).substring(0,200)});

    res.json({ reply });
  }catch(e){
    console.error(e);
    res.json({reply: 'Server error: '+e.message});
  }
});

app.get('*', (req,res)=> res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log('Server running on '+PORT));

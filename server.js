const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.post('/api/chat', async (req, res) => {
  try {
    const userMsg = req.body.message;
    let context = '';

    // Serper Search - Latest Data
    if (process.env.SERPER_API_KEY) {
      try {
        const sRes = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type':'application/json'},
          body: JSON.stringify({q: userMsg, num: 5})
        });
        const sData = await sRes.json();
        if(sData.organic) context = sData.organic.map(r=>`${r.title}: ${r.snippet}`).join('\n');
      } catch(e){}
    }

    // Groq - NEW MODEL
    const gRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type':'application/json'},
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {role:'system', content: `You are MOE AI. Use this context for latest info: ${context}. Answer in same language as user.`},
          {role:'user', content: userMsg}
        ],
        temperature: 0.7
      })
    });
    const gData = await gRes.json();
    if(gData.error) throw new Error(gData.error.message);
    res.json({reply: gData.choices[0].message.content, model: 'Llama 3.3 70B'});
  } catch(err){
    res.json({error: err.message});
  }
});

app.get('*', (req,res)=> res.sendFile(path.join(__dirname,'index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Running on '+PORT));

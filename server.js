const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.post('/api/chat', async (req, res) => {
  try {
    const userMsg = req.body.message || 'hi';
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle:'full', timeStyle:'long' });
    let context = `Current IST Time: ${now}`;

    if (process.env.SERPER_API_KEY) {
      try {
        const r = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: userMsg, num: 3 })
        });
        const d = await r.json();
        if (d.organic) context += '\n' + d.organic.map(x => x.snippet).join(' | ');
      } catch {}
    }

    // GROQ NEW MODELS - Auto Fallback MOE
    const models = [
      'llama-3.3-70b-versatile',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'meta-llama/llama-4-maverick-17b-128e-instruct',
      'qwen/qwen3-32b',
      'gemma2-9b-it'
    ];

    let reply = null, usedModel = '';
    for (let m of models) {
      try {
        const gRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: m,
            messages: [
              { role: 'system', content: `You are MOE AI. Time IST: ${now}. Use live context: ${context}. Answer in user language. Be helpful.` },
              { role: 'user', content: userMsg }
            ],
            temperature: 0.7,
            max_tokens: 1000
          })
        });
        const gData = await gRes.json();
        if (gData.error) continue;
        reply = gData.choices[0].message.content;
        usedModel = m;
        break;
      } catch { continue; }
    }

    if (!reply) throw new Error('All Groq models busy, try again');
    res.json({ reply, model: usedModel + ' | ' + now });

  } catch (e) {
    res.json({ error: e.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('MOE AI Running on ' + PORT + ' with ' + new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})));

const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Teri key ke models - Verified from screenshot
const MODELS = {
  '120B': 'openai/gpt-oss-120b',
  '20B': 'openai/gpt-oss-20b',
  '70B': 'llama-3.3-70b-versatile',
  'QWEN': 'qwen/qwen3-32b'
};

const GROQ_KEY = process.env.GROQ_API_KEY;
const SERPER_KEY = process.env.SERPER_API_KEY;

async function tryModel(modelId, messages) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId, messages, temperature: 0.7, max_tokens: 1200 })
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}

app.post('/api/chat', async (req, res) => {
  try {
    const msg = req.body.message || 'Hi';
    if (!GROQ_KEY) return res.json({ reply: '❌ GROQ_API_KEY missing' });

    let search = '';
    if (SERPER_KEY) {
      try {
        const sr = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: msg, num: 2 })
        });
        const sd = await sr.json();
        if (sd.organic) search = sd.organic[0].snippet;
      } catch {}
    }

    const messages = [
      { role: 'system', content: `You are MOE AI. ${search? 'Info: ' + search : ''}` },
      { role: 'user', content: msg }
    ];

    // Try in order: 120B -> 20B -> 70B -> QWEN
    const order = [MODELS['120B'], MODELS['20B'], MODELS['70B'], MODELS['QWEN']];
    let reply = null, used = '';
    for (const m of order) {
      try {
        console.log('Trying', m);
        reply = await tryModel(m, messages);
        used = m;
        break;
      } catch (e) {
        console.log('Failed', m, e.message);
      }
    }

    if (!reply) return res.json({ reply: 'All models busy, try again' });
    res.json({ reply, model: used });

  } catch (e) {
    res.json({ reply: 'Error: ' + e.message });
  }
});

// Test endpoint - /api/test-models se saare models test honge
app.get('/api/test-models', async (req, res) => {
  const results = {};
  for (const [name, id] of Object.entries(MODELS)) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: id, messages: [{ role: 'user', content: 'Say hi in 5 words' }], max_tokens: 20 })
      });
      const d = await r.json();
      results[name] = d.choices? '✅ WORKING - ' + d.choices[0].message.content : '❌ ' + d.error.message;
    } catch (e) { results[name] = '❌ ' + e.message; }
  }
  res.json(results);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('Running with models', Object.values(MODELS)));

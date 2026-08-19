const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const NEW_MODELS = [
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'qwen/qwen3-32b',
  'deepseek-r1-distill-llama-70b'
];

app.post('/api/chat', async (req, res) => {
  try {
    const userMsg = req.body.message;
    let context = '';

    // Live Search
    if (process.env.SERPER_API_KEY) {
      try {
        const r = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: userMsg, num: 4 })
        });
        const d = await r.json();
        if (d.organic) context = d.organic.map(x => x.snippet).join('\n');
      } catch {}
    }

    // Try new models one by one (auto fallback)
    let lastError = '';
    for (let modelId of NEW_MODELS) {
      try {
        const gRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: 'system', content: `You are MOE AI. Live context: ${context}. Answer in user language.` },
              { role: 'user', content: userMsg }
            ],
            temperature: 0.7,
            max_tokens: 1000
          })
        });
        const gData = await gRes.json();
        if (gData.error) throw new Error(gData.error.message);

        // Success!
        return res.json({
          reply: gData.choices[0].message.content,
          model: modelId
        });
      } catch (e) {
        lastError = e.message;
        console.log(`Model ${modelId} failed: ${e.message}, trying next...`);
        continue;
      }
    }
    throw new Error(lastError);

  } catch (err) {
    res.json({ error: err.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(process.env.PORT || 3000, () => console.log('Running with NEW Groq Models'));

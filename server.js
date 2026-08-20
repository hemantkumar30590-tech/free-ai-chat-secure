const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname)));

const MODELS = {
  '120B': 'openai/gpt-oss-120b',
  '20B': 'openai/gpt-oss-20b',
  '70B': 'llama-3.3-70b-versatile',
  'VISION': 'qwen/qwen3.6-27b', // Teri screenshot wala sahi ID
};

const GROQ_KEY = process.env.GROQ_API_KEY;
const SERPER_KEY = process.env.SERPER_API_KEY;

async function getGoogleNews(query) {
  if (!SERPER_KEY) return "";
  try {
    console.log('Searching Google:', query);
    const r = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 5 })
    });
    const data = await r.json();
    if (!data.organic) return "";
    let results = data.organic.slice(0, 3).map(o => `Title: ${o.title}\nSnippet: ${o.snippet}\nLink: ${o.link}`).join('\n\n');
    return `\n\n[LATEST GOOGLE SEARCH RESULTS for "${query}"]:\n${results}\nUse this to answer latest news.`;
  } catch (e) { console.log('Serper Error', e.message); return ""; }
}

async function tryModel(modelId, messages) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId, messages, temperature: 0.7, max_tokens: 1500 })
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}

app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    const msg = req.body.message || 'Hi';
    let fileContext = "";
    let imageBase64 = null;
    let mimeType = "";

    if (req.file) {
      const fp = req.file.path; mimeType = req.file.mimetype;
      if (mimeType === 'application/pdf') {
        const d = await pdf(fs.readFileSync(fp)); fileContext = `\n[PDF]:\n${d.text.slice(0, 8000)}`;
      } else if (mimeType.includes('word') || mimeType.includes('officedocument')) {
        const d = await mammoth.extractRawText({ path: fp }); fileContext = `\n[DOCX]:\n${d.value.slice(0, 8000)}`;
      } else if (mimeType.startsWith('image/')) { imageBase64 = fs.readFileSync(fp).toString('base64'); }
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    let messages = [];
    if (imageBase64) {
      messages = [
        { role: 'system', content: 'You are MOE AI. Describe image.' },
        { role: 'user', content: [{ type: "text", text: msg }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }] }
      ];
    } else {
      // SERPER KEY YAHI USE HO RAHI HAI
      let searchData = "";
      if (msg.toLowerCase().includes('news') || msg.toLowerCase().includes('latest') || msg.toLowerCase().includes('aaj') || msg.toLowerCase().includes('today')) {
        searchData = await getGoogleNews(msg);
      }
      messages = [
        { role: 'system', content: `You are MOE AI. You have real-time internet via Google. ${searchData} ${fileContext}` },
        { role: 'user', content: msg + fileContext }
      ];
    }

    let reply = null;
    for (const m of [MODELS['VISION'], MODELS['120B'], MODELS['20B'], MODELS['70B']]) {
      try { reply = await tryModel(m, messages); break; } catch (e) { console.log('fail', m); }
    }
    res.json({ reply: reply || 'Busy, try again' });
  } catch (e) { res.json({ reply: 'Error: ' + e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('MOE AI WITH SERPER Running'));

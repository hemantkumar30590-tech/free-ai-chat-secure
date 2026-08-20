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

// Robots & Sitemap
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\n\nSitemap: https://free-ai-chat-secure.onrender.com/sitemap.xml`);
});
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://free-ai-chat-secure.onrender.com/</loc><lastmod>2026-05-13</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url></urlset>`);
});

const MODELS = {
  '120B': 'openai/gpt-oss-120b',
  '20B': 'openai/gpt-oss-20b',
  '70B': 'llama-3.3-70b-versatile',
  'VISION': 'qwen/qwen3-32b',
  'VISION2': 'qwen/qwen3-vl-32b-instruct',
  'QWEN': 'qwen/qwen3-32b'
};

const GROQ_KEY = process.env.GROQ_API_KEY;
const SERPER_KEY = process.env.SERPER_API_KEY;

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
    if (!GROQ_KEY) return res.json({ reply: '❌ GROQ_API_KEY missing' });

    let fileContext = "";
    let imageBase64 = null;
    let mimeType = "";

    if (req.file) {
      const filePath = req.file.path;
      mimeType = req.file.mimetype;
      console.log('File:', req.file.originalname, mimeType);
      if (mimeType === 'application/pdf') {
        const data = await pdf(fs.readFileSync(filePath));
        fileContext = `\n\n[PDF FILE ${req.file.originalname}]:\n${data.text.substring(0, 10000)}`;
      } else if (mimeType.includes('word') || mimeType.includes('officedocument')) {
        const result = await mammoth.extractRawText({ path: filePath });
        fileContext = `\n\n[DOCX ${req.file.originalname}]:\n${result.value.substring(0, 10000)}`;
      } else if (mimeType.startsWith('image/')) {
        imageBase64 = fs.readFileSync(filePath).toString('base64');
      } else {
        try { fileContext = `\n\n[FILE ${req.file.originalname}]:\n${fs.readFileSync(filePath, 'utf8').substring(0, 10000)}`; } catch {}
      }
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    let messages = [];
    let order = [];

    if (imageBase64) {
      messages = [
        { role: 'system', content: 'You are MOE AI, explain image clearly in same language user asked.' },
        { role: 'user', content: [
          { type: "text", text: msg || "Is image me kya hai detail me batao?" },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
        ]}
      ];
      order = [MODELS['VISION'], MODELS['VISION2']];
    } else {
      let search = '';
      if (SERPER_KEY &&!fileContext) {
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
      messages = [
        { role: 'system', content: `You are MOE AI. ${search? 'Info: '+search : ''} ${fileContext}` },
        { role: 'user', content: msg }
      ];
      order = [MODELS['120B'], MODELS['20B'], MODELS['70B'], MODELS['QWEN']];
    }

    let reply = null, used = '', lastErr = '';
    for (const m of order) {
      try {
        console.log('Trying:', m);
        reply = await tryModel(m, messages);
        used = m; break;
      } catch (e) { console.log('Failed', m, e.message); lastErr = e.message; }
    }

    if (!reply) return res.json({ reply: `⚠️ Busy: ${lastErr} - 30 sec baad try karo` });
    res.json({ reply, model: used });

  } catch (e) {
    console.error(e);
    res.json({ reply: 'Error: ' + e.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('MOE AI Final Running on', PORT));

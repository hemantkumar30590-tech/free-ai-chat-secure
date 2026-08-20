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
  'VISION': 'qwen/qwen3.6-27b',
};
const GROQ_KEY = process.env.GROQ_API_KEY;
const SERPER_KEY = process.env.SERPER_API_KEY;
function cleanReply(text) {
  if (!text) return "";
  let t = text;
  const o = String.fromCharCode(60) + "think" + String.fromCharCode(62);
  const c = String.fromCharCode(60) + "/think" + String.fromCharCode(62);
  const r = new RegExp(o + "[\\s\\S]*?" + c, "gi");
  t = t.replace(r, '');
  t = t.replace(new RegExp(o, "gi"), '').replace(new RegExp(c, "gi"), '');
  return t.trim();
}
async function getGoogleNews(query) {
  if (!SERPER_KEY) return "";
  try {
    const r = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 5, gl: "in" })
    });
    const data = await r.json();
    if (!data.organic) return "";
    let results = data.organic.slice(0,4).map(o => `Title:${o.title} Snippet:${o.snippet}`).join('\n');
    return `\n\n[LATEST GOOGLE SEARCH for ${query}]:\n${results}\nUse this for answer.`;
  } catch (e) { return ""; }
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
    let isImage = false;
    if (req.file) {
      const fp = req.file.path;
      mimeType = req.file.mimetype;
      if (mimeType === 'application/pdf') {
        const d = await pdf(fs.readFileSync(fp));
        fileContext = `\n[PDF]:\n${d.text.slice(0,8000)}`;
      } else if (mimeType.includes('word')) {
        const d = await mammoth.extractRawText({ path: fp });
        fileContext = `\n[DOCX]:\n${d.value.slice(0,8000)}`;
      } else if (mimeType.startsWith('image/')) {
        imageBase64 = fs.readFileSync(fp).toString('base64');
        isImage = true;
      }
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    let messages = [];
    let modelOrder = [];
    if (isImage) {
      messages = [
        { role: 'system', content: 'You are MOE AI. Explain image. Never use think tags.' },
        { role: 'user', content: [{ type: "text", text: msg }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }] }
      ];
      modelOrder = [MODELS['VISION']];
    } else {
      let searchData = "";
      const lower = msg.toLowerCase();
      if (lower.includes('news') || lower.includes('latest') || lower.includes('aaj') || lower.includes('today') || lower.includes('taza')) {
        searchData = await getGoogleNews(msg);
      }
      messages = [
        { role: 'system', content: `You are MOE AI. Answer in same language as user. ${searchData} ${fileContext} Never use thinking tags.` },
        { role: 'user', content: msg + fileContext }
      ];
      modelOrder = [MODELS['120B'], MODELS['20B'], MODELS['70B']];
    }
    let reply = null;
    let lastErr = '';
    for (const m of modelOrder) {
      try {
        let raw = await tryModel(m, messages);
        reply = cleanReply(raw);
        break;
      } catch (e) { lastErr = e.message; }
    }
    if (!reply) reply = `Busy: ${lastErr}`;
    res.json({ reply });
  } catch (e) {
    res.json({ reply: 'Error: ' + e.message });
  }
});
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('MOE AI FINAL Running'));

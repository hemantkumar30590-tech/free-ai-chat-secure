const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const GROQ_KEY = process.env.GROQ_API_KEY;

app.post('/api/chat', async (req, res) => {
  try {
    const userMsg = req.body.message || 'Hi';

    if (!GROQ_KEY) {
      return res.json({ reply: 'GROQ_API_KEY missing in Render ENV' });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + GROQ_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'user', content: userMsg }
        ]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.json({ reply: 'Error: ' + data.error.message });
    }

    const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return res.json({ reply: reply || 'No reply from Groq' });

  } catch (err) {
    console.log(err);
    return res.json({ reply: 'Server error: ' + err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('Server started on port ' + PORT);
});

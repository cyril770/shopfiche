const express = require('express');
const path = require('path');
const https = require('https');
const app = express();
const port = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) { console.error('ERROR: OPENAI_API_KEY required'); process.exit(1); }
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ status: 'healthy' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.post('/api/generate', (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt requis' });
    const body = JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 4000,
        stream: false,
        messages: [{ role: 'user', content: prompt }]
    });
    const options = {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Length': Buffer.byteLength(body) }
    };
    let rawData = '';
    const apiReq = https.request(options, (apiRes) => {
        apiRes.on('data', chunk => { rawData += chunk; });
        apiRes.on('end', () => {
            try {
                const parsed = JSON.parse(rawData);
                const content = parsed.choices?.[0]?.message?.content || '';
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.write('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n');
                res.write('data: [DONE]\n\n');
                res.end();
            } catch(e) { res.status(500).json({ error: 'Erreur parsing' }); }
        });
    });
    apiReq.on('error', () => res.status(500).json({ error: 'Erreur API' }));
    apiReq.write(body);
    apiReq.end();
});
app.listen(port, () => console.log(`ShopFiche running on port ${port}`));
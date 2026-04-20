const express = require('express');
const path = require('path');
const https = require('https');
const app = express();
const port = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY environment variable is required');
    process.exit(1);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ status: 'healthy' }));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/generate', (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt requis' });

    const systemPrompt = `Tu es un expert SEO e-commerce spécialisé en dropshipping francophone. Tu génères des fiches produits professionnelles, sans fautes, sans mots coupés.

RÈGLES ABSOLUES :
- N'abrège JAMAIS un mot, écris chaque phrase jusqu'au bout
- Vérifie que chaque phrase est grammaticalement complète avant de passer à la suivante
- Le META_TITLE doit faire entre 50 et 60 caractères, jamais coupé
- La META_DESCRIPTION doit faire entre 140 et 160 caractères, jamais coupée

Réponds TOUJOURS dans ce format exact, sans rien d'autre :

DESCRIPTION:
[description produit de 150 à 200 mots, persuasive, SEO-optimisée, sans fautes]

META_TITLE:
[titre SEO entre 50 et 60 caractères, jamais coupé]

META_DESCRIPTION:
[description meta entre 140 et 160 caractères, jamais coupée]`;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
    ];

    const body = JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 2000,
        stream: true,
        messages: messages
    });

    const options = {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Length': Buffer.byteLength(body)
        }
    };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const apiReq = https.request(options, (apiRes) => {
        apiRes.on('data', chunk => res.write(chunk));
        apiRes.on('end', () => { res.write('data: [DONE]\n\n'); res.end(); });
    });

    apiReq.on('error', (err) => {
        console.error('OpenAI error:', err);
        res.status(500).json({ error: 'Erreur API OpenAI' });
    });

    apiReq.write(body);
    apiReq.end();
});

app.listen(port, () => console.log(`ShopFiche running on port ${port}`));

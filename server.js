const express = require('express');
const path = require('path');
const https = require('https');
const app = express();
const port = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
if (!OPENAI_API_KEY) { console.error('ERROR: OPENAI_API_KEY required'); process.exit(1); }

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ status: 'healthy' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Stripe checkout session
app.post('/api/checkout', (req, res) => {
    if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe non configure' });
    const body = JSON.stringify({
        mode: 'subscription',
        line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
        success_url: 'https://shopfiche.fr/success.html?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://shopfiche.fr/?cancelled=1',
        allow_promotion_codes: true
    });
    const options = {
        hostname: 'api.stripe.com',
        path: '/v1/checkout/sessions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
        }
    };
    const stripeReq = https.request(options, (stripeRes) => {
        let data = '';
        stripeRes.on('data', chunk => { data += chunk; });
        stripeRes.on('end', () => {
            try {
                const session = JSON.parse(data);
                if (session.url) res.json({ url: session.url });
                else res.status(500).json({ error: 'Erreur Stripe', details: data });
            } catch(e) { res.status(500).json({ error: 'Parse error' }); }
        });
    });
    stripeReq.on('error', (err) => res.status(500).json({ error: err.message }));
    // Encode form data
    const formData = 'mode=subscription&line_items[0][price]=' + STRIPE_PRICE_ID + '&line_items[0][quantity]=1&success_url=https%3A%2F%2Fshopfiche.fr%2Fsuccess.html%3Fsession_id%3D%7BCHECKOUT_SESSION_ID%7D&cancel_url=https%3A%2F%2Fshopfiche.fr%2F%3Fcancelled%3D1&allow_promotion_codes=true';
    stripeReq.write(formData);
    stripeReq.end();
});

// Config publique
app.get('/api/config', (req, res) => {
    res.json({ publishableKey: STRIPE_PUBLISHABLE_KEY });
});

// OpenAI generate
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
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Length': Buffer.byteLength(body)
        }
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
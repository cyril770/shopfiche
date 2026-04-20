const express = require('express');
const path = require('path');
const https = require('https');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
if (!OPENAI_API_KEY) { console.error('ERROR: OPENAI_API_KEY required'); process.exit(1); }

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ status: 'healthy' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// === FONDATEURS ===
const FOUNDERS_FILE = path.join(__dirname, 'founders.json');
const MAX_FOUNDERS = 100;

function getFounders() {
  try { return JSON.parse(fs.readFileSync(FOUNDERS_FILE, 'utf8')); }
  catch(e) { return []; }
}

function saveFounders(list) {
  fs.writeFileSync(FOUNDERS_FILE, JSON.stringify(list, null, 2));
}

app.get('/api/founders/count', (req, res) => {
  const founders = getFounders();
  res.json({ count: founders.length, remaining: MAX_FOUNDERS - founders.length });
});

app.post('/api/founders/register', (req, res) => {
  const { name, email, shop, products } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Nom et email requis' });
  const founders = getFounders();
  if (founders.length >= MAX_FOUNDERS) return res.status(400).json({ error: 'Les 100 places sont prises !' });
  if (founders.find(f => f.email === email)) return res.status(400).json({ error: 'Cet email est deja inscrit' });
  founders.push({ name, email, shop: shop||'', products: products||'', date: new Date().toISOString(), place: founders.length + 1 });
  saveFounders(founders);
  console.log('New founder #' + founders.length + ': ' + name + ' <' + email + '>');
  res.json({ success: true, place: founders.length, remaining: MAX_FOUNDERS - founders.length });
});

app.get('/api/founders/list', (req, res) => {
  const key = req.query.key;
  if (key !== process.env.ADMIN_KEY && key !== 'shopfiche2024admin') return res.status(403).json({ error: 'Unauthorized' });
  res.json(getFounders());
});

// === STRIPE ===
app.post('/api/checkout', (req, res) => {
  if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe non configure' });
  const formData = 'mode=subscription&line_items[0][price]=' + STRIPE_PRICE_ID + '&line_items[0][quantity]=1&success_url=https%3A%2F%2Fshopfiche.fr%2Fsuccess.html%3Fsession_id%3D%7BCHECKOUT_SESSION_ID%7D&cancel_url=https%3A%2F%2Fshopfiche.fr%2F%3Fcancelled%3D1&allow_promotion_codes=true';
  const options = {
    hostname: 'api.stripe.com', path: '/v1/checkout/sessions', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY, 'Content-Length': Buffer.byteLength(formData) }
  };
  let data = '';
  const apiReq = https.request(options, (apiRes) => {
    apiRes.on('data', chunk => { data += chunk; });
    apiRes.on('end', () => {
      try { const s = JSON.parse(data); s.url ? res.json({ url: s.url }) : res.status(500).json({ error: 'Stripe error', details: data }); }
      catch(e) { res.status(500).json({ error: 'Parse error' }); }
    });
  });
  apiReq.on('error', () => res.status(500).json({ error: 'Erreur API' }));
  apiReq.write(formData);
  apiReq.end();
});

app.get('/api/config', (req, res) => res.json({ publishableKey: STRIPE_PUBLISHABLE_KEY }));

// === OPENAI ===
app.post('/api/generate', (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt requis' });
  const body = JSON.stringify({ model: 'gpt-4o', max_tokens: 4000, stream: false, messages: [{ role: 'user', content: prompt }] });
  const options = {
    hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST',
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
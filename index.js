const express    = require('express');
const bodyParser = require('body-parser');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 8000;

require('events').EventEmitter.defaultMaxListeners = 500;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ── ROUTES ─────────────────────────────────────────────────────
app.use('/code',   require('./pair'));   // GET /code?number=2547xxx  → returns pairing code JSON
app.use('/server', require('./qr'));     // GET /server               → returns QR image buffer

app.get('/pair',   (_req, res) => res.sendFile(path.join(__dirname, 'pair.html')));
app.get('/qr',     (_req, res) => res.sendFile(path.join(__dirname, 'qr.html')));
app.get('/',       (_req, res) => res.sendFile(path.join(__dirname, 'main.html')));

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════╗
║   🤖  ALMEER XMD  PAIR SITE      ║
╚══════════════════════════════════╝
  🌐 Running at http://localhost:${PORT}
  📱 Pairing : http://localhost:${PORT}/pair
  📷 QR Code : http://localhost:${PORT}/qr
  `);
});

module.exports = app;
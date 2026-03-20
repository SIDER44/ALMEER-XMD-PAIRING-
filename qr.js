const express  = require('express');
const fs       = require('fs');
const pino     = require('pino');
const QRCode   = require('qrcode');
const router   = express.Router();
const { makeid } = require('./gen-id');
const { upload } = require('./upload');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  delay,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

function removeFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.rmSync(filePath, { recursive: true, force: true });
}

// GET /server  → returns QR code as PNG image
router.get('/', async (req, res) => {
  const id     = makeid();
  const tmpDir = `./temp/${id}`;

  async function startQR() {
    const { state, saveCreds } = await useMultiFileAuthState(tmpDir);

    try {
      const sock = makeWASocket({
        auth:              state,
        printQRInTerminal: false,
        logger:            pino({ level: 'fatal' }),
        browser:           Browsers.macOS('Desktop'),
        syncFullHistory:   false,
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Send QR as image
        if (qr && !res.headersSent) {
          const buffer = await QRCode.toBuffer(qr);
          res.setHeader('Content-Type', 'image/png');
          res.end(buffer);
        }

        if (connection === 'open') {
          await delay(5000);
          const credsPath = `${tmpDir}/creds.json`;

          try {
            const catboxUrl = await upload(credsPath, `${sock.user.id}.json`);
            const fileId    = catboxUrl.replace('https://files.catbox.moe/', '');
            const sessionId = 'ALMEER~' + fileId;

            const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const idMsg   = await sock.sendMessage(userJid, { text: sessionId });

            await sock.sendMessage(userJid, {
              text:
`*Hey there, ALMEER XMD User!* 👋

Your session has been created via QR!

🔐 *Session ID:* Sent above ☝️
⚠️ *Keep it safe!* Do NOT share it.

*How to use:*
1. Copy the Session ID above
2. Railway → your bot → Environment vars
3. Add *SESSION_ID* = (paste here)
4. Redeploy ✅

> © *Powered by ALMEER XMD*`,
              contextInfo: {
                externalAdReply: {
                  title: 'ALMEER XMD — Connected ✅',
                  body: 'Your session is ready!',
                  thumbnailUrl: 'https://files.catbox.moe/bqs70b.jpg',
                  sourceUrl: 'https://whatsapp.com/channel/0029VbA6MSYJUM2TVOzCSb2A',
                  mediaType: 1,
                  renderLargerThumbnail: true,
                }
              }
            }, { quoted: idMsg });

            console.log(`✅ QR Session created for ${sock.user.id}`);

          } catch (err) {
            console.error('QR upload error:', err.message);
          }

          await delay(500);
          await sock.ws.close();
          removeFile(tmpDir);

        } else if (
          connection === 'close' &&
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
        ) {
          await delay(2000);
          startQR();
        }
      });

    } catch (err) {
      console.error('QR error:', err.message);
      removeFile(tmpDir);
      if (!res.headersSent) res.status(500).send('Service Unavailable');
    }
  }

  await startQR();
});

// Auto-restart every 3 minutes to keep fresh
setInterval(() => {
  console.log('🔄 QR service refreshing...');
  process.exit();
}, 180000);

module.exports = router;
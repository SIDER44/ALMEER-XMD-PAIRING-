const express  = require('express');
const fs       = require('fs');
const pino     = require('pino');
const router   = express.Router();
const { makeid } = require('./gen-id');
const { upload } = require('./upload');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  delay,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

function removeFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.rmSync(filePath, { recursive: true, force: true });
}

// GET /code?number=2547xxxxxxxxx
router.get('/', async (req, res) => {
  const id  = makeid();
  const num = (req.query.number || '').replace(/[^0-9]/g, '');

  if (!num || num.length < 7) {
    return res.json({ code: '❌ Invalid number — include country code' });
  }

  const tmpDir = `./temp/${id}`;
  let pairingRequested = false;

  async function startPairing() {
    const { state, saveCreds } = await useMultiFileAuthState(tmpDir);

    try {
      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: 'fatal' })
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'fatal' }),
        browser: Browsers.macOS('Safari'),
        syncFullHistory: false,
        generateHighQualityLinkPreview: true,
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // ── OFFICIAL BAILEYS METHOD: request code on connecting or qr event ──
        // Docs: "wait at least until the connecting/QR event"
        if ((connection === 'connecting' || !!qr) && !pairingRequested) {
          pairingRequested = true;
          try {
            const code = await sock.requestPairingCode(num);
            if (!res.headersSent) {
              res.json({ code });
            }
          } catch (e) {
            console.error('Pairing code error:', e.message);
            if (!res.headersSent) {
              res.json({ code: '❗ Service Unavailable — try again' });
            }
          }
        }

        if (connection === 'open') {
          // Connected — upload creds and send SESSION_ID to user
          await delay(5000);
          const credsPath = `${tmpDir}/creds.json`;

          try {
            const catboxUrl = await upload(credsPath, `${sock.user.id}.json`);
            const fileId    = catboxUrl.replace('https://files.catbox.moe/', '');
            const sessionId = 'ALMEER~' + fileId;
            const userJid   = sock.user.id.split(':')[0] + '@s.whatsapp.net';

            const idMsg = await sock.sendMessage(userJid, { text: sessionId });

            await sock.sendMessage(userJid, {
              text:
`*Hey there, ALMEER XMD User!* 👋

Your session has been successfully created!

🔐 *Session ID:* Sent above ☝️
⚠️ *Keep it safe!* Do NOT share it.

*How to activate your bot:*
1️⃣ Copy the Session ID message above
2️⃣ Go to Railway → your bot service
3️⃣ Add environment variable:
   *SESSION_ID* = (paste here)
4️⃣ Redeploy → bot connects ✅

——————
📢 *WhatsApp Channel:*
https://whatsapp.com/channel/0029VbA6MSYJUM2TVOzCSb2A

💻 *GitHub:*
https://github.com/SIDER44/ALMEER-XMD3
——————

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

            console.log(`✅ Session created for ${sock.user.id}`);

          } catch (uploadErr) {
            console.error('Upload error:', uploadErr.message);
            // Fallback — send base64 directly
            try {
              const raw       = fs.readFileSync(`${tmpDir}/creds.json`, 'utf8');
              const b64       = Buffer.from(raw).toString('base64');
              const sessionId = 'ALMEER_' + b64;
              const userJid   = sock.user.id.split(':')[0] + '@s.whatsapp.net';
              await sock.sendMessage(userJid, {
                text: `✅ *Session ID (base64):*\n\n${sessionId}\n\nCopy everything above as SESSION_ID in Railway.\n\n> © ALMEER XMD`
              });
            } catch (_) {}
          }

          await delay(500);
          await sock.ws.close();
          removeFile(tmpDir);

        } else if (
          connection === 'close' &&
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
        ) {
          pairingRequested = false;
          await delay(2000);
          startPairing();
        }
      });

    } catch (err) {
      console.error('Start pairing error:', err.message);
      removeFile(tmpDir);
      if (!res.headersSent) {
        res.json({ code: '❗ Service Unavailable' });
      }
    }
  }

  await startPairing();
});

module.exports = router;
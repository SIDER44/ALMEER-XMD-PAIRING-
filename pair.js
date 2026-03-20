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
    return res.json({ code: '❌ Invalid number' });
  }

  const tmpDir = `./temp/${id}`;

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

      // ── REQUEST PAIRING CODE ───────────────────────────────
      if (!sock.authState.creds.registered) {
        await delay(1500);
        const code = await sock.requestPairingCode(num);
        if (!res.headersSent) {
          res.json({ code });
        }
      }

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          // ── CONNECTED — build and send SESSION_ID ──────────
          await delay(5000);

          const credsPath = `${tmpDir}/creds.json`;

          try {
            // Upload creds.json to catbox.moe
            const catboxUrl    = await upload(credsPath, `${sock.user.id}.json`);
            // Strip the base URL to get just the file ID part
            const fileId       = catboxUrl.replace('https://files.catbox.moe/', '');
            // SESSION_ID format: ALMEER~<fileId>
            const sessionId    = 'ALMEER~' + fileId;

            // Send session ID to user's own number
            const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

            const idMsg = await sock.sendMessage(userJid, { text: sessionId });

            await sock.sendMessage(userJid, {
              text:
`*Hey there, ALMEER XMD User!* 👋

Thanks for using *ALMEER XMD* — your session has been created!

🔐 *Session ID:* Sent above ☝️
⚠️ *Keep it safe!* Do NOT share this ID.

*How to use it:*
1. Copy the Session ID above
2. Go to Railway → your bot service
3. Add env variable:
   *SESSION_ID* = (paste Session ID)
4. Redeploy — bot connects automatically ✅

——————
*📢 Stay Updated:*
https://whatsapp.com/channel/0029VbA6MSYJUM2TVOzCSb2A

*💻 Source Code:*
https://github.com/SIDER44/ALMEER-XMD3

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

            // Fallback: send creds as base64 directly
            try {
              const credsData  = fs.readFileSync(credsPath, 'utf8');
              const b64        = Buffer.from(credsData).toString('base64');
              const sessionId  = 'ALMEER_' + b64;
              const userJid    = sock.user.id.split(':')[0] + '@s.whatsapp.net';

              await sock.sendMessage(userJid, {
                text:
`✅ *Session created!*

🔐 *Session ID:* 
${sessionId}

⚠️ Copy the full text above as your SESSION_ID.

> © *Powered by ALMEER XMD*`
              });
            } catch (_) {}
          }

          await delay(500);
          await sock.ws.close();
          removeFile(tmpDir);
          console.log(`🗑️  Cleaned temp session: ${id}`);

        } else if (
          connection === 'close' &&
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
        ) {
          await delay(2000);
          startPairing();
        }
      });

    } catch (err) {
      console.error('Pairing error:', err.message);
      removeFile(tmpDir);
      if (!res.headersSent) {
        res.json({ code: '❗ Service Unavailable' });
      }
    }
  }

  await startPairing();
});

module.exports = router;
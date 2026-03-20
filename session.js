const fs   = require('fs');
const path = require('path');
const https = require('https');

/**
 * Download a file from a URL and return its content as a string
 */
function downloadText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Load session from SESSION_ID environment variable.
 *
 * Supports two formats:
 *  1. ALMEER~<catboxFileId>  — downloads creds.json from catbox.moe (new pairing site format)
 *  2. ALMEER_<base64>        — decodes base64-encoded creds.json content (legacy format)
 */
async function loadSessionFromEnv(sessionPath) {
  const sessionId = process.env.SESSION_ID || process.env.SESSION_DATA;

  if (!sessionId) {
    console.log('ℹ️  No SESSION_ID — will use pairing code or existing session');
    return false;
  }

  const credsPath = path.join(sessionPath, 'creds.json');

  // Skip if creds already exist (don't overwrite a live session)
  if (fs.existsSync(credsPath)) {
    console.log('ℹ️  Using existing session files');
    return true;
  }

  fs.mkdirSync(sessionPath, { recursive: true });

  try {
    let credsJson = null;

    // ── FORMAT 1: ALMEER~<catboxId> ───────────────────────────
    // e.g. ALMEER~abc123.json  (from new pairing site)
    if (sessionId.startsWith('ALMEER~')) {
      const fileId  = sessionId.slice(7); // strip "ALMEER~"
      const url     = `https://files.catbox.moe/${fileId}`;
      console.log(`⬇️  Downloading session from catbox: ${url}`);
      credsJson = await downloadText(url);
    }

    // ── FORMAT 2: ALMEER_<base64> ─────────────────────────────
    // Legacy format — base64 encoded creds.json
    else if (sessionId.startsWith('ALMEER_')) {
      const b64 = sessionId.slice(7);
      credsJson = Buffer.from(b64, 'base64').toString('utf8');
      console.log('📦 Decoding session from base64...');
    }

    else {
      console.log('⚠️  Unknown SESSION_ID format. Expected ALMEER~ or ALMEER_');
      return false;
    }

    // Validate JSON before writing
    JSON.parse(credsJson);
    fs.writeFileSync(credsPath, credsJson);
    console.log('✅ Session loaded from SESSION_ID env variable');
    return true;

  } catch (e) {
    console.error('❌ Failed to load session:', e.message);
    return false;
  }
}

module.exports = { loadSessionFromEnv };
const axios    = require('axios');
const FormData = require('form-data');
const fs       = require('fs');

/**
 * Upload a file to catbox.moe (free, no account needed)
 * Returns the full URL e.g. https://files.catbox.moe/abc123.json
 */
async function upload(filePath, filename) {
  const form = new FormData();
  form.append('reqtype',  'fileupload');
  form.append('userhash', '');  // anonymous upload
  form.append('fileToUpload', fs.createReadStream(filePath), { filename });

  const res = await axios.post('https://catbox.moe/user.php', form, {
    headers: form.getHeaders(),
    timeout: 30000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  if (!res.data || !res.data.startsWith('https://')) {
    throw new Error('Catbox upload failed: ' + res.data);
  }

  return res.data.trim(); // e.g. https://files.catbox.moe/abc123.json
}

module.exports = { upload };
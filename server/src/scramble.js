// Scrambling the database password in the settings file (garmentmfg-config.json).
// Not a strong lock (the key is inside the program); it only keeps the password from being read in Notepad.
// Separate from config.js so the installer can use it before a settings file exists.
import crypto from 'crypto';

const SCRAMBLE_KEY = crypto.createHash('sha256').update('garmentmfg-settings').digest();

export function scramble(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SCRAMBLE_KEY, iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return 's1:' + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function unscramble(value) {
  if (!String(value || '').startsWith('s1:')) throw new Error('The database password in the settings file is not scrambled (s1:...).');
  const raw = Buffer.from(String(value).slice(3), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', SCRAMBLE_KEY, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}


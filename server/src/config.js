// All settings of the server, read once at start.
//
// Installed app (Windows): settings come from garmentmfg-config.json, in the "data" folder next to
//   GarmentMFG.exe, e.g. D:\GarmentMFG\data\ (or the path in GARMENTMFG_CONFIG). The database password is stored scrambled
//   ("passwordScrambled"), so it can't be read by opening the file in Notepad.
// Development (this Mac): no settings file, the .env file is used as before.
//
// Example garmentmfg-config.json:
//   {
//     "port": 6060,
//     "database": { "host": "127.0.0.1", "port": 5433, "name": "garmentmfg", "user": "garmentmfg", "passwordScrambled": "s1:..." },
//     "sessionSecret": "<long random text>",
//     "backupDir": "D:\\GarmentMFG\\data\\Backups",
//     "pgBinDir": "D:\\GarmentMFG\\pgsql\\bin",
//     "webDir": "D:\\GarmentMFG\\web"
//   }
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// import.meta.url is empty once this file is bundled into the packed app (CommonJS); there the
// development-only paths below are never used, so an empty base is fine.
const __dirname = import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : '';

// true inside GarmentMFG.exe / GarmentMFGSupport.exe (set when the app is packed, see packaging/)
export const PACKAGED = typeof __GARMENTMFG_PACKAGED__ !== 'undefined';

/** Where the installed app keeps its data (settings, database, backups, logs): the "data" folder
 *  next to GarmentMFG.exe / GarmentMFGSupport.exe, so both find it without any setting */
export const DATA_DIR = path.join(path.dirname(process.execPath), 'data');

// The database password is kept scrambled in the settings file (see scramble.js)
import { scramble, unscramble } from './scramble.js';
export { scramble, unscramble };

// --- read the settings -------------------------------------------------------------
export const CONFIG_FILE = process.env.GARMENTMFG_CONFIG || (PACKAGED ? path.join(DATA_DIR, 'garmentmfg-config.json') : '');

function fromFile(file) {
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const db = c.database || {};
  const password = db.passwordScrambled ? unscramble(db.passwordScrambled) : '';
  return {
    installed: true,
    port: Number(c.port) || 6060,
    database: {
      host: db.host || '127.0.0.1',
      port: Number(db.port) || 5432,
      database: db.name || 'garmentmfg',
      user: db.user || 'garmentmfg',
      password,
    },
    sessionSecret: c.sessionSecret,
    backupDir: c.backupDir || path.join(path.dirname(file), 'Backups'),
    pgBinDir: c.pgBinDir || '',
    webDir: c.webDir || path.join(path.dirname(process.execPath), 'web'),
  };
}

function fromEnv() {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  return {
    installed: false,
    port: Number(process.env.PORT) || 6061,
    database: { connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/garmentmfg' },
    sessionSecret: process.env.SESSION_SECRET || 'garmentmfg_dev_secret_key_change_in_production',
    backupDir: process.env.BACKUP_DIR || path.resolve(__dirname, '../../../garmentmfg_backups/daily'),
    pgBinDir: process.env.PG_BIN_DIR || '',
    webDir: path.resolve(__dirname, '../../client/dist'),
  };
}

const config = CONFIG_FILE ? fromFile(CONFIG_FILE) : fromEnv();

if (!config.sessionSecret || config.sessionSecret.length < 16) {
  throw new Error('Settings: "sessionSecret" is missing or too short (at least 16 characters).');
}

export default config;

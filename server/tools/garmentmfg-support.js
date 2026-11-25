// GarmentMFG support tool: for the support person only, run on the server PC. See SUPPORT_GUIDE.md.
//
// LOCKED: every command first asks for the KANVTECH password (our "support code").
// Only exception: setting the KANVTECH password for the very first time on a new installation.
//
//   node server/tools/garmentmfg-support.js status
//   node server/tools/garmentmfg-support.js set-support-password [new password]
//   node server/tools/garmentmfg-support.js set-admin-password   [new password]
//   node server/tools/garmentmfg-support.js change-db-password   [new password]   (installed app only)
//   node server/tools/garmentmfg-support.js show-db-password                       (installed app only)
//   node server/tools/garmentmfg-support.js backup
//   node server/tools/garmentmfg-support.js list-backups
//   node server/tools/garmentmfg-support.js restore <backup file>
//   node server/tools/garmentmfg-support.js import  <data file>         (.sql dump or .backup, e.g. a company's old data)
//   node server/tools/garmentmfg-support.js view-db                       (opens the database in a browser viewer - us only)
//
// It uses the same settings as the app (GARMENTMFG_CONFIG settings file, or .env on the Mac).
// When a password is left out, it asks for it (typing is hidden). For scripts, the support code can
// be given in the GARMENTMFG_SUPPORT_CODE setting instead of typing it.
import fs from 'fs';
import readline from 'readline';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import pg from 'pg';
import config, { CONFIG_FILE, scramble } from '../src/config.js';
import { checkPassword, hashPassword } from '../src/passwords.js';
import { importDataFile, listBackups, makeBackup, restoreBackup } from '../src/backup.js';
import { runMigrations } from '../src/migrate.js';

const [command, arg] = process.argv.slice(2);
const pool = new pg.Pool(config.database);

function ask(question, hidden = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (hidden) {
    // show nothing while typing (screen may be shared on AnyDesk / Zoom)
    rl._writeToOutput = (text) => { if (!rl.line && text.includes(question)) rl.output.write(text); };
  }
  return new Promise((resolve) => rl.question(question, (a) => {
    rl.close();
    if (hidden) process.stdout.write('\n');
    resolve(a.trim());
  }));
}

const KANVTECH_LOGIN = `SELECT l.id, l.passwordhash FROM login l JOIN operatormaster o ON o.id = l.empid
  WHERE l.hidden = 'YES' AND UPPER(TRIM(o.empcode)) = 'KANVTECH';`;

/** The lock: ask for the KANVTECH password and check it. */
async function unlock() {
  const login = (await pool.query(KANVTECH_LOGIN)).rows[0];
  if (!login) throw new Error('The KANVTECH support login was not found (is the database set up?).');
  if (!login.passwordhash) {
    if (command === 'set-support-password') return; // new installation: set it for the first time
    throw new Error('The KANVTECH password is not set yet. Set it first: set-support-password');
  }
  const code = process.env.GARMENTMFG_SUPPORT_CODE || (await ask('Support code (KANVTECH password): ', true));
  if (!checkPassword(code, login.passwordhash)) throw new Error('Wrong support code. Nothing was done.');
}

/** The password from the command line, or asked twice */
async function newPassword(label) {
  if (arg) return arg;
  const first = await ask(`New ${label} password: `, true);
  const again = await ask(`Type it again: `, true);
  if (first !== again) throw new Error('The two passwords are not the same. Nothing was changed.');
  return first;
}

/** Windows: stop the GarmentMFG app while the data is replaced, start it again afterwards */
async function withAppStopped(work) {
  if (process.platform !== 'win32') return work();
  console.log('Stopping the GarmentMFG app...');
  spawnSync('net', ['stop', 'GarmentMFG'], { stdio: 'ignore', windowsHide: true });
  try {
    return await work();
  } finally {
    console.log('Starting the GarmentMFG app again...');
    spawnSync('net', ['start', 'GarmentMFG'], { stdio: 'ignore', windowsHide: true });
  }
}

/** A postgres:// URL for the current database (for the pgweb viewer) */
function databaseUrl() {
  const db = config.database;
  if (db.connectionString) {
    return db.connectionString + (db.connectionString.includes('?') ? '&' : '?') + 'sslmode=disable';
  }
  const pass = encodeURIComponent(db.password || '');
  return `postgres://${db.user}:${pass}@${db.host}:${db.port}/${db.database}?sslmode=disable`;
}

/** The pgweb viewer that ships next to GarmentMFGSupport.exe (GARMENTMFG_PGWEB overrides it, e.g. on the Mac) */
function pgwebProgram() {
  if (process.env.GARMENTMFG_PGWEB) return process.env.GARMENTMFG_PGWEB;
  const name = process.platform === 'win32' ? 'pgweb.exe' : 'pgweb';
  return path.join(path.dirname(process.execPath), name);
}

function checkStrong(password, min) {
  if (!password || password.length < min) throw new Error(`The password must be at least ${min} characters. Nothing was changed.`);
}

const commands = {
  async status() {
    const db = await pool.query(`SELECT current_database() AS name, version() AS version;`);
    const updates = await pool.query(`SELECT name FROM schema_migrations ORDER BY name;`);
    const logins = await pool.query(
      `SELECT o.empcode, l.isadmin, l.isactive, l.permanent, l.hidden, (l.passwordhash IS NOT NULL) AS hashed
       FROM login l JOIN operatormaster o ON o.id = l.empid ORDER BY l.hidden, l.id;`
    );
    const backups = listBackups();
    console.log(`Settings:  ${CONFIG_FILE || '.env (development)'}`);
    console.log(`Database:  ${db.rows[0].name}  (${db.rows[0].version.split(',')[0]})`);
    console.log(`Updates:   ${updates.rows.map((r) => r.name).join(', ')}`);
    console.log(`Backups:   ${backups.length} in ${config.backupDir}${backups[0] ? `  (newest ${backups[0].name})` : ''}`);
    console.log(`Logins:`);
    for (const l of logins.rows) {
      const tags = [l.isadmin === 'YES' && 'admin', l.isactive !== 'YES' && 'INACTIVE', l.permanent === 'YES' && 'permanent', l.hidden === 'YES' && 'hidden'];
      const note = l.hidden === 'YES' ? (l.hashed ? 'password set' : 'NO PASSWORD YET (cannot log in)') : '';
      console.log(`  ${l.empcode.padEnd(10)} ${tags.filter(Boolean).join(', ')}  ${note}`);
    }
  },

  async 'set-support-password'() {
    const password = await newPassword('KANVTECH support');
    checkStrong(password, 10);
    const r = await pool.query(
      `UPDATE login SET passwordhash = $1 WHERE hidden = 'YES' AND empid IN (SELECT id FROM operatormaster WHERE UPPER(TRIM(empcode)) = 'KANVTECH');`,
      [hashPassword(password)]
    );
    if (r.rowCount !== 1) throw new Error('The KANVTECH support login was not found (is the database set up?).');
    console.log('KANVTECH support password changed. Log in with Employee Code KANVTECH and the new password.');
  },

  async 'set-admin-password'() {
    const password = await newPassword('ADMIN');
    checkStrong(password, 4);
    const r = await pool.query(
      `UPDATE login SET password = $1, isactive = 'YES' WHERE permanent = 'YES' AND hidden = 'NO'
         AND empid IN (SELECT id FROM operatormaster WHERE UPPER(TRIM(empcode)) = 'ADMIN');`,
      [password]
    );
    if (r.rowCount !== 1) throw new Error('The ADMIN login was not found.');
    console.log('ADMIN password changed. Tell the company admin their new password.');
  },

  async 'change-db-password'() {
    if (!CONFIG_FILE) throw new Error('Only for the installed app (settings file). On the Mac the database has no password.');
    const password = await newPassword('database');
    checkStrong(password, 8);
    const user = config.database.user.replace(/"/g, '""');
    await pool.query(`ALTER ROLE "${user}" WITH PASSWORD '${password.replace(/'/g, "''")}';`);
    const settings = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    settings.database.passwordScrambled = scramble(password);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2));
    console.log('Database password changed and saved (scrambled) in the settings file.');
    console.log('Write it on the support sheet, then restart the GarmentMFG service so the app uses it.');
  },

  async 'show-db-password'() {
    if (!CONFIG_FILE) throw new Error('Only for the installed app (settings file). On the Mac the database has no password.');
    console.log(`Database:  ${config.database.database}   user: ${config.database.user}   password: ${config.database.password}`);
  },

  async backup() {
    const b = await makeBackup();
    console.log(`Backup made: ${b.name}  (${Math.round(b.size / 1024)} KB)  in ${config.backupDir}`);
  },

  async 'list-backups'() {
    const list = listBackups();
    if (!list.length) return console.log(`No backups in ${config.backupDir}`);
    for (const b of list) console.log(`${b.name}  ${String(Math.round(b.size / 1024)).padStart(6)} KB`);
  },

  async restore() {
    if (!arg || !fs.existsSync(arg)) throw new Error('Give the backup file: restore <path to .backup file>');
    console.log('This REPLACES everything in the database with the backup.');
    console.log('A backup of the current data is made before restoring.');
    if ((await ask('Type RESTORE to continue: ')) !== 'RESTORE') throw new Error('Cancelled. Nothing was changed.');
    await withAppStopped(async () => {
      const safety = await makeBackup();
      console.log(`Current data saved first: ${safety.name}`);
      await restoreBackup(arg);
    });
    console.log('Restored. Log in to GarmentMFG to check.');
  },

  // A company's existing data (e.g. a .sql dump from a development PC) into this installation.
  async import() {
    if (!arg || !fs.existsSync(arg)) throw new Error('Give the data file: import <path to .sql or .backup file>');
    console.log(`Data file: ${arg}`);
    console.log('This REPLACES everything in the database with the data in this file.');
    console.log('A backup of the current data is made first (so it can be undone with "restore").');
    if ((await ask('Type IMPORT to continue: ')) !== 'IMPORT') throw new Error('Cancelled. Nothing was changed.');
    // this installation's support code stays the same, whatever KANVTECH password the file has
    const supportHash = (await pool.query(KANVTECH_LOGIN)).rows[0].passwordhash;
    await withAppStopped(async () => {
      const safety = await makeBackup();
      console.log(`Current data saved first: ${safety.name}`);
      console.log('Loading the data...');
      try {
        await importDataFile(arg);
      } catch (err) {
        throw new Error(`${err.message}\nThe data file could not be loaded. Nothing was changed: the data is as before.`);
      }
      const applied = await runMigrations(pool); // brings older data up to this version
      if (applied.length) console.log(`Updated to this version: ${applied.join(', ')}`);
      await pool.query(
        `UPDATE login SET passwordhash = $1 WHERE hidden = 'YES'
           AND empid IN (SELECT id FROM operatormaster WHERE UPPER(TRIM(empcode)) = 'KANVTECH');`,
        [supportHash]
      );
    });
    const c = (await pool.query(
      `SELECT (SELECT COUNT(*) FROM operatormaster WHERE hidden = 'NO')::int AS employees,
              (SELECT COUNT(DISTINCT LOWER(TRIM(batchname))) FROM joborder_operations)::int AS lots,
              (SELECT COUNT(*) FROM login WHERE hidden = 'NO')::int AS logins;`
    )).rows[0];
    console.log(`Imported: ${c.employees} employees, ${c.lots} lots, ${c.logins} logins.`);
    console.log('The company logs in with their own ADMIN password from this data. KANVTECH is unchanged.');
  },

  // Open the database in a browser viewer (pgweb), on the server PC only. Read-only, so looking
  // around can't change anything. Press Ctrl+C in this window to close it.
  async 'view-db'() {
    const bin = pgwebProgram();
    if (!fs.existsSync(bin)) throw new Error(`The database viewer was not found: ${bin}`);
    const port = Number(process.env.GARMENTMFG_PGWEB_PORT) || 8083;
    console.log(`Opening the database viewer:  http://localhost:${port}`);
    console.log('It opens in your browser. This window must stay open. Press Ctrl+C here to close it.\n');
    const r = spawnSync(bin, ['--url', databaseUrl(), '--bind', '127.0.0.1', '--listen', String(port), '--readonly'],
      { stdio: 'inherit', env: { ...process.env, TMPDIR: os.tmpdir() } });
    if (r.error) throw new Error(`Could not start the viewer: ${r.error.message}`);
  },
};

async function main() {
  try {
    if (!commands[command]) {
      console.log('Commands: status | set-support-password | set-admin-password | change-db-password | show-db-password | backup | list-backups | restore <file> | import <file> | view-db');
      process.exitCode = command ? 1 : 0;
    } else {
      await unlock();
      await commands[command]();
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

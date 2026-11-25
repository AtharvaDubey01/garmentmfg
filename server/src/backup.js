// Database backups (used by the server and by the support tool).
//
//   * Daily: the first time the server runs on a new day it makes one (checked every hour),
//     so a PC that is switched off at night still gets its backup in the morning.
//   * Admin > Backups: "Back up now", and download a backup (e.g. to keep on a pendrive).
//   * Backups of the last KEEP_MONTHS months are kept, older ones are deleted (never the newest one).
//   * Restore: only with the support tool (stop the app first), never from the app.
//
// Files: <backupDir>/garmentmfg-backup-YYYY-MM-DD_HHMM.backup  (PostgreSQL "custom" format,
// made by pg_dump; not readable without PostgreSQL tools).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import config from './config.js';

const KEEP_MONTHS = 6;
const PREFIX = 'garmentmfg-backup-';
const OLD_PREFIXES = []; // older file-name prefixes to keep listing (none)
const prefixOf = (name) => [PREFIX, ...OLD_PREFIXES].find((p) => name.startsWith(p));

/** Full path of a PostgreSQL program (pg_dump, pg_restore, psql), from the settings or the PATH */
function pgProgram(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return config.pgBinDir ? path.join(config.pgBinDir, exe) : exe;
}

/** Connection arguments + environment for pg_dump / pg_restore / psql */
function connection() {
  const db = config.database;
  if (db.connectionString) return { args: ['--dbname', db.connectionString], env: process.env };
  return {
    args: ['--host', db.host, '--port', String(db.port), '--username', db.user, '--dbname', db.database],
    env: { ...process.env, PGPASSWORD: db.password },
  };
}

function run(program, args, env) {
  return new Promise((resolve, reject) => {
    execFile(pgProgram(program), args, { env, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${program} failed: ${(stderr || err.message).trim()}`));
      else resolve(stdout);
    });
  });
}

const pad = (n) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** All backups, newest first: [{ name, size, created }] */
export function listBackups() {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs
    .readdirSync(config.backupDir)
    .filter((f) => prefixOf(f) && f.endsWith('.backup'))
    .map((name) => {
      const stat = fs.statSync(path.join(config.backupDir, name));
      return { name, size: stat.size, created: stat.mtime.toISOString(), time: stat.mtimeMs };
    })
    .sort((a, b) => b.time - a.time || b.name.localeCompare(a.name, 'en', { numeric: true }))
    .map(({ time: _t, ...b }) => b);
}

/** Full path of a backup by its file name, or null (only names from listBackups are accepted) */
export function backupPath(name) {
  return listBackups().some((b) => b.name === name) ? path.join(config.backupDir, name) : null;
}

/** A complete copy of the database, written to `file` (PostgreSQL custom format). */
export async function dumpTo(file) {
  const { args, env } = connection();
  await run('pg_dump', ['--format=custom', '--no-owner', '--file', file, ...args], env);
  return file;
}

/** Make a backup now. Returns { name, size }. */
export async function makeBackup() {
  fs.mkdirSync(config.backupDir, { recursive: true });
  const d = new Date();
  const stamp = `${PREFIX}${today()}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  // never overwrite a backup (two made in the same second get -2, -3 ...)
  let name = `${stamp}.backup`;
  for (let n = 2; fs.existsSync(path.join(config.backupDir, name)); n++) name = `${stamp}-${n}.backup`;
  const file = path.join(config.backupDir, name);
  await dumpTo(file);
  deleteOldBackups();
  return { name, size: fs.statSync(file).size };
}

/** Delete backups older than KEEP_MONTHS months (by the date in their name). The newest one always stays. */
export function deleteOldBackups() {
  const limit = new Date();
  limit.setMonth(limit.getMonth() - KEEP_MONTHS);
  const cutoff = `${limit.getFullYear()}-${pad(limit.getMonth() + 1)}-${pad(limit.getDate())}`;
  for (const b of listBackups().slice(1)) {
    const start = prefixOf(b.name).length;
    const day = b.name.slice(start, start + 10); // YYYY-MM-DD
    if (day < cutoff) fs.unlinkSync(path.join(config.backupDir, b.name));
  }
}

/** Put a backup back (replaces everything in the database). Support tool only. */
export async function restoreBackup(file) {
  const { args, env } = connection();
  await run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--single-transaction', ...args, file], env);
}

/**
 * Load a data file into the database, replacing everything in it (support tool "import").
 * Accepts a plain .sql dump (pg_dump, e.g. from the Mac) or a .backup file (pg_dump custom format).
 * Lines that give tables to another computer's database user ("OWNER TO ...", GRANT, REVOKE) are
 * skipped. It all runs in ONE transaction: if anything fails, the database is left as it was.
 */
export async function importDataFile(file) {
  const { args, env } = connection();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'garmentmfg-import-'));
  try {
    let sqlFile = file;
    const head = Buffer.alloc(5);
    const fd = fs.openSync(file, 'r');
    fs.readSync(fd, head, 0, 5, 0);
    fs.closeSync(fd);
    if (head.toString('latin1') === 'PGDMP') {
      // custom-format backup: turn it into plain SQL first
      sqlFile = path.join(temp, 'backup.sql');
      await run('pg_restore', ['--no-owner', '--no-privileges', '--file', sqlFile, file], env);
    }

    const lines = fs.readFileSync(sqlFile, 'utf8').split('\n');
    const kept = ['DROP SCHEMA IF EXISTS public CASCADE;', 'CREATE SCHEMA public;'];
    let inCopy = false; // table data between "COPY ... FROM stdin;" and "\." is never touched
    for (const line of lines) {
      if (inCopy) {
        if (line === '\\.' || line === '\\.\r') inCopy = false;
      } else if (/^COPY .+ FROM stdin;\r?$/.test(line)) {
        inCopy = true;
      } else if (/^ALTER .+ OWNER TO .+;\r?$/.test(line) || /^(GRANT|REVOKE) /.test(line)) {
        continue;
      }
      kept.push(line);
    }
    const ready = path.join(temp, 'import.sql');
    fs.writeFileSync(ready, kept.join('\n'));
    await run('psql', ['--no-psqlrc', '--quiet', '--set', 'ON_ERROR_STOP=1', '--single-transaction', '--file', ready, ...args], env);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

/** Start the daily backups: one now if today has none, then checked every hour. */
export function startDailyBackups(log = console) {
  const check = async () => {
    if (listBackups().some((b) => b.name.startsWith(PREFIX + today()))) return;
    try {
      const b = await makeBackup();
      log.log(`💾 Daily backup made: ${b.name}`);
    } catch (err) {
      log.error(`❌ Daily backup failed: ${err.message}`);
    }
  };
  check();
  return setInterval(check, 60 * 60 * 1000);
}

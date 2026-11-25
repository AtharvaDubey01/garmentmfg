// Installation of GarmentMFG on the server PC. Run by GarmentMFGSetup.exe (as administrator):
//
//   GarmentMFG.exe --setup             first install, or update of an existing installation
//   GarmentMFG.exe --remove-services   uninstall: stops and removes the two Windows services
//                                 and the firewall rule (the data folder is kept)
//
// Everything lives in ONE folder chosen by the client: the folder where they put GarmentMFGSetup.exe,
// e.g. D:\GarmentMFG\  (program files)  and  D:\GarmentMFG\data\  (database, backups, logs, settings).
//
// First install:
//   1. folders <folder>\data\{db, Backups, logs}, only for SYSTEM and Administrators
//   2. the private database (PostgreSQL in <install>\pgsql): user "garmentmfg" with the default
//      database password, answers only on this PC (localhost), port 5433
//   3. Windows service "GarmentMFGDatabase" (starts with Windows)
//   4. database "garmentmfg" + all set-up files (tables, India + states, ADMIN, KANVTECH)
//   5. KANVTECH password = the default support password (only its hash is inside the program)
//   6. settings file garmentmfg-config.json (database password scrambled, random session secret)
//   7. firewall: other PCs may open port 6060
//   8. Windows service "GarmentMFG" (the app, starts with Windows, restarts if it stops)
// Update (settings file already there): backup first, then restart the services; the app
// applies new database updates itself when it starts.
//
// The default passwords are put in when the app is packed (packaging/build-windows.mjs).
// On the Mac the same steps can be rehearsed with GARMENTMFG_* settings (services/firewall are skipped).
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import pg from 'pg';
import { scramble } from './scramble.js';

const WIN = process.platform === 'win32';
const APP_SERVICE = 'GarmentMFG';
const DB_SERVICE = 'GarmentMFGDatabase';
const FIREWALL_RULE = 'GarmentMFG';

/** Where everything goes (Windows defaults; GARMENTMFG_* settings for a rehearsal on the Mac) */
function places() {
  const installDir = process.env.GARMENTMFG_INSTALL_DIR || path.dirname(process.execPath);
  const dataDir = process.env.GARMENTMFG_DATA_DIR || path.join(installDir, 'data');
  return {
    installDir,
    dataDir,
    pgBin: process.env.GARMENTMFG_PG_BIN || path.join(installDir, 'pgsql', 'bin'),
    dbDir: path.join(dataDir, 'db'),
    backupDir: path.join(dataDir, 'Backups'),
    logDir: path.join(dataDir, 'logs'),
    configFile: path.join(dataDir, 'garmentmfg-config.json'),
    webDir: process.env.GARMENTMFG_WEB_DIR || path.join(installDir, 'web'),
    dbPort: Number(process.env.GARMENTMFG_DB_PORT) || 5433,
    appPort: Number(process.env.GARMENTMFG_APP_PORT) || 6060,
  };
}

/** Default passwords (packed into the program; GARMENTMFG_DEFAULT_* settings for a rehearsal) */
function defaults() {
  const dbPassword = typeof __GARMENTMFG_DB_PASSWORD__ !== 'undefined' ? __GARMENTMFG_DB_PASSWORD__ : process.env.GARMENTMFG_DEFAULT_DB_PASSWORD;
  const supportHash = typeof __GARMENTMFG_SUPPORT_HASH__ !== 'undefined' ? __GARMENTMFG_SUPPORT_HASH__ : process.env.GARMENTMFG_DEFAULT_SUPPORT_HASH;
  if (!dbPassword || !supportHash) throw new Error('The default passwords are missing (they are added when the app is packed).');
  return { dbPassword, supportHash };
}

let logFile = null;
function log(text) {
  const line = `[${new Date().toISOString()}] ${text}`;
  console.log(line);
  try {
    if (logFile) fs.appendFileSync(logFile, line + os.EOL);
  } catch { /* the log file is only a copy of the screen: never stop setup for it */ }
}

/** Run a program; returns its output. `okToFail` = ignore errors (e.g. removing something not there) */
function run(program, args, { okToFail = false } = {}) {
  try {
    return execFileSync(program, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (err) {
    if (okToFail) return '';
    throw new Error(`${path.basename(program)} ${args.join(' ')} failed: ${(err.stderr || err.stdout || err.message).toString().trim()}`);
  }
}

const exe = (p, name) => path.join(p.pgBin, WIN ? `${name}.exe` : name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDatabase(p, password) {
  for (let i = 0; i < 60; i++) {
    const client = new pg.Client({ host: '127.0.0.1', port: p.dbPort, user: 'garmentmfg', password, database: 'postgres' });
    try {
      await client.connect();
      return client;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error(`The database did not start on port ${p.dbPort} within 60 seconds.`);
}

/** Only SYSTEM and Administrators may open the data folder. Set on the folder only: everything
 *  inside inherits it (Windows passes it down by itself). */
function lockFolder(folder) {
  if (!WIN) return;
  run('icacls', [folder, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', '/Q']);
}

/** ...plus NETWORK SERVICE on the database folder: it runs the database service */
function allowDatabaseFolder(folder) {
  if (!WIN) return;
  run('icacls', [folder, '/grant', '*S-1-5-20:(OI)(CI)F', '/Q']);
}

/** A failed earlier attempt (older GarmentMFGSetup.exe) could leave the data folder locked so tight that
 *  even administrators couldn't open it: give it back to Administrators with normal permissions. */
function unlockData(p) {
  if (!WIN || !fs.existsSync(p.dataDir)) return;
  run('icacls', [p.dataDir, '/setowner', '*S-1-5-32-544', '/T', '/C', '/Q'], { okToFail: true });
  run('icacls', [p.dataDir, '/reset', '/T', '/C', '/Q'], { okToFail: true });
}

/** The database service (NETWORK SERVICE) must be able to run pgsql\bin, also when the client's
 *  folder is somewhere private like the Desktop */
function allowDatabaseService(folder) {
  if (!WIN) return;
  run('icacls', [folder, '/grant', '*S-1-5-20:(OI)(CI)RX', '/Q']);
}

// ---------------------------------------------------------------------------------------

export async function runSetup() {
  const p = places();
  if (!fs.existsSync(p.configFile)) unlockData(p); // not installed yet, or an earlier attempt failed
  fs.mkdirSync(p.logDir, { recursive: true });
  logFile = path.join(p.logDir, 'setup.log');
  try {
    if (fs.existsSync(p.configFile)) await update(p);
    else await firstInstall(p);
    log('Setup finished.');
    process.exit(0);
  } catch (err) {
    log(`SETUP FAILED: ${err.message}`);
    process.exit(1);
  }
}

async function firstInstall(p) {
  const { dbPassword, supportHash } = defaults();
  log(`First install. Program: ${p.installDir}  Data: ${p.dataDir}`);
  fs.mkdirSync(p.backupDir, { recursive: true });
  allowDatabaseService(p.installDir);

  // 1. the private database (initdb drops administrator rights while it works, so the data
  //    folder is locked only AFTER the database files are made)
  if (!fs.existsSync(path.join(p.dbDir, 'PG_VERSION'))) {
    fs.rmSync(p.dbDir, { recursive: true, force: true }); // half-made by a failed earlier attempt
    log('Creating the database files...');
    const pwFile = path.join(p.dataDir, `pw-${crypto.randomBytes(6).toString('hex')}.tmp`);
    fs.writeFileSync(pwFile, dbPassword);
    try {
      run(exe(p, 'initdb'), ['-D', p.dbDir, '-U', 'garmentmfg', '-A', 'scram-sha-256', '--pwfile', pwFile, '-E', 'UTF8', '--no-locale']);
    } finally {
      fs.rmSync(pwFile, { force: true });
    }
    fs.appendFileSync(
      path.join(p.dbDir, 'postgresql.conf'),
      `${os.EOL}# GarmentMFG: only this PC may connect, own port${os.EOL}listen_addresses = 'localhost'${os.EOL}port = ${p.dbPort}${os.EOL}`
    );
  }
  lockFolder(p.dataDir);
  allowDatabaseFolder(p.dbDir);

  // 2. start it (Windows: as a service that starts with Windows)
  if (WIN) {
    databaseService(p);
  } else {
    process.env.LC_ALL = process.env.LC_ALL || 'C'; // Mac rehearsal: PostgreSQL on macOS needs a locale to start
    run(exe(p, 'pg_ctl'), ['start', '-D', p.dbDir, '-w', '-l', path.join(p.logDir, 'database.log')]);
  }
  const admin = await waitForDatabase(p, dbPassword);
  const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'garmentmfg';`);
  if (exists.rows.length === 0) await admin.query(`CREATE DATABASE garmentmfg;`);
  await admin.end();
  log('Database ready.');

  // 3. settings file
  const settings = {
    port: p.appPort,
    database: { host: '127.0.0.1', port: p.dbPort, name: 'garmentmfg', user: 'garmentmfg', passwordScrambled: scramble(dbPassword) },
    sessionSecret: crypto.randomBytes(32).toString('hex'),
    backupDir: p.backupDir,
    pgBinDir: p.pgBin,
    webDir: p.webDir,
  };
  fs.writeFileSync(p.configFile, JSON.stringify(settings, null, 2));
  log('Settings file written.');

  // 4. tables, starting data, ADMIN + KANVTECH; KANVTECH gets the default support password
  process.env.GARMENTMFG_CONFIG = p.configFile;
  const { default: pool } = await import('./db.js');
  const { runMigrations } = await import('./migrate.js');
  const applied = await runMigrations(pool);
  log(`Database set up: ${applied.join(', ')}`);
  await pool.query(
    `UPDATE login SET passwordhash = $1 WHERE hidden = 'YES' AND passwordhash IS NULL
       AND empid IN (SELECT id FROM operatormaster WHERE UPPER(TRIM(empcode)) = 'KANVTECH');`,
    [supportHash]
  );
  await pool.end();
  log('Logins ready.');

  if (WIN) {
    firewall(p);
    appService(p);
    makeShortcuts(p);
  }
}

async function update(p) {
  log(`Update of an existing installation. Data: ${p.dataDir}`);
  process.env.GARMENTMFG_CONFIG = p.configFile;
  if (WIN) databaseService(p); // also after an uninstall that kept the folder (services were removed)
  const { makeBackup } = await import('./backup.js');
  try {
    const b = await makeBackup();
    log(`Backup before the update: ${b.name}`);
  } catch (err) {
    log(`Backup before the update failed (${err.message}). Continuing.`);
  }
  if (WIN) {
    firewall(p);
    appService(p);
    makeShortcuts(p);
  }
}

/** Windows service "GarmentMFGDatabase" (registered if it isn't there yet), started */
function databaseService(p) {
  log('Database service...');
  run(exe(p, 'pg_ctl'), ['register', '-N', DB_SERVICE, '-D', p.dbDir, '-S', 'auto', '-U', 'NT AUTHORITY\\NetworkService'], { okToFail: true });
  run('net', ['start', DB_SERVICE], { okToFail: true });
}

/** Desktop shortcuts "Start GarmentMFG" / "Stop GarmentMFG" (each asks for administrator when used) */
function makeShortcuts(p) {
  const cmd = (action, after) =>
    `@echo off\r\n` +
    `net session >nul 2>&1 || (powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" & exit /b)\r\n` +
    `net ${action} GarmentMFG\r\n${after}\r\npause\r\n`;
  const startCmd = path.join(p.installDir, 'Start GarmentMFG.cmd');
  const stopCmd = path.join(p.installDir, 'Stop GarmentMFG.cmd');
  fs.writeFileSync(startCmd, cmd('start', `echo.\r\necho GarmentMFG is running:  http://localhost:${p.appPort}`));
  fs.writeFileSync(stopCmd, cmd('stop', 'echo.\r\necho GarmentMFG is stopped.'));
  const desktop = path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop');
  for (const [name, target] of [['Start GarmentMFG', startCmd], ['Stop GarmentMFG', stopCmd]]) {
    const ps =
      `$w=New-Object -ComObject WScript.Shell;` +
      `$s=$w.CreateShortcut('${path.join(desktop, name + '.lnk')}');` +
      `$s.TargetPath='${target}';$s.IconLocation='${path.join(p.installDir, 'GarmentMFG.exe')},0';$s.WindowStyle=7;$s.Save()`;
    run('powershell', ['-NoProfile', '-Command', ps], { okToFail: true });
  }
  log('Desktop shortcuts made: Start GarmentMFG, Stop GarmentMFG.');
}

function firewall(p) {
  run('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${FIREWALL_RULE}`], { okToFail: true });
  run('netsh', ['advfirewall', 'firewall', 'add', 'rule', `name=${FIREWALL_RULE}`, 'dir=in', 'action=allow', 'protocol=TCP', `localport=${p.appPort}`]);
  log(`Firewall: port ${p.appPort} open for other PCs on the network.`);
}

/** The app as a Windows service (WinSW: GarmentMFGService.exe + GarmentMFGService.xml next to GarmentMFG.exe) */
function appService(p) {
  const wrapper = path.join(p.installDir, 'GarmentMFGService.exe');
  fs.writeFileSync(
    path.join(p.installDir, 'GarmentMFGService.xml'),
    `<service>
  <id>${APP_SERVICE}</id>
  <name>GarmentMFG</name>
  <description>GarmentMFG garment production and payroll (http://localhost:${p.appPort})</description>
  <executable>%BASE%\\GarmentMFG.exe</executable>
  <env name="GARMENTMFG_CONFIG" value="${p.configFile}"/>
  <depend>${DB_SERVICE}</depend>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec"/>
  <logpath>${p.logDir}</logpath>
  <log mode="roll-by-size"><sizeThreshold>5120</sizeThreshold><keepFiles>5</keepFiles></log>
</service>
`
  );
  run(wrapper, ['stop'], { okToFail: true });
  run(wrapper, ['install'], { okToFail: true });
  run(wrapper, ['start']);
  log(`App service started: http://localhost:${p.appPort}`);
}

export async function removeServices() {
  const p = places();
  fs.mkdirSync(p.logDir, { recursive: true });
  logFile = path.join(p.logDir, 'setup.log');
  const wrapper = path.join(p.installDir, 'GarmentMFGService.exe');
  run(wrapper, ['stop'], { okToFail: true });
  run(wrapper, ['uninstall'], { okToFail: true });
  run('net', ['stop', DB_SERVICE], { okToFail: true });
  run(exe(p, 'pg_ctl'), ['unregister', '-N', DB_SERVICE], { okToFail: true });
  run('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${FIREWALL_RULE}`], { okToFail: true });
  run('reg', ['delete', 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\GarmentMFG', '/f'], { okToFail: true });
  if (WIN) {
    const desktop = path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop');
    for (const f of ['GarmentMFG.url', 'Start GarmentMFG.lnk', 'Stop GarmentMFG.lnk']) fs.rmSync(path.join(desktop, f), { force: true });
  }
  log(`Services and firewall rule removed. Data kept in ${p.dataDir}`);
  process.exit(0);
}

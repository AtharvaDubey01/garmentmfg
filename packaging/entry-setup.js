// GarmentMFGSetup.exe — the installer we give to the client (one file, run by double-clicking).
//
// GarmentMFG is installed in the folder where GarmentMFGSetup.exe is: the client makes a folder, e.g.
// D:\GarmentMFG, puts GarmentMFGSetup.exe in it and double-clicks it. Afterwards that folder has:
//   GarmentMFG.exe, GarmentMFGSupport.exe, GarmentMFGService.exe, web\, pgsql\   the program
//   data\     database, backups, logs, settings (locked: administrators only)
//   import\   empty; a place to put a data file to load with "GarmentMFGSupport.exe import"
//
// It is a Node single-executable (like GarmentMFG.exe) that carries the whole app inside it:
//   * payload.7z  — the program files and a private copy of PostgreSQL
//   * 7za.exe     — the official 7-Zip extractor, used to unpack payload.7z on the PC
//
// What it does, in order:
//   1. Asks for administrator rights (one Windows prompt): needed for the Windows services.
//   2. Shows the folder and waits for a key (close the window to cancel).
//   3. Unpacks everything into the folder.
//   4. Runs "GarmentMFG.exe --setup": the database, the two logins (ADMIN + our hidden KANVTECH),
//      the Windows services, the firewall port.
//   5. Desktop shortcut (opens http://localhost:6060) + entry in "Add or remove programs".
// Run again from the same folder = update (the data is kept).
//
// The client never sees any source code or .js file — only these .exe files.
'use strict';
const sea = require('node:sea');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const APP_PORT = 6060;
const UNINSTALL_KEY = 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\GarmentMFG';

function out(text) { process.stdout.write(text + '\r\n'); }

/** "Press any key to continue . . ." (Windows' own, works in every console) */
function pause() {
  spawnSync('cmd', ['/c', 'pause'], { stdio: 'inherit' });
}

function stop(message) {
  out(`\r\n${message}`);
  pause();
  process.exit(1);
}

/** Are we running as administrator? ("net session" only works for admins.) */
function isAdmin() {
  return spawnSync('net', ['session'], { stdio: 'ignore', windowsHide: true }).status === 0;
}

/** Re-launch this same .exe with administrator rights (one Windows prompt), then exit. */
function elevate() {
  out('GarmentMFG Setup needs administrator rights. Please choose "Yes" in the Windows prompt...');
  const exe = process.execPath.replace(/'/g, "''");
  const r = spawnSync('powershell', ['-NoProfile', '-Command', `Start-Process -FilePath '${exe}' -Verb RunAs`], { stdio: 'ignore', windowsHide: true });
  if (r.status !== 0) stop('Setup was not allowed to continue (administrator rights are needed).');
  process.exit(0);
}

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** The folder of an existing installation (from "Add or remove programs"), or '' */
function installedIn(key = UNINSTALL_KEY) {
  const r = spawnSync('reg', ['query', key, '/v', 'InstallLocation'], { encoding: 'utf8', windowsHide: true });
  const m = r.status === 0 && /InstallLocation\s+REG_SZ\s+(.+)$/m.exec(r.stdout);
  return m ? m[1].trim() : '';
}

function writeAsset(name, destFile) {
  fs.writeFileSync(destFile, Buffer.from(sea.getAsset(name)));
  return destFile;
}

function run(program, args) {
  return execFileSync(program, args, { stdio: 'inherit', windowsHide: true });
}

function registerUninstall(folder) {
  const set = (name, value) =>
    spawnSync('reg', ['add', UNINSTALL_KEY, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], { stdio: 'ignore', windowsHide: true });
  set('DisplayName', 'GarmentMFG');
  set('DisplayIcon', path.join(folder, 'GarmentMFG.exe'));
  set('Publisher', 'GarmentMFG'); // replaces an older publisher name on update
  spawnSync('reg', ['delete', UNINSTALL_KEY, '/v', 'Contact', '/f'], { stdio: 'ignore', windowsHide: true }); // none any more
  set('InstallLocation', folder);
  // removes the services and the firewall rule; the folder (with the data) is kept
  set('UninstallString', `"${path.join(folder, 'GarmentMFG.exe')}" --remove-services`);
}

function main() {
  if (process.platform !== 'win32') {
    out('GarmentMFGSetup.exe is for Windows. (On the Mac, use the rehearsal in packaging/.)');
    process.exit(1);
  }
  if (!isAdmin()) return elevate();

  const folder = path.dirname(process.execPath);
  out('========================================');
  out('   GarmentMFG Setup');
  out('========================================\r\n');

  // double-clicked inside a zip / e-mail attachment: Windows runs it from a temporary folder
  if (folder.toLowerCase().startsWith(path.resolve(os.tmpdir()).toLowerCase())) {
    stop('Please first copy GarmentMFGSetup.exe into the folder where GarmentMFG should live\r\n' +
      '(for example D:\\GarmentMFG), then double-click it there.');
  }
  const existing = installedIn();
  if (existing && !same(existing, folder)) {
    stop(`GarmentMFG is already installed in:\r\n  ${existing}\r\n\r\n` +
      'To update it, put the new GarmentMFGSetup.exe in that folder and run it there.\r\n' +
      'To move GarmentMFG, uninstall it first (Settings > Apps > GarmentMFG).');
  }

  // an update only if GarmentMFG was really set up here (not just unpacked by a failed attempt)
  const update = fs.existsSync(path.join(folder, 'data', 'garmentmfg-config.json'));
  out(`GarmentMFG will be ${update ? 'UPDATED' : 'installed'} in this folder:\r\n  ${folder}\r\n`);
  if (!update) out('Everything (program and data) stays in this folder. Do not move or rename it later.\r\n');
  out('To cancel, close this window.');
  pause();

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'garmentmfg-setup-'));
  try {
    if (update) {
      // stop the running copy, so its files can be replaced (the data stays)
      out('Stopping GarmentMFG...');
      spawnSync(path.join(folder, 'GarmentMFGService.exe'), ['stop'], { stdio: 'ignore', windowsHide: true });
      spawnSync('net', ['stop', 'GarmentMFGDatabase'], { stdio: 'ignore', windowsHide: true });
    }

    out('Unpacking GarmentMFG (this can take a minute)...');
    const seven = writeAsset('7za.exe', path.join(temp, '7za.exe'));
    const archive = writeAsset('payload.7z', path.join(temp, 'payload.7z'));
    run(seven, ['x', archive, `-o${folder}`, '-y', '-bso0', '-bsp1']);
    fs.mkdirSync(path.join(folder, 'import'), { recursive: true });

    out('\r\nSetting up the database and the Windows services...');
    run(path.join(folder, 'GarmentMFG.exe'), ['--setup']);

    const shortcut = path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop', 'GarmentMFG.url');
    try { fs.writeFileSync(shortcut, `[InternetShortcut]\r\nURL=http://localhost:${APP_PORT}\r\n`); } catch { /* ignore */ }
    registerUninstall(folder);

    const computer = process.env.COMPUTERNAME || 'this-pc';
    out('\r\n========================================');
    out(`   GarmentMFG is ${update ? 'updated' : 'installed'} and running.`);
    out('========================================');
    out(`\r\n  On this PC:              http://localhost:${APP_PORT}`);
    out(`  From other PCs (LAN):    http://${computer}:${APP_PORT}`);
    out('\r\n  Log in as ADMIN. An "GarmentMFG" shortcut is on the desktop.\r\n');
  } catch (err) {
    // the log is in the locked data folder: show its end here, so it can be photographed and sent
    const logFile = path.join(folder, 'data', 'logs', 'setup.log');
    let tail = '';
    try { tail = fs.readFileSync(logFile, 'utf8').trim().split(/\r?\n/).slice(-12).join('\r\n'); } catch { /* no log yet */ }
    stop(`SETUP FAILED: ${err.message}\r\n\r\nLast lines of ${logFile}:\r\n${tail}\r\n\r\n` +
      'Take a photo of this window and send it to your software support. You can run GarmentMFGSetup.exe again afterwards.');
  } finally {
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  pause();
}

main();

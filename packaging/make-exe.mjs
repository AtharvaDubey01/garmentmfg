// Make your own GarmentMFGSetup.exe — the Windows installer of GarmentMFG.
//
//   Windows:     double-click MAKE-EXE.cmd in the project folder
//   Mac / Linux: npm run make-exe            (in the project folder)
//
// Needs only Node.js (22 or newer) and an internet connection the first time. It:
//   1. makes the default passwords of YOUR installer (random), or uses packaging/build-config.json
//   2. installs the project's packages (npm install)
//   3. downloads the tools the installer is made from, from their official sites, checks each one,
//      and unpacks them into .build/ (Node.js 24.22.1, PostgreSQL 16.15 for Windows, WinSW, 7-Zip, pgweb)
//   4. builds the installer (packaging/build-windows.mjs)
//   5. puts the result in my-exe/: GarmentMFGSetup.exe + MY-PASSWORDS.txt + the Setup Guide
//
// Running it again is quick: what's already downloaded is kept, and the same passwords are used.
// The installer it makes is always a WINDOWS program: it can be made on Windows or a Mac (or Linux),
// but it installs and runs only on Windows 10/11 (64-bit).
// Uses only Node's own modules, so it works before `npm install`.
import { execSync, spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const BUILD = path.join(REPO, '.build'); // downloads + unpacked tools + build scratch (git-ignored)
const DOWN = path.join(BUILD, 'downloads');
const STAGE = path.join(BUILD, 'stage');
const OUT_DIR = path.join(REPO, 'my-exe'); // what the user gets (git-ignored)
const CONFIG = path.join(HERE, 'build-config.json'); // the passwords (git-ignored)
const WIN = process.platform === 'win32';
const NODE_V = 'v24.22.1';

// This computer -> which Node.js runs the build steps (same version as the node.exe inside the installer)
const HOST = { 'win32-x64': 'win-x64', 'darwin-arm64': 'darwin-arm64', 'darwin-x64': 'darwin-x64', 'linux-x64': 'linux-x64' }[`${process.platform}-${process.arch}`];

// Every download: official address + its SHA-256 (the file is refused if it doesn't match)
const NODE_DIST = `https://nodejs.org/dist/${NODE_V}`;
const TOOL = {
  'node-win-x64': { label: 'Node.js 24.22.1 for Windows', file: `node-${NODE_V}-win-x64.zip`, url: `${NODE_DIST}/node-${NODE_V}-win-x64.zip`, sha256: 'd2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5' },
  'node-darwin-arm64': { label: 'Node.js 24.22.1 for this Mac', file: `node-${NODE_V}-darwin-arm64.tar.gz`, url: `${NODE_DIST}/node-${NODE_V}-darwin-arm64.tar.gz`, sha256: '89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7' },
  'node-darwin-x64': { label: 'Node.js 24.22.1 for this Mac', file: `node-${NODE_V}-darwin-x64.tar.gz`, url: `${NODE_DIST}/node-${NODE_V}-darwin-x64.tar.gz`, sha256: 'd132557e7ee2b85af08b0c8c34338e65c6430f2238d01f727728ef42dc83b035' },
  'node-linux-x64': { label: 'Node.js 24.22.1 for Linux', file: `node-${NODE_V}-linux-x64.tar.xz`, url: `${NODE_DIST}/node-${NODE_V}-linux-x64.tar.xz`, sha256: '6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6' },
  postgres: { label: 'PostgreSQL 16.15 for Windows', file: 'postgresql-16.15-1-windows-x64-binaries.zip', url: 'https://get.enterprisedb.com/postgresql/postgresql-16.15-1-windows-x64-binaries.zip', sha256: '25e6fcdfb8caec38691bf461125e7564508760666f7b8e5dc6a5f0818f58f81e' },
  winsw: { label: 'WinSW 2.12.0 (Windows service wrapper)', file: 'WinSW-x64.exe', url: 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe', sha256: '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da' },
  pgweb: { label: 'pgweb 0.16.2 (database viewer)', file: 'pgweb_windows_amd64.zip', url: 'https://github.com/sosedoff/pgweb/releases/download/v0.16.2/pgweb_windows_amd64.zip', sha256: '620f21b347f2cfea6cd2b656225880b4b2b5f0aee0fc17267841d18bc1cf872c' },
  sevenExtra: { label: '7-Zip 25.01 Extra (goes inside the installer)', file: '7z2501-extra.7z', url: 'https://www.7-zip.org/a/7z2501-extra.7z', sha256: 'cd3cf38085c2cc6839cf72716dafb3175ae425f4fd34faafc6c0b64d618d307f' },
  sevenWin: { label: '7-Zip 25.01 (7zr.exe) for Windows', file: '7zr.exe', url: 'https://www.7-zip.org/a/7zr.exe', sha256: '256feca8e274e5da655e2a284fabafd9f554365eb164862089dacd4e8276d282' },
  sevenMac: { label: '7-Zip 25.01 for Mac', file: '7z2501-mac.tar.xz', url: 'https://www.7-zip.org/a/7z2501-mac.tar.xz', sha256: '26aa75bc262bb10bf0805617b95569c3035c2c590a99f7db55c7e9607b2685e0' },
  sevenLinux: { label: '7-Zip 25.01 for Linux', file: '7z2501-linux-x64.tar.xz', url: 'https://www.7-zip.org/a/7z2501-linux-x64.tar.xz', sha256: '4ca3b7c6f2f67866b92622818b58233dc70367be2f36b498eb0bdeaaa44b53f4' },
};

// PostgreSQL: the installer carries only what the app needs (all of lib + share, and in bin every .dll + these programs)
const PG_PROGRAMS = ['initdb.exe', 'pg_ctl.exe', 'pg_dump.exe', 'pg_restore.exe', 'postgres.exe', 'psql.exe'];

// ------------------------------------------------------------------ small helpers
const say = (msg = '') => console.log(msg);
const stepTitle = (n, msg) => say(`\n[${n}/5] ${msg}`);
class Stop extends Error {}
const fail = (msg) => { throw new Stop(msg); };

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`"${path.basename(cmd)} ${args.slice(0, 2).join(' ')}" stopped with an error (code ${r.status}).`);
}
const runQuiet = (cmd, args, opts = {}) => run(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'], ...opts });

function sha256Of(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return h.digest('hex');
}

/** Download one tool into .build/downloads (skipped if it's already there and checks out). */
async function fetchTool(key) {
  const t = TOOL[key];
  const dest = path.join(DOWN, t.file);
  if (fs.existsSync(dest) && sha256Of(dest) === t.sha256) {
    say(`   ✓ ${t.label} (already downloaded)`);
    return dest;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      process.stdout.write(`   ↓ ${t.label} ...`);
      const res = await fetch(t.url, { redirect: 'follow', headers: { 'User-Agent': 'garmentmfg-make-exe' } });
      if (!res.ok) throw new Error(`the site answered ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      let got = 0;
      let shown = 0;
      const tmp = `${dest}.part`;
      await pipeline(
        Readable.fromWeb(res.body),
        async function* progress(source) {
          for await (const chunk of source) {
            got += chunk.length;
            const pct = total ? Math.floor((got / total) * 10) : 0;
            if (pct > shown) { shown = pct; process.stdout.write('.'); }
            yield chunk;
          }
        },
        fs.createWriteStream(tmp)
      );
      if (sha256Of(tmp) !== t.sha256) {
        fs.rmSync(tmp, { force: true });
        throw new Error('the downloaded file is not the expected one (checksum mismatch)');
      }
      fs.renameSync(tmp, dest);
      say(` ${Math.round(got / 1048576)} MB ✓`);
      return dest;
    } catch (err) {
      say(` failed: ${err.message}`);
      if (attempt === 3) fail(`Could not download ${t.label} from ${t.url}\n  (${err.message}). Check the internet connection and run it again.`);
      say('     trying again...');
    }
  }
}

// ------------------------------------------------------------------ the five steps
function checkComputer() {
  if (!HOST) fail(`This computer (${process.platform} ${process.arch}) can't make the installer. Use Windows 10/11 (64-bit), a Mac, or 64-bit Linux.`);
  const [major, minor] = process.versions.node.split('.').map(Number);
  const ok = (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major >= 23; // what the screens' build tool (Vite) needs
  if (!ok) {
    fail(`Node.js ${process.versions.node} is too old. Install the LTS version from https://nodejs.org and run it again.`);
  }
}

function makePasswords() {
  stepTitle(1, 'Passwords of your installer');
  if (fs.existsSync(CONFIG)) {
    const c = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    if (!c.dbPassword || !c.supportPassword) fail(`${CONFIG} needs both "dbPassword" and "supportPassword".`);
    if (String(c.supportPassword).length < 10 || String(c.dbPassword).length < 8) fail('In packaging/build-config.json the support password needs at least 10 characters, the database password at least 8.');
    say('   ✓ using the passwords in packaging/build-config.json');
    return c;
  }
  // no look-alike characters (I l 1 O 0 o), so they are easy to read and type
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const group = () => Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join('');
  const c = { supportPassword: `Gmfg-${group()}-${group()}-${group()}`, dbPassword: `GmfgDb-${group()}-${group()}` };
  fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2) + '\n', { mode: 0o600 });
  say('   ✓ made new random passwords (kept in packaging/build-config.json, so the next build uses the same ones)');
  return c;
}

function installPackages() {
  stepTitle(2, 'Installing the project\'s packages (npm install) — the first time takes a few minutes');
  for (const dir of ['', 'server', 'client', 'packaging']) {
    say(`   npm install ${dir ? `in ${dir}/` : '(project)'}`);
    // a command string with shell: npm is npm.cmd on Windows
    execSync('npm install --no-audit --no-fund --loglevel=error', { cwd: path.join(REPO, dir), stdio: 'inherit' });
  }
}

async function getTools() {
  stepTitle(3, 'Getting the tools the installer is made from (first time: about 450 MB)');
  fs.mkdirSync(DOWN, { recursive: true });
  fs.mkdirSync(STAGE, { recursive: true });

  // 7-Zip for this computer: unpacks everything below, and packs the installer's payload later
  let seven;
  if (WIN) {
    const sevenr = await fetchTool('sevenWin'); // 7zr.exe: only knows .7z, used to unpack 7-Zip Extra
    const extra = await fetchTool('sevenExtra');
    if (!fs.existsSync(path.join(DOWN, '7zextra', 'x64', '7za.exe'))) runQuiet(sevenr, ['x', extra, `-o${path.join(DOWN, '7zextra')}`, '-y']);
    seven = path.join(DOWN, '7zextra', 'x64', '7za.exe'); // full 7-Zip for Windows (zip and 7z)
  } else {
    const pkg = await fetchTool(process.platform === 'darwin' ? 'sevenMac' : 'sevenLinux');
    seven = path.join(STAGE, '7zip', '7zz');
    if (!fs.existsSync(seven)) {
      fs.mkdirSync(path.dirname(seven), { recursive: true });
      runQuiet('tar', ['-xf', pkg, '-C', path.dirname(seven)]);
      fs.chmodSync(seven, 0o755);
    }
    const extra = await fetchTool('sevenExtra');
    if (!fs.existsSync(path.join(DOWN, '7zextra', 'x64', '7za.exe'))) runQuiet(seven, ['x', extra, `-o${path.join(DOWN, '7zextra')}`, '-y']);
  }

  // Node.js for Windows (inside the installer) and for this computer (makes the packed files)
  const nodeWin = await fetchTool('node-win-x64');
  if (!fs.existsSync(path.join(STAGE, `node-${NODE_V}-win-x64`, 'node.exe'))) runQuiet(seven, ['x', nodeWin, `-o${STAGE}`, '-y']);
  if (!WIN) {
    const nodeHere = await fetchTool(`node-${HOST}`);
    if (!fs.existsSync(path.join(STAGE, `node-${NODE_V}-${HOST}`, 'bin', 'node'))) runQuiet('tar', ['-xf', nodeHere, '-C', STAGE]);
  }

  // PostgreSQL for Windows: only bin / lib / share are unpacked (skips pgAdmin and its very long paths)
  const pg = await fetchTool('postgres');
  const pgsql = path.join(STAGE, 'pgsql');
  if (!fs.existsSync(path.join(pgsql, 'bin', 'postgres.exe'))) {
    say('   unpacking PostgreSQL (only the parts the app needs) ...');
    const tmp = path.join(STAGE, '_pg');
    fs.rmSync(tmp, { recursive: true, force: true });
    const sep = WIN ? '\\' : '/';
    runQuiet(seven, ['x', pg, `-o${tmp}`, '-y', ...['bin', 'lib', 'share'].map((d) => ['pgsql', d, '*'].join(sep))]);
    fs.rmSync(pgsql, { recursive: true, force: true });
    fs.mkdirSync(path.join(pgsql, 'bin'), { recursive: true });
    for (const f of fs.readdirSync(path.join(tmp, 'pgsql', 'bin'))) {
      if (f.toLowerCase().endsWith('.dll') || PG_PROGRAMS.includes(f.toLowerCase())) {
        fs.copyFileSync(path.join(tmp, 'pgsql', 'bin', f), path.join(pgsql, 'bin', f));
      }
    }
    fs.renameSync(path.join(tmp, 'pgsql', 'lib'), path.join(pgsql, 'lib'));
    fs.renameSync(path.join(tmp, 'pgsql', 'share'), path.join(pgsql, 'share'));
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const p of PG_PROGRAMS) if (!fs.existsSync(path.join(pgsql, 'bin', p))) fail(`PostgreSQL unpacking went wrong: ${p} is missing. Delete the .build folder and run it again.`);
  }

  await fetchTool('winsw');
  const pgweb = await fetchTool('pgweb');
  if (!fs.existsSync(path.join(DOWN, 'pgweb', 'pgweb_windows_amd64'))) runQuiet(seven, ['x', pgweb, `-o${path.join(DOWN, 'pgweb')}`, '-y']);
  say('   ✓ all tools ready');
}

function buildInstaller() {
  stepTitle(4, 'Building the installer — takes a few minutes');
  run(process.execPath, [path.join(HERE, 'build-windows.mjs')], { cwd: HERE, env: { ...process.env, GARMENTMFG_BUILD_DIR: BUILD } });
}

function deliver(pw) {
  stepTitle(5, 'Putting it together in my-exe/');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const exe = path.join(OUT_DIR, 'GarmentMFGSetup.exe');
  fs.copyFileSync(path.join(BUILD, 'GarmentMFGSetup.exe'), exe);
  const guide = path.join(REPO, 'docs', 'GarmentMFG-Setup-Guide.pdf');
  if (fs.existsSync(guide)) fs.copyFileSync(guide, path.join(OUT_DIR, 'GarmentMFG Setup Guide.pdf'));
  const sha = sha256Of(exe);
  const nl = WIN ? '\r\n' : '\n';
  const lines = [
    'GarmentMFG - passwords of YOUR installer',
    `Made ${new Date().toISOString().slice(0, 16).replace('T', ' ')} - GarmentMFGSetup.exe SHA-256: ${sha}`,
    '',
    'Keep this file private. Every installation made with this GarmentMFGSetup.exe starts with these:',
    '',
    `  ADMIN     (Employee Code ADMIN, the company's admin login) . Admin`,
    `  KANVTECH  (hidden support login = support code of GarmentMFGSupport.exe) . ${pw.supportPassword}`,
    `  Database  (user garmentmfg, the private database) ................ ${pw.dbPassword}`,
    '',
    'These are YOUR passwords. (The Setup Guide, section 9, lists the passwords of the public download, not these.)',
    'After installing: change ADMIN in the app (Admin > Create Login). The other two can be changed on the',
    'server PC with GarmentMFGSupport.exe set-support-password / change-db-password (Setup Guide section 9).',
    'Making the exe again (make-exe) uses the same passwords; to choose your own, edit packaging/build-config.json.',
    '',
    'The installer is a Windows program: it installs and runs on Windows 10/11 (64-bit) only.',
  ];
  fs.writeFileSync(path.join(OUT_DIR, 'MY-PASSWORDS.txt'), lines.join(nl) + nl, { mode: 0o600 });
  const mb = Math.round(fs.statSync(exe).size / 1048576);
  say(`
==================================================================
 Done! Your installer is ready in:
   ${OUT_DIR}

   GarmentMFGSetup.exe         ${mb} MB - the Windows installer
   MY-PASSWORDS.txt            your passwords - keep it private
   GarmentMFG Setup Guide.pdf  how to install and use it

 SHA-256 of GarmentMFGSetup.exe: ${sha}

 Next: copy GarmentMFGSetup.exe to the Windows PC that will be the
 server and follow the Setup Guide. It runs on Windows 10/11 only.
==================================================================`);
}

async function main() {
  say('GarmentMFG — make your own installer (GarmentMFGSetup.exe)');
  checkComputer();
  const pw = makePasswords();
  installPackages();
  await getTools();
  buildInstaller();
  deliver(pw);
}

main().catch((err) => {
  console.error(`\n✖ ${err instanceof Stop ? err.message : `Something went wrong: ${err.message}`}`);
  if (!(err instanceof Stop)) console.error('  Run it again: finished parts are kept. If it keeps failing, see "Make your own exe" in README.md.');
  process.exit(1);
});

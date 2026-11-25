// Builds GarmentMFGSetup.exe — the Windows installer we give to the client.
//
// WHY it is built this way (the client must NOT get the source or be able to tweak the app):
//   1. The whole server is bundled into ONE JavaScript file (esbuild), then scrambled hard
//      (javascript-obfuscator), so it is not readable or editable.
//   2. That file is baked INSIDE a copy of node.exe (Node "Single Executable Application"),
//      giving GarmentMFG.exe and GarmentMFGSupport.exe — real .exe files, no ".js" on the PC.
//   3. The database password and our KANVTECH support password are baked in at this step,
//      not left in any file on the client's PC.
//   4. A private PostgreSQL (its own copy, own port, localhost only) and the app's Windows
//      services are set up by GarmentMFG.exe --setup, which GarmentMFGSetup.exe runs as administrator.
//   5. GarmentMFGSetup.exe is itself a Node .exe that carries the whole app (payload.7z) and the
//      7-Zip extractor inside it, so there is just ONE file to hand to the client.
//
// It runs on Windows, a Mac or Linux. The easy way is `npm run make-exe` in the project folder
// (or double-click MAKE-EXE.cmd on Windows): it installs the packages, downloads the tools below
// into .build/ (Node 24.22.1, PostgreSQL 16.15 for Windows, WinSW, 7-Zip, pgweb), makes the
// passwords and then runs this file. The result is always a WINDOWS installer.
// Output: .build/GarmentMFGSetup.exe  (make-exe copies it to my-exe/)
//
// The default passwords come from packaging/build-config.json (git-ignored), or from
//   GARMENTMFG_DEFAULT_DB_PASSWORD=... GARMENTMFG_DEFAULT_SUPPORT_PASSWORD=...
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import * as esbuild from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import * as ResEdit from 'resedit';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const BUILD = process.env.GARMENTMFG_BUILD_DIR ? path.resolve(process.env.GARMENTMFG_BUILD_DIR) : path.join(REPO, '.build'); // git-ignored
const DOWN = path.join(BUILD, 'downloads');
const STAGE = path.join(BUILD, 'stage'); // unpacked Node, PostgreSQL and 7-Zip (made by make-exe)
const OUT = path.join(BUILD, 'GarmentMFGSetup.exe');
const WORK = path.join(BUILD, 'work'); // scratch for this build
const PAYLOAD = path.join(BUILD, 'payload'); // what the installer will carry

const NODE_VERSION = 'v24.22.1';
const WIN = process.platform === 'win32';
const WIN_NODE = path.join(STAGE, `node-${NODE_VERSION}-win-x64`, 'node.exe');
// The blob is made by the SAME Node version as the Windows node.exe, running on this computer
const HOST = { 'darwin-arm64': 'darwin-arm64', 'darwin-x64': 'darwin-x64', 'linux-x64': 'linux-x64' }[`${process.platform}-${process.arch}`];
const HOST_NODE = WIN ? WIN_NODE : HOST ? path.join(STAGE, `node-${NODE_VERSION}-${HOST}`, 'bin', 'node') : '';
const PGSQL = path.join(STAGE, 'pgsql');
const WINSW = path.join(DOWN, 'WinSW-x64.exe');
const SEVEN_ZA = path.join(DOWN, '7zextra', 'x64', '7za.exe'); // official 7-Zip extractor (goes inside GarmentMFGSetup.exe)
// 7-Zip that runs on THIS computer, to pack the payload: 7za.exe on Windows, 7zz on Mac / Linux
const SEVEN_HERE = WIN ? SEVEN_ZA : path.join(STAGE, '7zip', '7zz');
const PGWEB = path.join(DOWN, 'pgweb', 'pgweb_windows_amd64'); // database viewer, started by GarmentMFGSupport.exe view-db
const SEA_FUSE = 'fce680ab2cc467b6e072b8b5df1996b2'; // Node's fixed SEA fuse string

// Default passwords baked into this build. They are NOT in the repo (they are secrets): they come
// from environment variables, or from packaging/build-config.json (git-ignored). Copy
// packaging/build-config.example.json to packaging/build-config.json and put the passwords there.
function buildConfig() {
  const file = path.join(HERE, 'build-config.json');
  const fromFile = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const dbPassword = process.env.GARMENTMFG_DEFAULT_DB_PASSWORD || fromFile.dbPassword;
  const supportPassword = process.env.GARMENTMFG_DEFAULT_SUPPORT_PASSWORD || fromFile.supportPassword;
  if (!dbPassword || !supportPassword) {
    throw new Error(
      'Build passwords are missing. Copy packaging/build-config.example.json to packaging/build-config.json\n' +
      'and set "dbPassword" and "supportPassword" (or pass GARMENTMFG_DEFAULT_DB_PASSWORD / GARMENTMFG_DEFAULT_SUPPORT_PASSWORD).'
    );
  }
  return { dbPassword, supportPassword };
}
const { dbPassword: DEFAULT_DB_PASSWORD, supportPassword: DEFAULT_SUPPORT_PASSWORD } = buildConfig();

function step(msg) { console.log(`\n==> ${msg}`); }
function sh(program, args, opts = {}) {
  return execFileSync(program, args, { stdio: 'inherit', ...opts });
}

function checkInputs() {
  if (!HOST_NODE) throw new Error(`This computer (${process.platform} ${process.arch}) can't build the installer. Use Windows (64-bit), a Mac or 64-bit Linux.`);
  const need = [
    [HOST_NODE, `Node ${NODE_VERSION} for this computer`],
    [WIN_NODE, `Windows node.exe ${NODE_VERSION}`],
    [path.join(PGSQL, 'bin', 'postgres.exe'), 'PostgreSQL (stripped) in stage/pgsql'],
    [WINSW, 'WinSW-x64.exe'],
    [SEVEN_ZA, '7za.exe (from 7-Zip Extra, x64)'],
    [PGWEB, 'pgweb_windows_amd64 (database viewer)'],
    [SEVEN_HERE, '7-Zip for this computer'],
  ];
  const missing = need.filter(([f]) => !fs.existsSync(f));
  if (missing.length) {
    throw new Error(
      'Missing build inputs:\n' + missing.map(([f, name]) => `  - ${name}: ${f}`).join('\n') +
      '\nRun `npm run make-exe` in the project folder: it downloads them into ' + BUILD + '.'
    );
  }
}

/** scrypt hash of the default support password, exactly like server/src/passwords.js */
async function supportHash(password) {
  const { scryptSync, randomBytes } = await import('crypto');
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

/** Read every server/db/NNN_*.sql into { name: sql } so they can be baked into the exe */
function dbFiles() {
  const dir = path.join(REPO, 'server', 'db');
  const files = {};
  for (const f of fs.readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f))) {
    files[f] = fs.readFileSync(path.join(dir, f), 'utf8');
  }
  return files;
}

/** Bundle one entry to a single CommonJS file, then (for the app) obfuscate it. */
async function bundleAndObfuscate(entry, outFile, defines, { obfuscate = true } = {}) {
  const bundled = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    write: false,
    legalComments: 'none',
    minify: true,
    // pg loads these only if present; let it fail gracefully at runtime instead of bundling them
    external: ['pg-native', 'cloudflare:sockets'],
    define: defines,
    logLevel: 'warning',
  });
  const code = bundled.outputFiles[0].text;
  if (!obfuscate) {
    // the installer carries no app logic or secrets, so bundling is enough (and keeps node:sea asset names intact)
    fs.writeFileSync(outFile, code);
    return;
  }
  step(`Obfuscating ${path.basename(outFile)} (${Math.round(code.length / 1024)} KB bundle)`);
  const obf = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    identifierNamesGenerator: 'mangled',
    selfDefending: true,
    target: 'node',
  });
  fs.writeFileSync(outFile, obf.getObfuscatedCode());
}

/** Turn a bundle into a Windows .exe (Node SEA). `assets` get embedded and read with node:sea. */
// What Windows shows in each .exe's Properties > Details (instead of "Node.js")
const EXE_DESCRIPTION = { GarmentMFG: 'GarmentMFG', GarmentMFGSupport: 'GarmentMFG Support', GarmentMFGSetup: 'GarmentMFG Setup' };

/** Put the product's name into the .exe's details (done before the app is baked in) */
function setExeDetails(exe) {
  const name = path.basename(exe, '.exe');
  const pe = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(pe);
  const [info] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  for (const lang of info.getAllLanguagesForStringValues()) {
    info.setStringValues(lang, {
      CompanyName: 'GarmentMFG',
      ProductName: 'GarmentMFG',
      FileDescription: EXE_DESCRIPTION[name] || name,
      OriginalFilename: `${name}.exe`,
      InternalName: name,
      LegalCopyright: `© ${new Date().getFullYear()} GarmentMFG`,
    });
    info.setFileVersion(1, 0, 0, 0, lang.lang);
    info.setProductVersion(1, 0, 0, 0, lang.lang);
  }
  info.outputToResourceEntries(res.entries);
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
}

function makeExe(bundleFile, exe, assets = null) {
  const name = path.basename(exe, '.exe');
  const blob = path.join(WORK, `${name}.blob`);
  const seaConfig = path.join(WORK, `${name}-sea.json`);
  // cross-building Mac -> Windows: no snapshot, no code cache (those are per-arch)
  const cfg = {
    main: bundleFile,
    output: blob,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
  };
  if (assets) cfg.assets = assets;
  fs.writeFileSync(seaConfig, JSON.stringify(cfg, null, 2));
  step(`Building the blob for ${path.basename(exe)} (Node ${NODE_VERSION})`);
  sh(HOST_NODE, ['--experimental-sea-config', seaConfig]);

  fs.copyFileSync(WIN_NODE, exe);
  setExeDetails(exe);
  step(`Baking the blob into ${path.basename(exe)}`);
  // postject's own script, run with the Node running this build (works the same on every OS)
  const postject = path.join(HERE, 'node_modules', 'postject', 'dist', 'cli.js');
  sh(process.execPath, [postject, exe, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', `NODE_SEA_FUSE_${SEA_FUSE}`]);
}

function stagePayload() {
  step('Staging the files the installer will carry');
  fs.rmSync(PAYLOAD, { recursive: true, force: true });
  fs.mkdirSync(PAYLOAD, { recursive: true });
  // the web app (built client)
  const dist = path.join(REPO, 'client', 'dist');
  fs.cpSync(dist, path.join(PAYLOAD, 'web'), { recursive: true });
  // the private PostgreSQL
  fs.cpSync(PGSQL, path.join(PAYLOAD, 'pgsql'), { recursive: true });
  // the service wrapper for the app
  fs.copyFileSync(WINSW, path.join(PAYLOAD, 'GarmentMFGService.exe'));
  // the database viewer (GarmentMFGSupport.exe view-db)
  fs.copyFileSync(PGWEB, path.join(PAYLOAD, 'pgweb.exe'));
}

/** Pack the staged payload folder into one payload.7z (good compression). */
function makePayloadArchive() {
  const archive = path.join(WORK, 'payload.7z');
  fs.rmSync(archive, { force: true });
  step('Packing the payload into payload.7z');
  // -mx=7: strong compression; "." = everything in PAYLOAD (so it extracts straight into the install folder)
  sh(SEVEN_HERE, ['a', '-t7z', '-mx=7', '-r', archive, '.'], { cwd: PAYLOAD });
  return archive;
}

async function main() {
  step('Checking build inputs');
  checkInputs();
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });

  step('Building the web client (npm run build in client/)');
  execSync('npm run build', { cwd: path.join(REPO, 'client'), stdio: 'inherit' }); // a command string: npm is npm.cmd on Windows

  const hash = await supportHash(DEFAULT_SUPPORT_PASSWORD);
  const defines = {
    __GARMENTMFG_PACKAGED__: 'true',
    __GARMENTMFG_DB_FILES__: JSON.stringify(dbFiles()),
    __GARMENTMFG_DB_PASSWORD__: JSON.stringify(DEFAULT_DB_PASSWORD),
    __GARMENTMFG_SUPPORT_HASH__: JSON.stringify(hash),
  };

  step('Bundling + obfuscating the app and the support tool');
  await bundleAndObfuscate(path.join(HERE, 'entry-garmentmfg.js'), path.join(WORK, 'garmentmfg.bundle.js'), defines);
  await bundleAndObfuscate(path.join(HERE, 'entry-support.js'), path.join(WORK, 'support.bundle.js'), defines);

  stagePayload();
  makeExe(path.join(WORK, 'garmentmfg.bundle.js'), path.join(PAYLOAD, 'GarmentMFG.exe'));
  makeExe(path.join(WORK, 'support.bundle.js'), path.join(PAYLOAD, 'GarmentMFGSupport.exe'));

  // the installer: a Node .exe that carries the whole payload + the 7-Zip extractor inside it
  const archive = makePayloadArchive();
  step('Bundling the installer (GarmentMFGSetup.exe)');
  await bundleAndObfuscate(path.join(HERE, 'entry-setup.js'), path.join(WORK, 'setup.bundle.js'), {}, { obfuscate: false });
  makeExe(path.join(WORK, 'setup.bundle.js'), OUT, {
    'payload.7z': archive,
    '7za.exe': SEVEN_ZA,
  });

  const size = Math.round(fs.statSync(OUT).size / (1024 * 1024));
  fs.writeFileSync(path.join(BUILD, 'build-passwords.txt'),
    `GarmentMFG build ${new Date().toISOString()}\n` +
    `Database password (user "garmentmfg"): ${DEFAULT_DB_PASSWORD}\n` +
    `KANVTECH support password:        ${DEFAULT_SUPPORT_PASSWORD}\n` +
    `\nKeep this private. Do NOT ship this file.\n`);
  console.log(`\n✅ Done: ${OUT}  (${size} MB)`);
  console.log(`   Default passwords written to ${path.join(BUILD, 'build-passwords.txt')}`);
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });

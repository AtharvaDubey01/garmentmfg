// GarmentMFG.exe: the app (no arguments), or the installer's helper (--setup, --remove-services).
if (process.argv.includes('--setup')) {
  import('../server/src/setup.js').then((m) => m.runSetup());
} else if (process.argv.includes('--remove-services')) {
  import('../server/src/setup.js').then((m) => m.removeServices());
} else {
  import('../server/src/index.js');
}

// GarmentMFGSupport.exe: the locked support tool (see SUPPORT_GUIDE.md).
// It reads the settings in the locked "data" folder, so it must run as administrator.
import('../server/tools/garmentmfg-support.js').catch((err) => {
  if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
    const folder = process.execPath.replace(/\\[^\\]*$/, ''); // the GarmentMFG folder
    process.stderr.write(
      '\r\nGarmentMFG Support must be run as administrator.\r\n' +
        'Right-click the Start button -> Terminal (Admin), then:\r\n' +
        '  cd "' + folder + '"\r\n' +
        '  .\\GarmentMFGSupport.exe <command>\r\n'
    );
  } else {
    process.stderr.write('\r\n' + (err && err.message ? err.message : String(err)) + '\r\n');
  }
  process.exit(1);
});

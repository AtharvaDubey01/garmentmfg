import app from './app.js';
import config from './config.js';
import pool from './db.js';
import { runMigrations } from './migrate.js';
import { startDailyBackups } from './backup.js';

const PORT = config.port;

async function start() {
  // Set up / update the database before taking any requests (see migrate.js)
  try {
    const applied = await runMigrations(pool);
    if (applied.length) console.log(`🗄️  Database updated: ${applied.join(', ')}`);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  startDailyBackups();

  app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 GarmentMFG Backend Server running on port ${PORT}`);
  console.log(`📡 Local API URL:  http://localhost:${PORT}/api/health`);
  console.log(`🗄️  Database:      ${config.installed ? `${config.database.host}:${config.database.port}/${config.database.database}` : config.database.connectionString}`);
  console.log(`====================================================`);
  });
}

start();

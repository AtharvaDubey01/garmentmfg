// Sets up and updates the database automatically when the server starts.
//
// The files in server/db/ (001_..., 002_..., in number order) are applied once each, and
// remembered in the table schema_migrations. A new version of the app only has to add a
// new numbered file; every installation then applies it on its next start.
//
//   Empty database (new installation): every file is applied, starting with 001_schema.sql.
//   Database made before this existed:  001-005 were already applied by hand, so they are only
//                                       marked as done (001 would wipe the tables!) and the
//                                       newer files are applied.
// Each file runs in its own transaction: if one fails, nothing of it stays and the server stops.
// Inside GarmentMFG.exe the files are packed into the program (__GARMENTMFG_DB_FILES__), not on disk.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// import.meta.url is empty once this file is bundled into the packed app (CommonJS); there the
// SQL files are embedded (__GARMENTMFG_DB_FILES__) and this on-disk path is never used.
const __dirname = import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : '';
export const DB_FILES_DIR = __dirname ? path.resolve(__dirname, '../db') : '';
const APPLIED_BY_HAND = 5; // files 001-005 existed before this runner

/** { '001_schema.sql': '<sql>', ... } */
function dbFiles() {
  if (typeof __GARMENTMFG_DB_FILES__ !== 'undefined') return __GARMENTMFG_DB_FILES__;
  const files = {};
  for (const f of fs.readdirSync(DB_FILES_DIR).filter((f) => /^\d{3}_.+\.sql$/.test(f))) {
    files[f] = fs.readFileSync(path.join(DB_FILES_DIR, f), 'utf8');
  }
  return files;
}

export async function runMigrations(pool) {
  const sqlOf = dbFiles();
  const files = Object.keys(sqlOf).sort();

  const client = await pool.connect();
  try {
    const exists = (await client.query(`SELECT to_regclass('public.schema_migrations') AS t;`)).rows[0].t;
    if (!exists) {
      const hasApp = (await client.query(`SELECT to_regclass('public.login') AS t;`)).rows[0].t;
      await client.query(
        `CREATE TABLE schema_migrations (name varchar(200) PRIMARY KEY, applied_on timestamp NOT NULL DEFAULT NOW());`
      );
      if (hasApp) {
        for (const f of files.filter((f) => Number(f.slice(0, 3)) <= APPLIED_BY_HAND)) {
          await client.query(`INSERT INTO schema_migrations (name) VALUES ($1);`, [f]);
        }
      }
    }

    const done = new Set((await client.query(`SELECT name FROM schema_migrations;`)).rows.map((r) => r.name));
    const applied = [];
    for (const f of files.filter((f) => !done.has(f))) {
      const sql = sqlOf[f];
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations (name) VALUES ($1);`, [f]);
        await client.query('COMMIT');
        applied.push(f);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Database update ${f} failed: ${err.message}`);
      }
    }
    return applied;
  } finally {
    client.release();
  }
}

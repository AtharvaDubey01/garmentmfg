import pg from 'pg';
import config from './config.js';

const { Pool } = pg;

// Set up the PostgreSQL Connection Pool
// A connection pool manages multiple reusable database connections.
// Connection settings come from config.js (settings file when installed, .env when developing)
const pool = new Pool(config.database);

// Event listener: log when a new client connects to the database pool
pool.on('connect', () => {
  // Connection acquired successfully
});

// Event listener: handle idle client errors to prevent server crash
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

/**
 * Execute a parameterised SQL query.
 * Always use parameterised queries ($1, $2, etc.) to prevent SQL Injection!
 *
 * @param {string} text - The SQL query text
 * @param {Array} params - Array of parameter values
 * @returns {Promise<pg.QueryResult>}
 */
export const query = (text, params) => {
  return pool.query(text, params);
};

export default pool;

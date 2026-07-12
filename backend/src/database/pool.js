import pg from 'pg';
import config from '../config/index.js';

const { Pool, types } = pg;

// Keep PostgreSQL DATE columns as plain YYYY-MM-DD strings.
// This avoids timezone shifts when JS Date serialization converts to UTC.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl,
  max: process.env.VERCEL ? 1 : (config.db.ssl ? 10 : 60),
  idleTimeoutMillis: process.env.VERCEL ? 1000 : 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export const query = (text, params) => pool.query(text, params);

export const getClient = () => pool.connect();

export default pool;

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
  // إصلاح pool exhaustion: الـ dashboard وحده كان يطلب 33 connection متوازية
  // رفعنا الحد من 40 إلى 60 لاستيعاب أكثر من مستخدم في نفس الوقت
  max: 60,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export const query = (text, params) => pool.query(text, params);

export const getClient = () => pool.connect();

export default pool;

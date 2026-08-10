import pg from "pg";
import config from "../config/index.js";
const { Pool, types } = pg;
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1700, (value) => {
  if (value === null) return null;
  const num = parseFloat(value);
  return Math.round(num * 100) / 100;
});
const connectionOptions = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password
};
const dbSsl = config.db.ssl;
const maxConnections = process.env.VERCEL ? 1 : dbSsl ? 10 : 60;
const pool = new Pool({
  ...connectionOptions,
  ssl: dbSsl,
  max: maxConnections,
  min: process.env.VERCEL ? 0 : 2,
  // اتصالان جاهزان دائماً (إلا Vercel)
  idleTimeoutMillis: process.env.VERCEL ? 1e3 : 3e4,
  connectionTimeoutMillis: 8e3,
  // ← زيادة الـ timeout لـ Supabase
  statement_timeout: 3e4,
  // ← 30 ثانية حد أقصى للـ Query
  query_timeout: 3e4,
  // ← حماية إضافية على مستوى Client
  keepAlive: true,
  // ← منع انقطاع الاتصال الخامل
  keepAliveInitialDelayMillis: 1e4
});
pool.on("error", (err, client) => {
  console.error("[DB Pool] \u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639 \u0641\u064A \u0627\u062A\u0635\u0627\u0644 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A:", err.message);
});
pool.on("connect", (_client) => {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DB Pool] \u0627\u062A\u0635\u0627\u0644 \u062C\u062F\u064A\u062F \u2014 \u0625\u062C\u0645\u0627\u0644\u064A: ${pool.totalCount} / ${maxConnections}`);
  }
});
pool.on("remove", (_client) => {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DB Pool] \u0625\u0632\u0627\u0644\u0629 \u0627\u062A\u0635\u0627\u0644 \u2014 \u0645\u062A\u0628\u0642\u064D: ${pool.totalCount}`);
  }
});
const query = (text, params) => pool.query(text, params);
const getClient = () => pool.connect();
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};
const checkHealth = async () => {
  const start = Date.now();
  try {
    await pool.query("SELECT 1 AS ping");
    return {
      ok: true,
      latencyMs: Date.now() - start,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max: maxConnections
      }
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err.message,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max: maxConnections
      }
    };
  }
};
const closePool = async () => {
  console.log("[DB Pool] \u0625\u063A\u0644\u0627\u0642 \u062C\u0645\u064A\u0639 \u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A...");
  await pool.end();
  console.log("[DB Pool] \u062A\u0645 \u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0640 Pool \u0628\u0646\u062C\u0627\u062D");
};
var pool_default = pool;
export {
  checkHealth,
  closePool,
  pool_default as default,
  getClient,
  query,
  withTransaction
};

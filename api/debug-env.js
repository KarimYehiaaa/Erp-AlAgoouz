import config from '../backend/src/config/index.js';
import pg from 'pg';

export default async function handler(req, res) {
  let dbError = null;
  const client = new pg.Client({ connectionString: config.db.connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.end();
    dbError = 'SUCCESS';
  } catch (err) {
    dbError = err.message + ' | host: ' + client.host + ' | port: ' + client.port;
  }

  res.status(200).json({
    DB_HOST: process.env.DB_HOST,
    PGHOST: process.env.PGHOST,
    PGUSER: process.env.PGUSER,
    PGPASSWORD: process.env.PGPASSWORD ? 'SET' : 'NOT_SET',
    PGDATABASE: process.env.PGDATABASE,
    configConnectionString: config.db.connectionString ? config.db.connectionString.replace(/:[^:]+@/, ':***@') : 'UNDEFINED',
    dbError
  });
}

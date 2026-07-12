import config from '../backend/src/config/index.js';
import pg from 'pg';

export default async function handler(req, res) {
  let dbError = null;
  const client = new pg.Client({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    ssl: config.db.ssl
  });
  try {
    await client.connect();
    await client.end();
    dbError = 'SUCCESS';
  } catch (err) {
    dbError = err.message + ' | host: ' + client.host + ' | port: ' + client.port;
  }

  res.status(200).json({
    DATABASE_URL_SET: !!process.env.DATABASE_URL,
    parsedHost: config.db.host,
    parsedPort: config.db.port,
    parsedUser: config.db.user,
    parsedDatabase: config.db.database,
    parsedSSL: config.db.ssl ? 'ENABLED' : 'DISABLED',
    dbError
  });
}

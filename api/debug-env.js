import config from '../backend/src/config/index.js';
import pool from '../backend/src/database/pool.js';

export default function handler(req, res) {
  res.status(200).json({
    DB_HOST: process.env.DB_HOST,
    PGHOST: process.env.PGHOST,
    configConnectionString: config.db.connectionString ? config.db.connectionString.replace(/:[^:]+@/, ':***@') : 'UNDEFINED',
    poolHost: pool.options.host,
    poolConnectionString: pool.options.connectionString ? pool.options.connectionString.replace(/:[^:]+@/, ':***@') : 'UNDEFINED'
  });
}

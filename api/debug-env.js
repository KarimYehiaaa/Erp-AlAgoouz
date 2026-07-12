export default function handler(req, res) {
  res.status(200).json({
    DB_HOST: process.env.DB_HOST,
    DATABASE_URL_SET: !!process.env.DATABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 15) + '...' : undefined,
    PGHOST: process.env.PGHOST,
    DB_USER: process.env.DB_USER,
    DB_SSL: process.env.DB_SSL
  });
}

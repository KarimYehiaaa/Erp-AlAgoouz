import dotenv from 'dotenv';
dotenv.config();

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export default {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    connectionString: (process.env.DATABASE_URL || `postgres://${process.env.DB_USER || 'erp_user'}:${encodeURIComponent(requireEnv('DB_PASSWORD'))}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.NODE_ENV === 'test' ? (process.env.DB_NAME_TEST || 'bin_al_ajouz_test') : (process.env.DB_NAME || 'bin_al_ajouz')}`).replace(/\?sslmode=[a-zA-Z-]+/, ''),
    ssl: process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: false
    } : false,
  },
  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  corsOrigin: process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) 
    : 'http://localhost:5173',
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  },
  company: {
    name: process.env.COMPANY_NAME || 'بن العجوز',
  },
};


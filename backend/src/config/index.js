import dotenv from 'dotenv';
dotenv.config();

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const parseConnectionString = (uri) => {
  if (!uri) return null;
  const doubleSlashIndex = uri.indexOf('//');
  if (doubleSlashIndex === -1) return null;
  const credsAndHost = uri.substring(doubleSlashIndex + 2);
  const lastSlashIndex = credsAndHost.lastIndexOf('/');
  if (lastSlashIndex === -1) return null;
  const database = credsAndHost.substring(lastSlashIndex + 1).split('?')[0];
  const credsAndHostOnly = credsAndHost.substring(0, lastSlashIndex);
  const lastAtIndex = credsAndHostOnly.lastIndexOf('@');
  if (lastAtIndex === -1) return null;
  const hostAndPort = credsAndHostOnly.substring(lastAtIndex + 1);
  const creds = credsAndHostOnly.substring(0, lastAtIndex);
  const colonIndex = creds.indexOf(':');
  if (colonIndex === -1) return null;
  const user = creds.substring(0, colonIndex);
  const password = decodeURIComponent(creds.substring(colonIndex + 1));
  const hostColonIndex = hostAndPort.indexOf(':');
  const host = hostColonIndex === -1 ? hostAndPort : hostAndPort.substring(0, hostColonIndex);
  const port = hostColonIndex === -1 ? '5432' : hostAndPort.substring(hostColonIndex + 1);
  return { user, password, host, port, database };
};

let dbConfig = null;
if (process.env.DATABASE_URL) {
  dbConfig = parseConnectionString(process.env.DATABASE_URL);
}

if (!dbConfig) {
  dbConfig = {
    user: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '5432',
    database: process.env.NODE_ENV === 'test' 
      ? (process.env.DB_NAME_TEST || 'bin_al_ajouz_test') 
      : (process.env.DB_NAME || 'bin_al_ajouz')
  };
}

dbConfig.ssl = (process.env.DB_SSL === 'true' || !!process.env.DATABASE_URL || dbConfig.host.includes('supabase') || dbConfig.host.includes('neon'))
  ? { rejectUnauthorized: false }
  : false;

export default {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: dbConfig,
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


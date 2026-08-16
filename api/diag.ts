import app from '../backend/src/app.ts';

export default async function handler(req: any, res: any) {
  const info: Record<string, any> = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasDbHost: !!process.env.DB_HOST,
      hasDbUser: !!process.env.DB_USER,
      hasDbPassword: !!process.env.DB_PASSWORD,
      hasJwtSecret: !!process.env.JWT_SECRET,
    },
    appLoaded: !!app,
  };

  try {
    const { checkHealth } = await import('../backend/src/database/pool.ts');
    const health = await checkHealth();
    info.dbHealth = health;
  } catch (err: any) {
    info.dbError = {
      message: err.message,
      stack: err.stack,
    };
  }

  res.status(200).json(info);
}

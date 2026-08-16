export default async function handler(req, res) {
  const result = {
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
    importAppError: null,
    appLoaded: false,
  };

  try {
    const appModule = await import('../backend/src/app.ts');
    result.appLoaded = !!appModule.default;
  } catch (err) {
    result.importAppError = {
      message: err.message,
      name: err.name,
      stack: err.stack,
      code: err.code,
    };
  }

  res.status(200).json(result);
}

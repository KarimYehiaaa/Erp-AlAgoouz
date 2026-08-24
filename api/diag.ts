import fs from 'fs';
import path from 'path';

function listDirRecursive(dir: string, depth = 2): any {
  if (depth <= 0 || !fs.existsSync(dir)) return [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.map((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        return { name: e.name, type: 'dir', children: listDirRecursive(full, depth - 1) };
      }
      return { name: e.name, type: 'file' };
    });
  } catch (err: any) {
    return { error: err.message };
  }
}

export default async function handler(req: any, res: any) {
  let dbResult: any = null;
  try {
    const { checkHealth } = await import('../backend/src/database/pool.ts');
    dbResult = await checkHealth();
  } catch (err: any) {
    dbResult = { ok: false, error: err.message, stack: err.stack };
  }

  let appError: any = null;
  try {
    await import('../backend/src/app.ts');
  } catch (err: any) {
    appError = { message: err.message, stack: err.stack };
  }

  res.status(200).json({
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    isVercel: !!process.env.VERCEL,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasDbUser: !!process.env.DB_USER,
    hasDbPassword: !!process.env.DB_PASSWORD,
    hasDbHost: !!process.env.DB_HOST,
    hasDbName: !!process.env.DB_NAME,
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasJwtRefreshSecret: !!process.env.JWT_REFRESH_SECRET,
    dbResult,
    appError,
  });
}

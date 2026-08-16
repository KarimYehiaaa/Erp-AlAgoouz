let cachedApp = null;
let initError = null;

async function getApp() {
  if (cachedApp) return cachedApp;
  if (initError) throw initError;
  try {
    const mod = await import('../backend/src/app.ts');
    cachedApp = mod.default || mod;
    return cachedApp;
  } catch (err) {
    initError = err;
    console.error('Failed to initialize application on Vercel:', err);
    throw err;
  }
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Vercel Serverless Function Initialization Error',
      message: err.message || String(err),
      name: err.name,
      stack: err.stack,
    });
  }
}

import app from '../backend/src/app.ts';

export default async function handler(req: any, res: any) {
  // تصحيح مسار Vercel في حال تم تمرير المسار الداخلي /api/index
  if (req.url && (req.url === '/api/index' || req.url.startsWith('/api/index?'))) {
    const matched =
      req.headers['x-vercel-matched-path'] ||
      req.headers['x-matched-path'] ||
      req.headers['x-forwarded-uri'] ||
      req.originalUrl;
    if (matched && matched !== '/api/index') {
      req.url = matched;
    }
  }

  try {
    return app(req, res);
  } catch (err: any) {
    console.error('❌ [Vercel Serverless Error]:', err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم السحابي',
        error: err.message,
      });
    }
  }
}

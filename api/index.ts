import app from '../backend/src/app.ts';

export default async function handler(req: any, res: any) {
  // 1. استخراج وتصحيح المسار الحقيقي للطلب في بيئة Vercel Serverless
  const original =
    req.headers['x-matched-path'] ||
    req.headers['x-vercel-matched-path'] ||
    req.headers['x-forwarded-uri'] ||
    req.headers['x-original-url'] ||
    req.headers['x-rewrite-url'] ||
    req.originalUrl;

  if (original && original !== '/api/index' && original !== '/api/v1/index' && !original.startsWith('/api/index?')) {
    req.url = original;
  } else if (req.headers['x-now-route-matches']) {
    try {
      const matches = new URLSearchParams(req.headers['x-now-route-matches'] as string);
      const subpath = matches.get('1') || matches.get('0');
      if (subpath) {
        req.url = `/api/${decodeURIComponent(subpath)}`;
      }
    } catch {
      // تجاهل
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

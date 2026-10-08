import { loadInstrumentedApp } from '../backend/src/appLoader.ts';
import { restoreVercelRequestPath } from '../backend/src/utils/vercelRequestPath.ts';

export default async function handler(req: any, res: any) {
  // ═══════════════════════════════════════════════════════════════════════════
  // Vercel Serverless Entry Point
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // جميع الطلبات تأتي عبر rewrites في vercel.json:
  //   "/api/v1/(.*)" → "/api/index"
  //   "/api/(.*)"    → "/api/index"
  //   "/v1/(.*)"     → "/api/index"
  //   "/health"      → "/api/index"
  //
  // المسار الحقيقي يكون في x-now-route-matches أو req.url نفسه
  // ═══════════════════════════════════════════════════════════════════════════

  // لا تسجل URL كاملًا لأن query parameters قد تحتوي رموز جلسات أو بيانات حساسة.
  try {
    console.log('[Vercel Route]', { method: req.method || 'UNKNOWN' });
    restoreVercelRequestPath(req);
    const app = await loadInstrumentedApp();

    let readiness;
    try {
      const { getServerlessSchemaReadiness } =
        await import('../backend/src/database/serverlessReadiness.ts');
      readiness = await getServerlessSchemaReadiness();
    } catch (err: unknown) {
      const errorType = err instanceof Error ? 'Error' : 'UnknownError';
      console.error(`[Vercel Serverless Readiness Error]: ${errorType}`);
      if (!res.headersSent) {
        return res.status(503).json({
          success: false,
          code: 'DATABASE_SCHEMA_UNAVAILABLE',
          message: 'تعذر التحقق من جاهزية قاعدة البيانات.',
        });
      }
      return;
    }
    if (readiness.ready === false) {
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SCHEMA_NOT_READY',
        message: 'الخادم يحتاج إلى صيانة مجدولة قبل استقبال الطلبات.',
      });
    }

    return await app(req, res);
  } catch (err: unknown) {
    const errorType = err instanceof Error ? 'Error' : 'UnknownError';
    console.error(`[Vercel Serverless Error]: ${errorType}`);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'حدث خطأ داخلي غير متوقع في الخادم السحابي',
      });
    }
  }
}

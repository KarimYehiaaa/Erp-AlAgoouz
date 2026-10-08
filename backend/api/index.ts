import type { Request, Response } from 'express';
import { loadInstrumentedApp } from '../src/appLoader.ts';
import { restoreVercelRequestPath } from '../src/utils/vercelRequestPath.ts';

export default async function handler(req: Request, res: Response) {
  try {
    restoreVercelRequestPath(req);
    const app = await loadInstrumentedApp();
    let readiness;
    try {
      const { getServerlessSchemaReadiness } =
        await import('../src/database/serverlessReadiness.ts');
      readiness = await getServerlessSchemaReadiness();
    } catch (error: unknown) {
      const errorType = error instanceof Error ? 'Error' : 'UnknownError';
      console.error(`[Vercel API] Schema readiness check failed: ${errorType}`);
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
  } catch (error: unknown) {
    const errorType = error instanceof Error ? 'Error' : 'UnknownError';
    console.error(`[Vercel API] Unhandled function error: ${errorType}`);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'حدث خطأ داخلي غير متوقع في الخادم السحابي',
      });
    }
  }
}

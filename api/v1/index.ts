import app from '../../backend/src/app.ts';

export default async function handler(req: any, res: any) {
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

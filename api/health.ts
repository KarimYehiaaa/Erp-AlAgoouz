import app from '../backend/src/app.ts';

export default async function handler(req: any, res: any) {
  try {
    return app(req, res);
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Serverless execution error', error: err.message });
    }
  }
}

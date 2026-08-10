import app from '../backend/src/index';

export default async function handler(req: any, res: any) {
  try {
    return app(req, res);
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || 'Server Error',
      stack: err?.stack,
    });
  }
}

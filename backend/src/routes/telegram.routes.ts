/**
 * routes/telegram.routes.ts — مسارات استقبال تحديثات بوت تليجرام (Webhook) والتحكم
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { authenticate } from '../middleware/auth.ts';
import { requireAdmin } from './helpers.ts';
import TelegramBotService from '../services/telegramBotService.ts';

const router = Router();

const isTelegramWebhookSecretConfigured = (): boolean =>
  /^[A-Za-z0-9_-]{32,256}$/.test(process.env.TELEGRAM_WEBHOOK_SECRET || '');

const authenticateTelegramWebhook = (req: Request, res: Response, next: () => void) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!isTelegramWebhookSecretConfigured()) {
    return res.status(503).json({ success: false, message: 'Telegram webhook is not configured' });
  }

  const providedSecret = req.get('X-Telegram-Bot-Api-Secret-Token') || '';
  const expected = Buffer.from(expectedSecret, 'utf8');
  const provided = Buffer.from(providedSecret, 'utf8');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return res.status(403).json({ success: false, message: 'Webhook authentication failed' });
  }

  next();
};

// Webhook endpoint (يتعامل مع تليجرام مباشرة سواء عبر /telegram/webhook أو /api/telegram/webhook)
const handleWebhook = async (req: Request, res: Response) => {
  try {
    if (req.body?.message) {
      await TelegramBotService.handleIncomingMessage(req.body.message);
    }
    res.status(200).json({ ok: true });
  } catch {
    res.status(200).json({ ok: true }); // Always 200 for telegram webhook
  }
};

router.post('/telegram/webhook', authenticateTelegramWebhook, handleWebhook);
router.post('/api/telegram/webhook', authenticateTelegramWebhook, handleWebhook);

// فحص حالة البوت التفاعلي (محمي — لا يكشف إعدادات البوت للعموم)
router.get('/telegram/status', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  const creds = await TelegramBotService.getBotCredentials();
  res.json({
    success: true,
    data: {
      hasToken: Boolean(creds.token),
      hasDefaultChatId: Boolean(creds.defaultChatId),
    },
  });
});

// إعادة تشغيل محرك الاستماع التفاعلي (محمي — عملية إدارية حساسة)
router.post(
  '/telegram/restart',
  authenticate,
  requireAdmin,
  async (_req: Request, res: Response) => {
    await TelegramBotService.restartListening();
    res.json({
      success: true,
      message: 'تمت إعادة تشغيل محرك استماع بوت تليجرام بنجاح',
    });
  },
);

export default router;

/**
 * routes/telegram.routes.ts — مسارات استقبال تحديثات بوت تليجرام (Webhook) والتحكم
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { requireAdmin } from './helpers.ts';
import TelegramBotService from '../services/telegramBotService.ts';

const router = Router();

// Webhook endpoint (يتعامل مع تليجرام مباشرة سواء عبر /telegram/webhook أو /api/telegram/webhook)
const handleWebhook = async (req: Request, res: Response) => {
  try {
    // [AUDIT FIX H7] التحقق من سر الويب هوك — تليجرام يرسله في هذا الهيدر عند ضبط
    // secret_token في setWebhook. بدون هذا الفحص كان أي شخص يستطيع تزوير رسائل أوامر.
    const expectedSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    if (expectedSecret) {
      const received = String(req.headers['x-telegram-bot-api-secret-token'] || '');
      if (received !== expectedSecret) {
        return res.status(401).json({ ok: false });
      }
    }
    if (req.body?.message) {
      await TelegramBotService.handleIncomingMessage(req.body.message);
    }
    res.status(200).json({ ok: true });
  } catch (_err) {
    res.status(200).json({ ok: true }); // Always 200 for telegram webhook
  }
};

router.post('/telegram/webhook', handleWebhook);
router.post('/api/telegram/webhook', handleWebhook);

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
    // [AUDIT FIX H7] مزامنة سر الويب هوك مع تليجرام تلقائياً بعد إعادة التشغيل،
    // حتى يبقى فحص الـ secret فعّالاً دون خطوة يدوية.
    const webhookSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    if (webhookSecret) {
      try {
        const { token } = await TelegramBotService.getBotCredentials();
        const hookUrl = `${(process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '')}/api/telegram/webhook`;
        await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: hookUrl, secret_token: webhookSecret }),
        });
      } catch {
        // تجاهل — الفحص سيبقى مفروضاً محلياً على أي طلب مهما كانت حالة تليجرام
      }
    }
    res.json({
      success: true,
      message: 'تمت إعادة تشغيل محرك استماع بوت تليجرام بنجاح',
    });
  },
);

export default router;

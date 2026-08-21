/**
 * routes/telegram.routes.ts — مسارات استقبال تحديثات بوت تليجرام (Webhook) والتحكم
 * ════════════════════════════════════════════════════════════════════════════════
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import TelegramBotService from '../services/telegramBotService.ts';

const router = Router();

// Webhook endpoint (يتعامل مع تليجرام مباشرة سواء عبر /telegram/webhook أو /api/telegram/webhook)
const handleWebhook = async (req: Request, res: Response) => {
  try {
    if (req.body?.message) {
      await TelegramBotService.handleIncomingMessage(req.body.message);
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(200).json({ ok: true }); // Always 200 for telegram webhook
  }
};

router.post('/telegram/webhook', handleWebhook);
router.post('/api/telegram/webhook', handleWebhook);

// فحص حالة البوت التفاعلي
router.get('/telegram/status', async (_req: Request, res: Response) => {
  const creds = await TelegramBotService.getBotCredentials();
  res.json({
    success: true,
    data: {
      hasToken: Boolean(creds.token),
      hasDefaultChatId: Boolean(creds.defaultChatId),
    },
  });
});

// إعادة تشغيل محرك الاستماع التفاعلي
router.post('/telegram/restart', async (_req: Request, res: Response) => {
  await TelegramBotService.restartListening();
  res.json({
    success: true,
    message: 'تمت إعادة تشغيل محرك استماع بوت تليجرام بنجاح',
  });
});

export default router;

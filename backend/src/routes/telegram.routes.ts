/**
 * routes/telegram.routes.ts — مسارات استقبال تحديثات بوت تليجرام (Webhook)
 * ══════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import TelegramBotService from '../services/telegramBotService.ts';

const router = Router();

router.post('/telegram/webhook', async (req: Request, res: Response) => {
  try {
    if (req.body?.message) {
      await TelegramBotService.handleIncomingMessage(req.body.message);
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(200).json({ ok: true }); // Always 200 for telegram webhook
  }
});

export default router;

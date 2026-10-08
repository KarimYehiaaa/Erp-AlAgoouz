import logger from './loggerService.ts';
import { query } from '../database/pool.ts';
import TelegramService from './telegramService.ts';
import { createPublicWebhookDispatcher } from '../utils/urlValidator.ts';
import { requestCloudJson, requireProviderString } from '../utils/cloudProviderRequest.ts';

export const NOTIFICATION_TIMEOUT_MS = 10_000;
export type DeliveryStatus = 'disabled' | 'delivered' | 'failed' | 'skipped';
export interface NotificationReceipt {
  success: boolean;
  persisted: boolean;
  discord: DeliveryStatus;
  telegram: DeliveryStatus;
}

/**
 * حفظ التنبيه في جدول notifications (user_id NULL = عام لكل المستخدمين).
 * لا يُرمي خطأ أبداً حتى لا يكسر تدفق التنبيهات الخارجية.
 */
export const persistNotification = async (
  subject: string,
  message: string,
  type: string,
): Promise<boolean> => {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title_ar, message_ar)
       VALUES (NULL, $1, $2, $3)`,
      [type === 'error' ? 'danger' : type, String(subject).slice(0, 200), message],
    );
    return true;
  } catch {
    logger.warn('[Notifications] تعذر حفظ الإشعار الداخلي.');
    return false;
  }
};

/**
 * إرسال تنبيه (حفظ في قاعدة البيانات + Webhook اختياري).
 * @param {string} subject عنوان التنبيه
 * @param {string} message نص التنبيه
 * @param {'info'|'warning'|'danger'} [type] نوع التنبيه
 * @returns {Promise<NotificationReceipt>}
 */
export const sendAlert = async (
  subject: string,
  message: string,
  type: string = 'info',
): Promise<NotificationReceipt> => {
  const receipt: NotificationReceipt = {
    success: false,
    persisted: false,
    discord: 'disabled',
    telegram: 'disabled',
  };
  const signal = AbortSignal.timeout(NOTIFICATION_TIMEOUT_MS);
  // 0. حفظ داخلي في مركز التنبيهات
  receipt.persisted = await persistNotification(subject, message, type);

  // 1. تنبيه Discord
  const webhookUrl = process.env.ALERT_DISCORD_WEBHOOK_URL;
  if (webhookUrl && process.env.NODE_ENV === 'test') receipt.discord = 'skipped';
  else if (webhookUrl) {
    receipt.discord = 'failed';
    let color = 5814783; // Blue/Cyan (Info)
    if (type === 'error') {
      color = 16711680; // Red
    } else if (type === 'warning') {
      color = 16776960; // Yellow
    } else if (type === 'success') {
      color = 65280; // Green
    }

    const payload = {
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: ` ${subject}`,
          description: message,
          color: color,
          timestamp: new Date().toISOString(),
          footer: {
            text: 'نظام إدارة بن العجوز ERP',
          },
        },
      ],
    };

    let dispatcher: Awaited<ReturnType<typeof createPublicWebhookDispatcher>> | undefined;
    try {
      dispatcher = await createPublicWebhookDispatcher(webhookUrl, signal);
      const url = new URL(webhookUrl);
      // Discord's default 204 does not confirm that a message was actually saved.
      url.searchParams.set('wait', 'true');
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        dispatcher,
      };
      const data = await requestCloudJson(url.toString(), options, 'فشل تنبيه Discord', signal);
      requireProviderString(data, 'id');
      receipt.discord = 'delivered';
    } catch {
      logger.warn('[Notifications] تعذر تأكيد تسليم تنبيه Discord.');
    } finally {
      await dispatcher?.close().catch(() => undefined);
    }
  }

  // 2. تنبيه Telegram
  try {
    const { default: TelegramBotService } = await import('./telegramBotService.ts');
    const { token: tgToken, defaultChatId: tgChatId } =
      await TelegramBotService.getBotCredentials();
    if ((tgToken || tgChatId) && process.env.NODE_ENV === 'test') receipt.telegram = 'skipped';
    else if (tgToken || tgChatId) {
      receipt.telegram = 'failed';
      // الهروب الرمزي لـ MarkdownV2 في تيليجرام لمنع أخطاء التفسير
      const cleanMessage = String(message || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
      const cleanSubject = String(subject || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
      const tgText = ` *${cleanSubject}*\n\n${cleanMessage}\n\n_نظام إدارة بن العجوز ERP_`;

      const sent = await TelegramService.sendMessage(
        tgText,
        { botToken: tgToken, chatId: tgChatId },
        'MarkdownV2',
        signal,
      );
      if (sent.success) receipt.telegram = 'delivered';
      else logger.warn('[Notifications] تعذر تأكيد تسليم تنبيه Telegram.');
    }
  } catch {
    receipt.telegram = 'failed';
    logger.warn('[Notifications] تعذر إعداد تنبيه Telegram.');
  }
  receipt.success =
    receipt.persisted &&
    [receipt.discord, receipt.telegram].every(
      (status) => status === 'disabled' || status === 'delivered',
    );
  return receipt;
};

export default sendAlert;

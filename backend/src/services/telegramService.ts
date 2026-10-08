/**
 * services/telegramService.ts — خدمة إرسال التنبيهات والتقارير عبر Telegram Bot API
 * خدمة خفيفة ومباشرة تتصل بـ Telegram Bot API بدون أي مكتبات إضافية.
 */
import { requestCloudJson } from '../utils/cloudProviderRequest.ts';
import { AppError } from '../types/errors.ts';

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

export class TelegramService {
  /**
   * إرسال رسالة نصية منسقة إلى تليجرام
   */
  static async sendMessage(
    text: string,
    config?: TelegramConfig,
    parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' = 'HTML',
    signal: AbortSignal = AbortSignal.timeout(10_000),
  ): Promise<{ success: boolean; error?: string; messageId?: number }> {
    const token = (config?.botToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const chatId = (config?.chatId || process.env.TELEGRAM_CHAT_ID || '').trim();

    if (!token || !chatId) {
      return {
        success: false,
        error: 'يرجى إدخال كل من Bot Token و Chat ID أولاً',
      };
    }
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
      return { success: false, error: 'صيغة رمز بوت Telegram غير صالحة' };
    }
    if (process.env.NODE_ENV === 'test') {
      return { success: false, error: 'الإرسال الخارجي معطل في وضع الاختبارات' };
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const data = await requestCloudJson(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: parseMode,
            disable_web_page_preview: true,
          }),
        },
        'فشل إرسال Telegram',
        signal,
      );
      const messageId = (data.result as { message_id?: unknown } | undefined)?.message_id;
      if (
        data.ok !== true ||
        typeof messageId !== 'number' ||
        !Number.isSafeInteger(messageId) ||
        messageId <= 0
      ) {
        return { success: false, error: 'لم يؤكد Telegram حفظ الرسالة بمعرّف صالح' };
      }

      return {
        success: true,
        messageId,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof AppError ? err.message : 'تعذر الاتصال الآمن بخدمة Telegram',
      };
    }
  }

  /**
   * فحص الاتصال وإرسال رسالة تجريبية
   */
  static async sendTestMessage(
    config: TelegramConfig,
  ): Promise<{ success: boolean; error?: string }> {
    const testMsg = `
 <b>بن العجوز ERP — فحص اتصال بوت تليجرام</b>
 تم توصيل نظام الأتمتة بنجاح مع هذا الشات!
 <b>التاريخ والوقت:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
 <i>التقارير اليومية والإنذارات اللحظية ستصلك هنا تلقائياً.</i>
    `.trim();

    return await this.sendMessage(testMsg, config, 'HTML');
  }
}

export default TelegramService;

/**
 * services/telegramService.ts — خدمة إرسال التنبيهات والتقارير عبر Telegram Bot API
 * ════════════════════════════════════════════════════════════════════════════════
 * خدمة خفيفة ومباشرة تتصل بـ Telegram Bot API بدون أي مكتبات إضافية.
 */

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
    parseMode: 'HTML' | 'Markdown' = 'HTML',
  ): Promise<{ success: boolean; error?: string; messageId?: number }> {
    const token = config?.botToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = config?.chatId || process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return {
        success: false,
        error: 'لم يتم ضبط بيانات بوت تليجرام (TELEGRAM_BOT_TOKEN أو TELEGRAM_CHAT_ID غير متوفرين)',
      };
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: parseMode,
          disable_web_page_preview: true,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        return {
          success: false,
          error: data.description || 'فشل إرسال الرسالة إلى تليجرام',
        };
      }

      return {
        success: true,
        messageId: data.result?.message_id,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'خطأ في الاتصال بسيرفر تليجرام',
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
☕ <b>بن العجوز ERP — فحص اتصال بوت تليجرام</b> 🤖
═════════════════════════
✅ تم توصيل نظام الأتمتة بنجاح مع هذا الشات!
🕒 <b>التاريخ والوقت:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
🚀 <i>التقارير اليومية والإنذارات اللحظية ستصلك هنا تلقائياً.</i>
    `.trim();

    return await this.sendMessage(testMsg, config, 'HTML');
  }
}

export default TelegramService;

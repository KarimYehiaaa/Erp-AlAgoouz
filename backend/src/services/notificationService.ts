import logger from './loggerService.ts';

/**
 * إرسال تنبيه (سجل داخلي + Webhook اختياري).
 * @param {string} subject عنوان التنبيه
 * @param {string} message نص التنبيه
 * @param {'info'|'warning'|'danger'} [type] نوع التنبيه
 * @returns {Promise<void>}
 */
export const sendAlert = async (subject: string, message: string, type: string = 'info') => {
  // 1. تنبيه Discord
  const webhookUrl = process.env.ALERT_DISCORD_WEBHOOK_URL;
  if (webhookUrl) {
    let color = 5814783; // Blue/Cyan (Info)
    if (type === 'error') {
      color = 16711680; // Red
    } else if (type === 'warning') {
      color = 16776960; // Yellow
    } else if (type === 'success') {
      color = 65280; // Green
    }

    const payload = {
      embeds: [
        {
          title: `🔔 ${subject}`,
          description: message,
          color: color,
          timestamp: new Date().toISOString(),
          footer: {
            text: 'نظام إدارة بن العجوز ERP',
          },
        },
      ],
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        logger.warn('⚠️ [بن العجوز ERP] فشل إرسال التنبيه لـ Discord: %s', response.statusText);
      }
    } catch (err: any) {
      logger.error('⚠️ [بن العجوز ERP] فشل الاتصال بخدمة تنبيهات Discord: %s', err.message);
    }
  }

  // 2. تنبيه Telegram
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChatId = process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChatId) {
    try {
      // الهروب الرمزي لـ MarkdownV2 في تيليجرام لمنع أخطاء التفسير
      const cleanMessage = String(message || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
      const cleanSubject = String(subject || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
      const tgText = `🔔 *${cleanSubject}*\n\n${cleanMessage}\n\n_نظام إدارة بن العجوز ERP_`;

      const response = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: tgChatId,
          text: tgText,
          parse_mode: 'MarkdownV2',
        }),
      });

      if (!response.ok) {
        logger.warn('⚠️ [بن العجوز ERP] فشل إرسال التنبيه لـ Telegram: %s', response.statusText);
      }
    } catch (err: any) {
      logger.error('⚠️ [بن العجوز ERP] فشل الاتصال بخدمة تنبيهات Telegram: %s', err.message);
    }
  }
};

export default sendAlert;

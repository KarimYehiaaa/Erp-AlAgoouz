/**
 * services/telegramBotService.ts — محرك الأوامر التفاعلية ثنائية الاتجاه لبوت تليجرام
 * ═════════════════════════════════════════════════════════════════════════════════
 * يستمع لأوامر المالك والمديرين على تليجرام ويرد فوراً ببيانات وتقارير النظام الحية.
 *
 * إعادة التنظيم الجذري: كل المسارات/المعالجات نُقلت إلى السجل المركزي
 * config/telegramCommands.ts، وهذه الخدمة مسؤوليتها فقط:
 *   الاستماع (Long Polling) → التوحيد → البحث في السجل → التنفيذ → الرد.
 * وبذلك يظهر البوت على اللوحة ثلاثية الأبعاد كعقدة انطلاق (Trigger Node)
 * متصلة مباشرة بمحرك الأتمتة عبر GET /automations/graph.
 */

import TelegramService from './telegramService.ts';
import db from '../database/pool.ts';
import logger from './loggerService.ts';
import {
  TELEGRAM_COMMANDS,
  findCommand,
  normalizeCommand,
  UNKNOWN_COMMAND_REPLY,
  type TelegramCommandContext,
} from '../config/telegramCommands.ts';

export class TelegramBotService {
  private static isPolling = false;
  private static lastUpdateId = 0;
  private static pollingInterval: NodeJS.Timeout | null = null;
  private static cachedToken: string | null = null;
  private static lastActivityAt: string | null = null;

  /**
   * جلب بيانات اعتماد بوت تليجرام (من المتغيرات البيئية أو قاعدة البيانات)
   */
  static async getBotCredentials(): Promise<{ token: string; defaultChatId: string }> {
    let token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    let defaultChatId = (process.env.TELEGRAM_CHAT_ID || '').trim();

    if (!token || !defaultChatId) {
      try {
        const res = await db.query(
          `SELECT config FROM automations 
           WHERE config->>'bot_token' IS NOT NULL 
             AND config->>'bot_token' != '' 
           LIMIT 1`,
        );
        if (res.rows.length > 0) {
          const cfg = res.rows[0].config;
          if (!token && cfg.bot_token) token = String(cfg.bot_token).trim();
          if (!defaultChatId && cfg.chat_id) defaultChatId = String(cfg.chat_id).trim();
        }
      } catch (err: any) {
        logger.warn(`⚠️ [Telegram Bot] تعذر قراءة إعدادات تليجرام من DB: ${err.message}`);
      }
    }

    return { token, defaultChatId };
  }

  /**
   * حالة المحرك للوحة الشبكة ثلاثية الأبعاد (بدون كشف أي أسرار)
   */
  static getStatus(): {
    listening: boolean;
    commandsCount: number;
    lastActivityAt: string | null;
    tokenConfiguredInEnv: boolean;
  } {
    return {
      listening: this.isPolling,
      commandsCount: TELEGRAM_COMMANDS.length,
      lastActivityAt: this.lastActivityAt,
      tokenConfiguredInEnv: Boolean((process.env.TELEGRAM_BOT_TOKEN || '').trim()),
    };
  }

  /**
   * بدء الاستماع التلقائي للأوامر الواردة (Long Polling)
   */
  static async startListening() {
    if (this.isPolling) return;

    const { token } = await this.getBotCredentials();
    if (!token) {
      logger.info('ℹ️ [Telegram Bot] لم يتم ضبط TELEGRAM_BOT_TOKEN — الاستماع التفاعلي معطل.');
      return;
    }

    this.cachedToken = token;
    this.isPolling = true;
    logger.info('🤖 [Telegram Bot] بدء الاستماع التفاعلي لأوامر تليجرام (2-Way Commands)...');

    // مسح أي Webhook سابق لتفادي خطأ 409 Conflict مع Long Polling
    try {
      await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
    } catch {
      // Ignore network hiccups on webhook clear
    }

    if (this.pollingInterval) clearInterval(this.pollingInterval);

    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollUpdates();
      } catch {
        // Silent loop error
      }
    }, 2000);
  }

  /**
   * إعادة تشغيل الاستماع (عند تحديث الإعدادات من الواجهة)
   */
  static async restartListening() {
    this.isPolling = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    await this.startListening();
  }

  /**
   * جلب التحديثات ومعالجة الرسائل الواردة
   */
  private static async pollUpdates() {
    const { token } = await this.getBotCredentials();
    if (!token) {
      this.isPolling = false;
      if (this.pollingInterval) clearInterval(this.pollingInterval);
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=2`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.ok || !Array.isArray(data.result)) return;

      for (const update of data.result) {
        this.lastUpdateId = update.update_id;
        if (update.message?.text) {
          await this.handleIncomingMessage(update.message, token);
        }
      }
    } catch {
      // Ignore polling timeout/network hiccups
    }
  }

  /**
   * معالجة الرسالة الواردة: توحيد → بحث في السجل المركزي → تنفيذ → رد
   */
  static async handleIncomingMessage(message: any, overrideToken?: string) {
    const rawText = (message.text || '').trim();
    const chatId = String(message.chat?.id || '');
    const userName = message.from?.first_name || message.from?.username || 'يا فندم';

    if (!rawText || !chatId) return;

    const { token: defaultToken } = await this.getBotCredentials();
    const token = overrideToken || defaultToken;

    const normalized = normalizeCommand(rawText);

    logger.info(
      `📨 [Telegram Bot] استلام أمر: "${rawText}" (${normalized}) من شات: ${chatId} ← سجل الأوامر المركزي (${TELEGRAM_COMMANDS.length} أوامر)`,
    );
    this.lastActivityAt = new Date().toISOString();

    const reply = async (htmlContent: string) => {
      await TelegramService.sendMessage(htmlContent, { chatId, botToken: token }, 'HTML');
    };

    const ctx: TelegramCommandContext = { normalized, rawText, chatId, userName, reply };

    try {
      const command = findCommand(normalized);

      if (command) {
        await command.run(ctx);
        return;
      }

      // في حال عدم التعرف على الأمر
      await reply(UNKNOWN_COMMAND_REPLY(rawText));
    } catch (err: any) {
      logger.error(`❌ [Telegram Bot] خطأ أثناء معالجة الأمر: ${err.message}`);
      await reply(`⚠️ <b>عفواً، حدث خطأ أثناء تنفيذ الأمر:</b> ${err.message}`);
    }
  }
}

export default TelegramBotService;

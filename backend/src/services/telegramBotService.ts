/**
 * services/telegramBotService.ts — محرك الأوامر التفاعلية ثنائية الاتجاه لبوت تليجرام
 * ═════════════════════════════════════════════════════════════════════════════════
 * يستمع لأوامر المالك والمديرين على تليجرام ويرد فوراً ببيانات وتقارير النظام الحية.
 */

import TelegramService from './telegramService.ts';
import AutomationService from './automationService.ts';
import BranchBalancingService from './branchBalancingService.ts';
import db from '../database/pool.ts';
import logger from './loggerService.ts';

export class TelegramBotService {
  private static isPolling = false;
  private static lastUpdateId = 0;
  private static pollingInterval: NodeJS.Timeout | null = null;
  private static cachedToken: string | null = null;

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
      } catch (err: any) {
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
    } catch (err: any) {
      // Ignore polling timeout/network hiccups
    }
  }

  /**
   * معالجة الرسالة الواردة وتنفيذ الأمر المناسب
   */
  static async handleIncomingMessage(message: any, overrideToken?: string) {
    const rawText = (message.text || '').trim();
    const chatId = String(message.chat?.id || '');
    const userName = message.from?.first_name || message.from?.username || 'يا فندم';

    if (!rawText || !chatId) return;

    const { token: defaultToken } = await this.getBotCredentials();
    const token = overrideToken || defaultToken;

    // توحيد الحروف وإزالة اللواحق والتنقيط
    const normalized = rawText
      .replace(/^[/\\#@]/, '')
      .split('@')[0]
      .trim()
      .toLowerCase();

    logger.info(`📨 [Telegram Bot] استلام أمر: "${rawText}" (${normalized}) من شات: ${chatId}`);

    const reply = async (htmlContent: string) => {
      await TelegramService.sendMessage(htmlContent, { chatId, botToken: token }, 'HTML');
    };

    try {
      // 1. أوامر المساعدة والترحيب
      if (
        [
          'start',
          'help',
          'اوامر',
          'أوامر',
          'الاوامر',
          'الأوامر',
          'مساعدة',
          'مساعده',
          'هلا',
          'مرحبا',
          'سلام',
          'menu',
        ].includes(normalized)
      ) {
        const welcomeText = `
☕ <b>أهلاً بك في بوت بن العجوز ERP الذكي</b> 🤖
═════════════════════════
مرحباً <b>${userName}</b>، يمكنك التحكم في النظام والاستعلام عن الأرقام الحية عبر الأوامر التالية:

📊 <b>/sales أو /مبيعات</b> ⬅️ تقرير مبيعات وأرباح اليوم الحية
📦 <b>/stock أو /نواقص</b> ⬅️ فحص خامات البن والأصناف الناقصة
💵 <b>/cash أو /خزينة</b> ⬅️ إجمالي السيولة النقدية والمصروفات
🔄 <b>/balance أو /مناقلات</b> ⬅️ اقتراحات توازن المخزون بين الفروع
💰 <b>/cashflow أو /سيولة</b> ⬅️ درع وتوقعات السيولة للـ 14 يوماً القادمة
⚡ <b>/health أو /سيرفر</b> ⬅️ حالة السيرفر وسلامة قاعدة البيانات

═════════════════════════
🚀 <i>اكتب أي أمر مباشرة وسأجيبك بأحدث أرقام النظام فوراً!</i>
        `.trim();
        await reply(welcomeText);
        return;
      }

      // 2. أمر المبيعات الحية
      if (
        [
          'sales',
          'مبيعات',
          'المبيعات',
          'تقرير_المبيعات',
          'تقرير',
          'التقرير',
          'تقرير_اليوم',
        ].includes(normalized)
      ) {
        const auto = await AutomationService.getAutomationByKey('daily_sales_report');
        const report = await (AutomationService as any).generateDailySalesReport(
          auto?.config || {},
        );
        await reply(report.htmlMessage);
        return;
      }

      // 3. أمر النواقص والمخزون
      if (
        ['stock', 'نواقص', 'النواقص', 'مخزون', 'المخزون', 'خامات', 'الخامات'].includes(normalized)
      ) {
        const stockAlert = await (AutomationService as any).generateLowStockAlert({});
        await reply(stockAlert.htmlMessage);
        return;
      }

      // 4. أمر الخزينة والسيولة النقدية الحية
      if (
        [
          'cash',
          'خزينة',
          'الخزينة',
          'خزينه',
          'الخزينه',
          'كاش',
          'الكاش',
          'درج',
          'الدرج',
          'فلوس',
        ].includes(normalized)
      ) {
        const today = new Date().toISOString().slice(0, 10);
        const cashRes = await db.query(
          `SELECT
             COALESCE(SUM(total_amount), 0) as total_collected,
             COALESCE(SUM(profit_amount), 0) as total_profit
           FROM sales
           WHERE (sale_date = $1 OR DATE(created_at AT TIME ZONE 'Africa/Cairo') = $1)
             AND status = 'completed' AND deleted_at IS NULL`,
          [today],
        );
        const c = cashRes.rows[0];

        const expRes = await db.query(
          `SELECT COALESCE(SUM(amount), 0) as exp_today FROM expenses WHERE DATE(expense_date) = $1 AND deleted_at IS NULL`,
          [today],
        );
        const expToday = Number(expRes.rows[0]?.exp_today || 0);
        const netCash = Number(c.total_collected) - expToday;

        const cashMsg = `
💵 <b>تقرير الخزينة والسيولة النقدية اليوم</b> 🏦
═════════════════════════
📅 <b>التاريخ:</b> ${today}

💰 <b>إجمالي المبيعات المحصلة:</b> ${Number(c.total_collected).toLocaleString()} ج.م
📈 <b>أرباح اليوم التقديرية:</b> ${Number(c.total_profit).toLocaleString()} ج.م
📉 <b>مصروفات نقدية خرجت اليوم:</b> ${expToday.toLocaleString()} ج.م
⚖️ <b>صافي السيولة النقدية بالدرج:</b> <b>${netCash.toLocaleString()} ج.م</b>
        `.trim();
        await reply(cashMsg);
        return;
      }

      // 5. أمر مناقلات الفروع الذكية
      if (['balance', 'مناقلات', 'المناقلات', 'فروع', 'الفروع', 'توازن'].includes(normalized)) {
        const bal = await BranchBalancingService.generateBalancingRecommendations();
        await reply(bal.htmlReport);
        return;
      }

      // 6. أمر توقعات درع السيولة
      if (
        ['cashflow', 'سيولة', 'السيولة', 'سيوله', 'السيوله', 'تدفق', 'التدفق'].includes(normalized)
      ) {
        const shield = await (AutomationService as any).generateCashFlowRiskReport();
        await reply(shield.htmlMessage);
        return;
      }

      // 7. أمر فحص حالة السيرفر
      if (['health', 'سيرفر', 'السيرفر', 'سيستم', 'السيستم', 'فحص', 'الفحص'].includes(normalized)) {
        const health = await (AutomationService as any).generateSystemHealthSummary();
        await reply(health.htmlMessage);
        return;
      }

      // 8. في حال عدم التعرف على الأمر
      const unknownText = `
❓ <b>عفواً، لم أتعرف على الأمر "${rawText}".</b>
اكتب <b>/اوامر</b> لعرض قائمة الأوامر التفاعلية المتاحة للنظام. ☕
      `.trim();
      await reply(unknownText);
    } catch (err: any) {
      logger.error(`❌ [Telegram Bot] خطأ أثناء معالجة الأمر: ${err.message}`);
      await reply(`⚠️ <b>عفواً، حدث خطأ أثناء تنفيذ الأمر:</b> ${err.message}`);
    }
  }
}

export default TelegramBotService;

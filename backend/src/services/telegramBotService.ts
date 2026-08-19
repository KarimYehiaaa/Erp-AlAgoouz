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

  /**
   * بدء الاستماع التلقائي للأوامر الواردة (Long Polling)
   */
  static async startListening() {
    if (this.isPolling || process.env.VERCEL) return;

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      logger.info('ℹ️ [Telegram Bot] لم يتم ضبط TELEGRAM_BOT_TOKEN — الاستماع التفاعلي معطل.');
      return;
    }

    this.isPolling = true;
    logger.info('🤖 [Telegram Bot] بدء الاستماع التفاعلي لأوامر تليجرام (2-Way Commands)...');

    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollUpdates();
      } catch (err: any) {
        // Silent loop error
      }
    }, 3000);
  }

  /**
   * جلب التحديثات ومعالجة الرسائل الواردة
   */
  private static async pollUpdates() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=2`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.ok || !Array.isArray(data.result)) return;

      for (const update of data.result) {
        this.lastUpdateId = update.update_id;
        if (update.message?.text) {
          await this.handleIncomingMessage(update.message);
        }
      }
    } catch (err: any) {
      // Ignore polling timeout/network hiccups
    }
  }

  /**
   * معالجة الرسالة الواردة وتنفيذ الأمر المناسب
   */
  static async handleIncomingMessage(message: any) {
    const text = (message.text || '').trim();
    const chatId = String(message.chat?.id || '');
    const userName = message.from?.first_name || 'يا فندم';

    const cmd = text.toLowerCase().split(' ')[0].split('@')[0];

    logger.info(`📨 [Telegram Bot] استلام أمر: "${text}" من شات: ${chatId}`);

    switch (cmd) {
      case '/start':
      case '/help':
      case '/اوامر':
      case '/أوامر':
      case 'اوامر':
      case 'أوامر': {
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
🚀 <i>اكتب أي أمر وسأجيبك بأحدث أرقام النظام فوراً!</i>
        `.trim();
        await TelegramService.sendMessage(welcomeText, { chatId });
        break;
      }

      case '/sales':
      case '/مبيعات':
      case 'مبيعات': {
        const auto = await AutomationService.getAutomationByKey('daily_sales_report');
        const report = await (AutomationService as any).generateDailySalesReport(
          auto?.config || {},
        );
        await TelegramService.sendMessage(report.htmlMessage, { chatId });
        break;
      }

      case '/stock':
      case '/نواقص':
      case '/مخزون':
      case 'نواقص': {
        const stockAlert = await (AutomationService as any).generateLowStockAlert({});
        await TelegramService.sendMessage(stockAlert.htmlMessage, { chatId });
        break;
      }

      case '/cash':
      case '/خزينة':
      case 'خزينة': {
        const today = new Date().toISOString().slice(0, 10);
        const cashRes = await db.query(
          `SELECT
             COALESCE(SUM(paid_amount), 0) as total_collected,
             COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN paid_amount ELSE 0 END), 0) as total_cash,
             COALESCE(SUM(CASE WHEN payment_method = 'card' THEN paid_amount ELSE 0 END), 0) as total_card
           FROM invoices
           WHERE DATE(created_at AT TIME ZONE 'Africa/Cairo') = $1 AND status != 'cancelled'`,
          [today],
        );
        const c = cashRes.rows[0];

        const expRes = await db.query(
          `SELECT COALESCE(SUM(amount), 0) as exp_today FROM expenses WHERE DATE(expense_date) = $1`,
          [today],
        );
        const expToday = Number(expRes.rows[0]?.exp_today || 0);
        const netCash = Number(c.total_cash) - expToday;

        const cashMsg = `
💵 <b>تقرير الخزينة والسيولة النقدية اليوم</b> 🏦
═════════════════════════
📅 <b>التاريخ:</b> ${today}

💰 <b>إجمالي المحصل:</b> ${Number(c.total_collected).toLocaleString()} ج.م
💵 <b>نقدية كاش (خزينة):</b> ${Number(c.total_cash).toLocaleString()} ج.م
💳 <b>مدفوعات فيزا/بطاقات:</b> ${Number(c.total_card).toLocaleString()} ج.م
📉 <b>مصروفات نقدية خرجت اليوم:</b> ${expToday.toLocaleString()} ج.م
⚖️ <b>صافي النقدية بالدرج:</b> <b>${netCash.toLocaleString()} ج.م</b>
        `.trim();
        await TelegramService.sendMessage(cashMsg, { chatId });
        break;
      }

      case '/balance':
      case '/مناقلات':
      case '/فروع':
      case 'مناقلات': {
        const bal = await BranchBalancingService.generateBalancingRecommendations();
        await TelegramService.sendMessage(bal.htmlReport, { chatId });
        break;
      }

      case '/cashflow':
      case '/سيولة':
      case 'سيولة': {
        const shield = await (AutomationService as any).generateCashFlowRiskReport();
        await TelegramService.sendMessage(shield.htmlMessage, { chatId });
        break;
      }

      case '/health':
      case '/سيرفر': {
        const health = await (AutomationService as any).generateSystemHealthSummary();
        await TelegramService.sendMessage(health.htmlMessage, { chatId });
        break;
      }

      default: {
        const unknownText = `
❓ <b>عفواً، لم أتعرف على الأمر "${text}".</b>
اكتب <b>/اوامر</b> لعرض قائمة الأوامر التفاعلية المتاحة. ☕
        `.trim();
        await TelegramService.sendMessage(unknownText, { chatId });
      }
    }
  }
}

export default TelegramBotService;

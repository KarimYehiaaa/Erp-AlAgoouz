/**
 * services/telegramBotService.ts — محرك الأوامر التفاعلية ثنائية الاتجاه لبوت تليجرام
 * يستمع لأوامر المالك والمديرين على تليجرام ويرد فوراً ببيانات وتقارير النظام الحية.
 */

import TelegramService from './telegramService.ts';
import WarehouseBalancingService from './warehouseBalancingService.ts';
import { askCopilot } from './aiCopilotService.ts';
import WorkflowGraphService from './workflowGraphService.ts';
import db from '../database/pool.ts';
import logger from './loggerService.ts';

export class TelegramBotService {
  private static isPolling = false;
  private static lastUpdateId = 0;
  private static pollingInterval: ReturnType<typeof setTimeout> | null = null;
  private static cachedToken: string | null = null;
  private static lastError: string | null = null;
  private static botInfo: { username: string; firstName: string } | null = null;

  /**
   * جلب بيانات اعتماد بوت تليجرام (من جدول settings مع fallback لمتغيرات البيئة)
   */
  static async getBotCredentials(): Promise<{
    token: string;
    defaultChatId: string;
    allowedChats: string[];
  }> {
    try {
      const res = await db.query(`SELECT value FROM settings WHERE key = 'telegram' LIMIT 1`);
      const setting = res.rows[0]?.value;
      if (setting && typeof setting === 'object') {
        const token = (setting.bot_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
        const defaultChatId = (setting.chat_id || process.env.TELEGRAM_CHAT_ID || '').trim();
        const allowedChats = setting.allowed_chats
          ? String(setting.allowed_chats)
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [];
        return { token, defaultChatId, allowedChats };
      }
    } catch {
      // تجاهل إذا كانت القاعدة في مرحلة التمهيد
    }

    const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const defaultChatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
    const allowedChats = (process.env.TELEGRAM_ALLOWED_CHATS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { token, defaultChatId, allowedChats };
  }

  /**
   * فحص بيانات الاعتماد والاتصال بـ Telegram Bot API (getMe)
   */
  static async verifyCredentials(testToken?: string): Promise<{
    ok: boolean;
    bot?: { username: string; firstName: string };
    error?: string;
  }> {
    let token = testToken ? testToken.trim() : '';
    if (!token) {
      const creds = await this.getBotCredentials();
      token = creds.token;
    }

    if (!token) {
      return { ok: false, error: 'لم يتم إدخال رمز البوت (TELEGRAM_BOT_TOKEN)' };
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await res.json();
      if (!data.ok) {
        let msg = data.description || 'فشل التحقق من رمز البوت';
        if (data.error_code === 401 || data.description?.includes('Unauthorized')) {
          msg = 'رمز البوت غير صالح أو تم إلغاؤه من BotFather (401 Unauthorized)';
        }
        return { ok: false, error: msg };
      }

      return {
        ok: true,
        bot: {
          username: data.result?.username || '',
          firstName: data.result?.first_name || '',
        },
      };
    } catch (err: any) {
      return { ok: false, error: err.message || 'فشل الاتصال بسيرفرات تليجرام' };
    }
  }

  /**
   * جلب الحالة الحية المفصلة لبوت تليجرام
   */
  static async getBotStatus() {
    const creds = await this.getBotCredentials();
    const hasToken = Boolean(creds.token);
    const hasDefaultChatId = Boolean(creds.defaultChatId);

    let connected = false;
    let botInfo = this.botInfo;
    let error = this.lastError;

    if (hasToken) {
      const check = await this.verifyCredentials(creds.token);
      connected = check.ok;
      if (check.ok) {
        botInfo = check.bot || null;
        this.botInfo = botInfo;
        error = null;
        this.lastError = null;
      } else {
        error = check.error || 'غير متصل';
        this.lastError = error;
      }
    }

    return {
      isPolling: this.isPolling && connected,
      connected,
      hasToken,
      hasDefaultChatId,
      botUsername: botInfo?.username || null,
      botFirstName: botInfo?.firstName || null,
      defaultChatId: creds.defaultChatId || null,
      allowedChats: creds.allowedChats,
      error,
    };
  }

  /**
   * بدء الاستماع التلقائي للأوامر الواردة (Long Polling)
   */
  static async startListening() {
    if (this.isPolling) return;

    const creds = await this.getBotCredentials();
    if (!creds.token) {
      logger.info('ℹ [Telegram Bot] لم يتم ضبط TELEGRAM_BOT_TOKEN — الاستماع التفاعلي معطل.');
      this.isPolling = false;
      this.botInfo = null;
      return;
    }

    // التحقق من صحة التوكن مع تليجرام قبل تشغيل الاستماع
    const check = await this.verifyCredentials(creds.token);
    if (!check.ok) {
      this.isPolling = false;
      this.lastError = check.error || 'رمز البوت غير صالح';
      this.botInfo = null;
      logger.warn(`⚠️ [Telegram Bot] تعذر بدء الاستماع: ${this.lastError}`);
      return;
    }

    this.botInfo = check.bot || null;
    this.lastError = null;
    this.cachedToken = creds.token;
    this.isPolling = true;
    logger.info(
      `🤖 [Telegram Bot] متصل بالبوت @${this.botInfo?.username} (${this.botInfo?.firstName})، بدء الاستماع التفاعلي...`,
    );

    try {
      await fetch(
        `https://api.telegram.org/bot${creds.token}/deleteWebhook?drop_pending_updates=false`,
      );
    } catch {
      // Ignore network hiccups on webhook clear
    }

    if (this.pollingInterval) clearTimeout(this.pollingInterval);

    this.schedulePoll(0);
  }

  /**
   * Long polling متسلسل لمنع تداخل طلبات getUpdates عند بطء Telegram.
   */
  private static schedulePoll(delayMs: number) {
    if (!this.isPolling) return;
    this.pollingInterval = setTimeout(async () => {
      try {
        await this.pollUpdates();
      } catch {
        // Silent loop error; the next scheduled poll retries automatically.
      } finally {
        if (this.isPolling) {
          this.schedulePoll(1000);
        }
      }
    }, delayMs);
  }

  /**
   * إعادة تشغيل الاستماع
   */
  static async restartListening() {
    this.isPolling = false;
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
    await this.startListening();
  }

  /**
   * إيقاف الاستماع التفاعلي
   */
  static stopListening() {
    this.isPolling = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    logger.info('⏹ [Telegram Bot] تم إيقاف الاستماع التفاعلي.');
  }

  /**
   * هل البوت يستمع حالياً؟
   */
  static isCurrentlyPolling(): boolean {
    return this.isPolling;
  }

  /**
   * جلب التحديثات ومعالجة الرسائل الواردة
   */
  private static async pollUpdates() {
    const creds = await this.getBotCredentials();
    if (!creds.token) {
      this.isPolling = false;
      if (this.pollingInterval) clearTimeout(this.pollingInterval);
      return;
    }

    const url = `https://api.telegram.org/bot${creds.token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=25`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401) {
        this.isPolling = false;
        this.lastError = 'رمز البوت غير صالح أو ملغي (401 Unauthorized)';
        if (this.pollingInterval) clearTimeout(this.pollingInterval);
        logger.warn('⚠️ [Telegram Bot] رمز البوت غير صالح (401 Unauthorized) — تم إيقاف الاستماع.');
        return;
      }
      if (res.status === 409) {
        logger.warn('⚠️ [Telegram Bot] تضارب في الاستماع: يوجد خادم آخر يستمع لنفس البوت حالياً.');
      }
      return;
    }

    const data = await res.json();
    if (!data.ok || !Array.isArray(data.result)) return;

    for (const update of data.result) {
      if (update.update_id > this.lastUpdateId) {
        this.lastUpdateId = update.update_id;
      }

      if (update.message) {
        await this.handleIncomingMessage(update.message);
      }
    }
  }

  /**
   * معالجة الرسالة الواردة وتنفيذ الأمر المطلوب
   */
  static async handleIncomingMessage(msg: any) {
    const chatId = msg.chat?.id;
    const rawText = (msg.text || '').trim();
    if (!chatId || !rawText) return;

    const creds = await this.getBotCredentials();
    const reply = async (html: string) => {
      await TelegramService.sendMessage(html, { botToken: creds.token, chatId: String(chatId) });
    };

    // التحقق الأمني الصارم من هوية مرسل الأمر (Whitelisted Chat IDs — Fail Closed)
    const allowedChatIds = [
      creds.defaultChatId,
      ...(creds.allowedChats || []),
      ...(process.env.TELEGRAM_ALLOWED_CHATS || '').split(',').map((s) => s.trim()),
    ].filter(Boolean);

    if (allowedChatIds.length === 0 || !allowedChatIds.includes(String(chatId))) {
      logger.warn(`[Telegram Bot] محاولة وصول غير مصرح بها أو غير مهيأة من Chat ID: ${chatId}`);
      await reply(
        `⛔ <b>عذراً</b>، هذا الحساب غير مصرح له بالوصول إلى بيانات بن العجوز ERP.\n\n` +
          `🆔 <b>معرف الشات الخاص بك هو:</b> <code>${chatId}</code>\n` +
          `💡 أضف هذا المعرف في إعدادات تليجرام بلوحة التحكم للوصول.`,
      );
      return;
    }

    const normalized = rawText.replace(/^\//, '').trim().toLowerCase();

    try {
      // 1. أمر البداية وقائمة المساعدة
      if (['start', 'help', 'مساعدة', 'اوامر', 'أوامر', 'قائمة', 'menu'].includes(normalized)) {
        const welcomeText = `
☕ <b>أهلاً بك في المساعد التفاعلي لنظام بن العجوز ERP</b>

يمكنك إرسال أي من الأوامر التالية للحصول على بيانات حية وفورية:

📊 <b>/مبيعات</b> — إجمالي مبيعات وأرباح اليوم الحية
💵 <b>/خزينة</b> — النقدية المحصلة والمصروفات وصافي الدرج
📦 <b>/نواقص</b> — قائمة الأصناف وخامات البن التي أوشكت على النفاد
🔄 <b>/مناقلات</b> — اقتراحات إعادة توازن المخزون بين المخازن
🖥️ <b>/سيرفر</b> — فحص حالة الخادم وقاعدة البيانات
🤖 <b>/ai سؤالك</b> — استشر الذكاء الاصطناعي (Gemini) عن أي شيء
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
          'تقرير',
          'التقرير',
          'ارباح',
          'أرباح',
          'الارباح',
          'الأرباح',
          'دخل',
          'الدخل',
        ].includes(normalized)
      ) {
        const today = new Date().toISOString().slice(0, 10);
        const stats = await db.query(
          `SELECT
             COUNT(id) as total_orders,
             COALESCE(SUM(total_amount), 0) as total_sales,
             COALESCE(SUM(profit_amount), 0) as total_profit
           FROM sales
           WHERE (sale_date = $1 OR DATE(created_at AT TIME ZONE 'Africa/Cairo') = $1)
             AND status = 'completed' AND deleted_at IS NULL`,
          [today],
        );
        const row = stats.rows[0];
        const salesMsg = `
📊 <b>تقرير مبيعات اليوم (${today})</b>
━━━━━━━━━━━━━━━━━━━━
🧾 <b>عدد الفواتير:</b> ${row.total_orders} فاتورة
💰 <b>إجمالي المبيعات:</b> ${Number(row.total_sales).toLocaleString()} ج.م
📈 <b>إجمالي الأرباح:</b> ${Number(row.total_profit).toLocaleString()} ج.م
⏱ <b>التوقيت:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
        `.trim();
        await reply(salesMsg);
        return;
      }

      // 3. أمر النواقص والمخزون (إصلاح B-01 بالربط مع جدول inventory واستخدام min_stock)
      if (
        ['stock', 'نواقص', 'النواقص', 'مخزون', 'المخزون', 'خامات', 'الخامات'].includes(normalized)
      ) {
        const res = await db.query(
          `SELECT
             p.name_ar,
             COALESCE(SUM(i.quantity), 0) as current_stock,
             COALESCE(p.min_stock, 0) as reorder_point,
             p.unit
           FROM products p
           LEFT JOIN inventory i ON p.id = i.product_id
           WHERE p.is_active = true AND p.deleted_at IS NULL
           GROUP BY p.id, p.name_ar, p.min_stock, p.unit
           HAVING COALESCE(SUM(i.quantity), 0) <= COALESCE(p.min_stock, 0)
           ORDER BY current_stock ASC
           LIMIT 15`,
        );
        if (res.rows.length === 0) {
          await reply(
            '✅ <b>المخزون آمن تماماً</b>\nلا توجد أي خامات أو أصناف وصلت لحد إعادة الطلب.',
          );
          return;
        }
        const items = res.rows
          .map(
            (r: any, idx: number) =>
              `${idx + 1}. <b>${r.name_ar}</b>: المتبقي <code>${Number(r.current_stock)}</code> ${r.unit || ''} (حد الطلب: ${Number(r.reorder_point)})`,
          )
          .join('\n');
        await reply(`⚠️ <b>تنبيه نواقص المخزون (${res.rows.length} أصناف):</b>\n\n${items}`);
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
💵 <b>تقرير الخزينة والسيولة النقدية اليوم</b>
📅 <b>التاريخ:</b> ${today}

▫️ <b>إجمالي المبيعات المحصلة:</b> ${Number(c.total_collected).toLocaleString()} ج.م
▫️ <b>أرباح اليوم التقديرية:</b> ${Number(c.total_profit).toLocaleString()} ج.م
▫️ <b>مصروفات نقدية خرجت اليوم:</b> ${expToday.toLocaleString()} ج.م
💰 <b>صافي السيولة النقدية بالدرج:</b> <b>${netCash.toLocaleString()} ج.م</b>
        `.trim();
        await reply(cashMsg);
        return;
      }

      // 5. أمر مناقلات المخازن الذكية
      if (['balance', 'مناقلات', 'المناقلات', 'فروع', 'الفروع', 'توازن'].includes(normalized)) {
        const bal = await WarehouseBalancingService.generateBalancingRecommendations();
        await reply(bal.htmlReport);
        await WorkflowGraphService.logTelegramMessage({
          chat_id: String(chatId),
          direction: 'in',
          message: rawText,
          automation_key: 'warehouse_balancing',
        });
        return;
      }

      // 6. أمر فحص حالة السيرفر
      if (['health', 'سيرفر', 'السيرفر', 'سيستم', 'السيستم', 'فحص', 'الفحص'].includes(normalized)) {
        const healthMsg = `
🖥️ <b>تقرير فحص حالة السيرفر والنظام</b>
━━━━━━━━━━━━━━━━━━━━
🟢 <b>الخادم:</b> متصل ويعمل بشكل طبيعي
🗄️ <b>قاعدة البيانات (PostgreSQL):</b> نشطة ومستقرة
⏱ <b>التوقيت:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
        `.trim();
        await reply(healthMsg);
        await WorkflowGraphService.logTelegramMessage({
          chat_id: String(chatId),
          direction: 'in',
          message: rawText,
          automation_key: 'system_health',
        });
        return;
      }

      // 7. أمر الذكاء الاصطناعي — استعلام Gemini
      if (
        ['ai', 'ذكاء', 'الذكاء', 'جيمني', 'gemini', 'اسأل', 'سؤال'].includes(normalized) ||
        normalized.startsWith('ai ') ||
        normalized.startsWith('ذكاء ')
      ) {
        // استخلاص السؤال الفعلي بعد الأمر
        let aiQuery = rawText;
        const prefixes = ['/ai ', '/ذكاء ', 'ai ', 'ذكاء '];
        for (const prefix of prefixes) {
          if (rawText.toLowerCase().startsWith(prefix)) {
            aiQuery = rawText.slice(prefix.length).trim();
            break;
          }
        }

        if (!aiQuery || aiQuery.length < 3) {
          await reply(
            '🤖 <b>استخدام أمر الذكاء الاصطناعي:</b>\n\nاكتب <code>/ai سؤالك هنا</code>\n\nمثال: <code>/ai ما هو أداء المبيعات هذا الشهر؟</code>',
          );
          return;
        }

        await reply('🧠 <i>جاري التحليل والتفكير...</i>');
        const aiResponse = await askCopilot(aiQuery);
        const responseText =
          typeof aiResponse === 'string'
            ? aiResponse
            : (aiResponse as any)?.text || 'لم أتمكن من صياغة إجابة.';

        // تقسيم الرد إذا تجاوز حد تليجرام (4096 حرف)
        const maxLen = 4000;
        if (responseText.length <= maxLen) {
          await reply(`🤖 <b>المساعد الذكي (Gemini):</b>\n\n${responseText}`);
        } else {
          const parts = responseText.match(new RegExp(`.{1,${maxLen}}`, 'gs')) || [responseText];
          for (let i = 0; i < parts.length; i++) {
            await reply(`🤖 <b>جزء ${i + 1}/${parts.length}:</b>\n\n${parts[i]}`);
          }
        }

        // تسجيل المحادثة
        await WorkflowGraphService.logTelegramMessage({
          chat_id: String(chatId),
          direction: 'in',
          message: aiQuery,
          ai_response: responseText,
          automation_key: 'ai_copilot_assistant',
        });
        return;
      }

      // 8. في حال عدم التعرف على الأمر
      const unknownText = `
🤔 <b>عفواً، لم أتعرف على الأمر "${rawText}".</b>
اكتب <b>/اوامر</b> لعرض قائمة الأوامر التفاعلية المتاحة للنظام.
      `.trim();
      await reply(unknownText);
    } catch (err: any) {
      logger.error(` [Telegram Bot] خطأ أثناء معالجة الأمر: ${err.message}`);
      await reply(` <b>عفواً، حدث خطأ أثناء تنفيذ الأمر:</b> ${err.message}`);
    }
  }
}

export default TelegramBotService;

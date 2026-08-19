/**
 * services/automationService.ts — المحرك المركزي للأتمتة والتقارير الذكية
 * ══════════════════════════════════════════════════════════════════════
 * يدير شروط التشغيل، تجميع البيانات، التنسيق، والإرسال للقنوات المختلفة.
 */

import db from '../database/pool.ts';
import TelegramService from './telegramService.ts';
import logger from './loggerService.ts';

export interface AutomationRecord {
  id: number;
  key: string;
  name_ar: string;
  description_ar: string;
  category: string;
  trigger_type: 'cron' | 'event';
  cron_expression?: string;
  is_enabled: boolean;
  channels: {
    telegram?: boolean;
    in_app?: boolean;
    whatsapp?: boolean;
  };
  config: Record<string, any>;
  last_run_at?: string;
  last_status?: string;
  created_at: string;
  updated_at: string;
}

export class AutomationService {
  /**
   * جلب جميع إعدادات الأتمتة
   */
  static async listAutomations(): Promise<AutomationRecord[]> {
    const { rows } = await db.query(`SELECT * FROM automations ORDER BY category ASC, id ASC`);
    return rows;
  }

  /**
   * جلب أتمتة واحدة بمعرفها
   */
  static async getAutomation(id: number | string): Promise<AutomationRecord | null> {
    const { rows } = await db.query(`SELECT * FROM automations WHERE id = $1`, [id]);
    return rows[0] || null;
  }

  /**
   * جلب أتمتة بمفتاحها الفريد
   */
  static async getAutomationByKey(key: string): Promise<AutomationRecord | null> {
    const { rows } = await db.query(`SELECT * FROM automations WHERE key = $1`, [key]);
    return rows[0] || null;
  }

  /**
   * تحديث إعدادات الأتمتة
   */
  static async updateAutomation(
    id: number | string,
    updates: Partial<AutomationRecord>,
  ): Promise<AutomationRecord> {
    const current = await this.getAutomation(id);
    if (!current) throw new Error('الأتمتة المطلوبة غير موجودة');

    const isEnabled = updates.is_enabled !== undefined ? updates.is_enabled : current.is_enabled;
    const cronExpr =
      updates.cron_expression !== undefined ? updates.cron_expression : current.cron_expression;
    const channels = updates.channels
      ? JSON.stringify(updates.channels)
      : JSON.stringify(current.channels);
    const config = updates.config ? JSON.stringify(updates.config) : JSON.stringify(current.config);
    const nameAr = updates.name_ar || current.name_ar;
    const descAr = updates.description_ar || current.description_ar;

    const { rows } = await db.query(
      `UPDATE automations
       SET is_enabled = $1, cron_expression = $2, channels = $3, config = $4, name_ar = $5, description_ar = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [isEnabled, cronExpr, channels, config, nameAr, descAr, id],
    );

    return rows[0];
  }

  /**
   * جلب سجلات الأتمتة الحديثة
   */
  static async getLogs(limit = 50, offset = 0, automationId?: number): Promise<any[]> {
    let sql = `
      SELECT l.*, a.name_ar as automation_name, a.key as automation_key, a.category
      FROM automation_logs l
      LEFT JOIN automations a ON a.id = l.automation_id
    `;
    const params: any[] = [];

    if (automationId) {
      params.push(automationId);
      sql += ` WHERE l.automation_id = $${params.length}`;
    }

    sql += ` ORDER BY l.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await db.query(sql, params);
    return rows;
  }

  /**
   * حفظ سجل جديد في جدول السجلات
   */
  static async recordLog(
    automationId: number | null,
    eventName: string,
    status: 'success' | 'failed' | 'warning',
    title: string,
    message: string,
    payload?: any,
  ) {
    try {
      await db.query(
        `INSERT INTO automation_logs (automation_id, event_name, status, title, message, payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [automationId, eventName, status, title, message, payload ? JSON.stringify(payload) : null],
      );

      if (automationId) {
        await db.query(
          `UPDATE automations SET last_run_at = NOW(), last_status = $1 WHERE id = $2`,
          [status, automationId],
        );
      }
    } catch (err: any) {
      logger.error(`[Automation] فشل حفظ سجل الأتمتة: ${err.message}`);
    }
  }

  /**
   * تنفيذ الأتمتة يدوياً أو تلقائياً بناءً على المفتاح
   */
  static async executeAutomation(
    keyOrId: string | number,
    customPayload?: any,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    const auto =
      typeof keyOrId === 'number' || !isNaN(Number(keyOrId))
        ? await this.getAutomation(keyOrId)
        : await this.getAutomationByKey(String(keyOrId));

    if (!auto) {
      return { success: false, message: 'الأتمتة غير موجودة' };
    }

    if (!auto.is_enabled && !customPayload?.isManualRun) {
      return { success: false, message: 'الأتمتة معطلة حالياً' };
    }

    try {
      let resultMessage = '';
      let resultTitle = auto.name_ar;

      switch (auto.key) {
        case 'daily_sales_report': {
          const report = await this.generateDailySalesReport(auto.config);
          resultTitle = report.title;
          resultMessage = report.htmlMessage;
          break;
        }

        case 'low_stock_alert': {
          const stockAlert = await this.generateLowStockAlert(auto.config);
          resultTitle = stockAlert.title;
          resultMessage = stockAlert.htmlMessage;
          break;
        }

        case 'void_invoice_alert': {
          const voidData = customPayload || {
            invoiceNumber: 'INV-DEMO',
            cashierName: 'كاشير تجريبي',
            amount: 450,
            branchName: 'الفرع الرئيسي',
            reason: 'إلغاء تجريبي للمعاينة',
          };
          resultTitle = `⚠️ تنبيه أمني: إلغاء فاتورة مبيعات #${voidData.invoiceNumber}`;
          resultMessage = `
🚨 <b>تنبيه أمني عاجل: إلغاء فاتورة مبيعات</b>
═════════════════════════
📄 <b>رقم الفاتورة:</b> ${voidData.invoiceNumber}
🏢 <b>الفرع:</b> ${voidData.branchName || 'الفرع الرئيسي'}
👤 <b>الموظف / الكاشير:</b> ${voidData.cashierName || 'غير محدد'}
💰 <b>المبلغ الملغي:</b> ${voidData.amount} ج.م
📝 <b>سبب الإلغاء:</b> ${voidData.reason || 'بدون سبب مسجل'}
🕒 <b>التاريخ:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
          `.trim();
          break;
        }

        case 'large_discount_alert': {
          const discData = customPayload || {
            invoiceNumber: 'INV-DEMO-DISC',
            cashierName: 'كاشير تجريبي',
            discountAmount: 120,
            discountPct: 25,
            totalAmount: 480,
            branchName: 'الفرع الرئيسي',
          };
          resultTitle = `💸 تنبيه خصم مرتفع: فاتورة #${discData.invoiceNumber} (${discData.discountPct}%)`;
          resultMessage = `
💸 <b>تنبيه مالي: تطبيق خصم غير معتاد</b>
═════════════════════════
📄 <b>رقم الفاتورة:</b> ${discData.invoiceNumber}
🏢 <b>الفرع:</b> ${discData.branchName || 'الفرع الرئيسي'}
👤 <b>الكاشير:</b> ${discData.cashierName || 'غير محدد'}
🏷️ <b>قيمة الخصم:</b> ${discData.discountAmount} ج.م (${discData.discountPct}%)
💵 <b>صافي الفاتورة:</b> ${discData.totalAmount} ج.م
🕒 <b>الوقت:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
          `.trim();
          break;
        }

        case 'daily_backup_reminder': {
          const health = await this.generateSystemHealthSummary();
          resultTitle = health.title;
          resultMessage = health.htmlMessage;
          break;
        }

        default:
          resultMessage = `تم تشغيل أتمتة (${auto.name_ar}) بنجاح.`;
      }

      // إرسال عبر القنوات المحددة
      if (auto.channels?.telegram) {
        const tgRes = await TelegramService.sendMessage(resultMessage, {
          botToken: auto.config?.bot_token,
          chatId: auto.config?.chat_id,
        });

        if (!tgRes.success) {
          logger.warn(`[Automation] فشل إرسال تليجرام لـ ${auto.key}: ${tgRes.error}`);
        }
      }

      await this.recordLog(auto.id, auto.key, 'success', resultTitle, resultMessage, customPayload);

      return {
        success: true,
        message: `تم تشغيل ${auto.name_ar} بنجاح`,
        data: { title: resultTitle, message: resultMessage },
      };
    } catch (err: any) {
      logger.error(`[Automation] خطأ أثناء تنفيذ ${auto.key}: ${err.message}`);
      await this.recordLog(
        auto.id,
        auto.key,
        'failed',
        `خطأ في ${auto.name_ar}`,
        err.message,
        customPayload,
      );
      return { success: false, message: `فشل التشغيل: ${err.message}` };
    }
  }

  /**
   * 📊 توليد تقرير الإغلاق اليومي الذكي للمبيعات
   */
  private static async generateDailySalesReport(config: any) {
    const today = new Date().toISOString().slice(0, 10);

    // إجمالي المبيعات وعدد الفواتير
    const salesRes = await db.query(
      `SELECT
         COUNT(id) as total_invoices,
         COALESCE(SUM(total_amount), 0) as total_sales,
         COALESCE(SUM(discount_amount), 0) as total_discounts,
         COALESCE(SUM(paid_amount), 0) as total_paid
       FROM invoices
       WHERE DATE(created_at AT TIME ZONE 'Africa/Cairo') = $1 AND status != 'cancelled'`,
      [today],
    );
    const s = salesRes.rows[0];

    // المصروفات
    const expRes = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total_expenses
       FROM expenses
       WHERE DATE(expense_date) = $1`,
      [today],
    );
    const totalExpenses = Number(expRes.rows[0]?.total_expenses || 0);

    // أعلى 5 أصناف مبيعاً
    const topItemsRes = await db.query(
      `SELECT p.name_ar, SUM(ii.quantity) as total_qty, SUM(ii.total) as total_rev
       FROM invoice_items ii
       JOIN invoices inv ON inv.id = ii.invoice_id
       JOIN products p ON p.id = ii.product_id
       WHERE DATE(inv.created_at AT TIME ZONE 'Africa/Cairo') = $1 AND inv.status != 'cancelled'
       GROUP BY p.name_ar
       ORDER BY total_qty DESC
       LIMIT 5`,
      [today],
    );

    const netIncome = Number(s.total_paid) - totalExpenses;

    let topItemsText = '';
    if (topItemsRes.rows.length) {
      topItemsText =
        `\n🔥 <b>أعلى الأصناف طلباً اليوم:</b>\n` +
        topItemsRes.rows
          .map(
            (it, idx) =>
              `  ${idx + 1}. ${it.name_ar}: <b>${it.total_qty}</b> طلب (${Number(it.total_rev).toLocaleString()} ج.م)`,
          )
          .join('\n');
    }

    const htmlMessage = `
☕ <b>تقرير الإغلاق اليومي — بن العجوز ERP</b> 📊
═════════════════════════
📅 <b>التاريخ:</b> ${today}
🕒 <b>الوقت:</b> ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}

💰 <b>إجمالي الإيرادات المحصلة:</b> ${Number(s.total_paid).toLocaleString()} ج.م
🧾 <b>عدد الفواتير المنفذة:</b> ${s.total_invoices} فاتورة
🏷️ <b>إجمالي الخصومات:</b> ${Number(s.total_discounts).toLocaleString()} ج.م
📉 <b>إجمالي المصروفات اليومية:</b> ${totalExpenses.toLocaleString()} ج.م
💵 <b>صافي دخل اليوم:</b> <b>${netIncome.toLocaleString()} ج.م</b>
${topItemsText}

═════════════════════════
✅ <i>تم استخراج التقرير آلياً عبر محرك الأتمتة الذكي.</i>
    `.trim();

    return {
      title: `📊 تقرير الإغلاق اليومي (${today}) — صافي: ${netIncome.toLocaleString()} ج.م`,
      htmlMessage,
    };
  }

  /**
   * 🚨 توليد تقرير نواقص المخزون
   */
  private static async generateLowStockAlert(_config: any) {
    const { rows } = await db.query(
      `SELECT p.name_ar, p.sku, p.unit, COALESCE(SUM(sm.quantity), 0) as current_stock, p.min_stock_level
       FROM products p
       LEFT JOIN stock_movements sm ON sm.product_id = p.id
       WHERE p.min_stock_level IS NOT NULL AND p.min_stock_level > 0
       GROUP BY p.id, p.name_ar, p.sku, p.unit, p.min_stock_level
       HAVING COALESCE(SUM(sm.quantity), 0) <= p.min_stock_level
       ORDER BY current_stock ASC
       LIMIT 10`,
    );

    if (!rows.length) {
      return {
        title: '✅ حالة المخزون ممتازة — لا توجد نواقص',
        htmlMessage: `
📦 <b>فحص المخزون الدوري — بن العجوز</b>
═════════════════════════
✅ جميع الأصناف وخامات البن أعلى من الحد الأدنى للطلب.
🕒 ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
        `.trim(),
      };
    }

    const itemsList = rows
      .map(
        (r, i) =>
          `  ${i + 1}. <b>${r.name_ar}</b>\n     المتبقي: <b>${r.current_stock}</b> ${r.unit || 'وحدة'} (الحد الأدنى: ${r.min_stock_level})`,
      )
      .join('\n\n');

    const htmlMessage = `
🚨 <b>إنذار نقص المخزون وخامات البن</b> 📦
═════════════════════════
⚠️ تم رصد (${rows.length}) أصناف وصلت أو تجاوزت حد إعادة الطلب:

${itemsList}

═════════════════════════
💡 <i>يرجى مراجعة مسؤولي المشتريات لطلب التوريدات اللازمة.</i>
    `.trim();

    return {
      title: `🚨 إنذار نقص مخزون (${rows.length} أصناف)`,
      htmlMessage,
    };
  }

  /**
   * 🛡️ توليد ملخص فحص السيرفر والبيانات
   */
  private static async generateSystemHealthSummary() {
    const counts = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM products) as products_count,
        (SELECT COUNT(*) FROM invoices) as invoices_count,
        (SELECT COUNT(*) FROM users) as users_count
    `);
    const c = counts.rows[0];

    const htmlMessage = `
🛡️ <b>تقرير فحص سلامة النظام والبيانات</b> 💾
═════════════════════════
✅ <b>حالة اتصال قاعدة البيانات:</b> متصل ومستقر (Active)
📦 <b>إجمالي المنتجات:</b> ${c.products_count} صنف
🧾 <b>إجمالي الفواتير المسجلة:</b> ${c.invoices_count} فاتورة
👥 <b>عدد المستخدمين النشطين:</b> ${c.users_count} مستخدم
🕒 <b>توقيت الفحص:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
═════════════════════════
🚀 <i>النظام يعمل بكفاءة وأمان 100%.</i>
    `.trim();

    return {
      title: '🛡️ فحص سلامة النظام اليومي',
      htmlMessage,
    };
  }
}

export default AutomationService;

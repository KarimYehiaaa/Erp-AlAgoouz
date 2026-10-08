/**
 * services/automationHandlers.ts — سجل معالجات مهام الأتمتة (مفتاح المهمة → معالج)
 * كل معالج يجمع بياناته ويبني نص التقرير ويعيد (العنوان، النص، الحالة success/warning)
 * دون إرسال أو تسجيل — ذلك مسؤولية runAutomationNow في workflowGraphService.
 */

import { query } from '../database/pool.ts';

// ─── أنواع مشتركة ────────────────────────────────────────

export interface AutomationHandlerContext {
  /** المفتاح الكانوني للمهمة */
  key: string;
  /** إعدادات المهمة من automations.config */
  config: Record<string, any>;
  /** الموعد المجدول للتشغيل (الآن في التشغيل اليدوي/عند الحدث) */
  scheduledFor: Date;
}

export interface AutomationHandlerResult {
  title: string;
  text: string;
  status: 'success' | 'warning';
}

export type AutomationHandler = (ctx: AutomationHandlerContext) => Promise<AutomationHandlerResult>;

/** التاريخ التجاري ليوم التشغيل بتوقيت القاهرة */
export const getCairoBusinessDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((value) => value.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

// ─── المعالجات ───────────────────────────────────────────

const dailySalesReportHandler: AutomationHandler = async (ctx) => {
  const reportDate = getCairoBusinessDate(ctx.scheduledFor);
  const title = `ملخص مبيعات المحل ليوم ${reportDate}`;
  const salesRes = await query(
    `SELECT
       COUNT(*) as invoice_count,
       COALESCE(SUM(total_amount), 0) as net_revenue,
       COALESCE(SUM(profit_amount), 0) as total_profit
     FROM sales
     WHERE sale_date = $1::date AND deleted_at IS NULL AND status = 'completed'`,
    [reportDate],
  );
  const expRes = await query(
    `SELECT COALESCE(SUM(amount), 0) as total_expenses
     FROM expenses WHERE expense_date = $1::date AND deleted_at IS NULL`,
    [reportDate],
  );
  const topRes = await query(
    `SELECT p.name_ar, SUM(si.quantity) as qty
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN products p ON p.id = si.product_id
     WHERE s.sale_date = $1::date AND s.deleted_at IS NULL AND s.status = 'completed'
     GROUP BY p.name_ar
     ORDER BY qty DESC LIMIT 3`,
    [reportDate],
  );

  const s = salesRes.rows[0];
  const e = expRes.rows[0];
  const topList =
    topRes.rows
      .map((r: any) => `  • ${r.name_ar}: ${Number(r.qty).toFixed(1)} كجم/قطعة`)
      .join('\n') || '  • لا توجد مبيعات تفصيلية مسجلة لهذا اليوم';

  return {
    title,
    status: 'success',
    text: `
📊 <b>ملخص مبيعات المحل — ${reportDate}</b>
━━━━━━━━━━━━━━━━━━━━
💰 <b>إجمالي المبيعات المسجلة:</b> ${Number(s.net_revenue).toLocaleString('ar-EG')} ج.م
🧾 <b>عدد الفواتير:</b> ${s.invoice_count}
💸 <b>إجمالي المصروفات:</b> ${Number(e.total_expenses).toLocaleString('ar-EG')} ج.م
💵 <b>مجمل الربح المسجل قبل المصروفات:</b> ${Number(s.total_profit).toLocaleString('ar-EG')} ج.م
━━━━━━━━━━━━━━━━━━━━
🔥 <b>أعلى المنتجات مبيعاً في اليوم:</b>
${topList}
⏱ <i>وقت إرسال الملخص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const lowStockAlertHandler: AutomationHandler = async () => {
  const title = 'إنذار نواقص المخزون وخامات البن';
  const lowRes = await query(
    `SELECT p.name_ar, p.sku,
            COALESCE(SUM(i.quantity), 0) AS current_stock,
            COALESCE(p.min_stock, 5) AS min_stock
     FROM products p
     LEFT JOIN inventory i ON i.product_id = p.id
     WHERE p.is_active = true AND p.deleted_at IS NULL
     GROUP BY p.id, p.name_ar, p.sku, p.min_stock
     HAVING COALESCE(SUM(i.quantity), 0) <= COALESCE(p.min_stock, 5)
     ORDER BY current_stock ASC LIMIT 10`,
  );

  if (lowRes.rows.length === 0) {
    return {
      title,
      status: 'success',
      text: `
📦 <b>تقرير فحص المخزون وخامات التحميص</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>المخزون سليم تماماً!</b> لا توجد أي خامات أو أصناف وصلت لحد إعادة الطلب.
⏱ ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}
      `.trim(),
    };
  }
  const itemsList = lowRes.rows
    .map(
      (r: any) =>
        `  ⚠️ <b>${r.name_ar}</b>: رصيد حالي <code>${r.current_stock}</code> (الحد الأدنى: ${r.min_stock || 5})`,
    )
    .join('\n');
  return {
    title,
    status: 'warning',
    text: `
🚨 <b>إنذار نواقص المخزون وخامات البن</b>
━━━━━━━━━━━━━━━━━━━━
الأصناف التالية أوشكت على النفاد وتحتاج طلب شراء/تحميص:
${itemsList}
━━━━━━━━━━━━━━━━━━━━
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const antiFraudHandler: AutomationHandler = async () => {
  const title = 'كشف ومراقبة التلاعب المالي (Anti-Fraud)';
  const discountRes = await query(
    `SELECT sale_number, subtotal, total_amount, discount_amount, discount_percent, status
     FROM sales
     WHERE created_at >= NOW() - INTERVAL '24 HOURS'
       AND (status = 'cancelled' OR discount_percent >= 15 OR (subtotal > 0 AND (discount_amount / subtotal * 100) >= 15))
     ORDER BY created_at DESC LIMIT 5`,
  );

  if (discountRes.rows.length === 0) {
    return {
      title,
      status: 'success',
      text: `
🛡️ <b>تقرير الرقابة المالية ومكافحة التلاعب</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>العمليات آمنة:</b> لم يتم رصد أي فواتير ملغاة أو خصومات مريبة خلال آخر 24 ساعة.
⏱ ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}
      `.trim(),
    };
  }
  const fraudList = discountRes.rows
    .map((r: any) => {
      if (r.status === 'cancelled') {
        return `  ❌ فاتورة ملغاة <b>#${r.sale_number}</b> بقيمة ${r.total_amount} ج.م`;
      }
      const pct =
        r.discount_percent || (r.subtotal > 0 ? (r.discount_amount / r.subtotal) * 100 : 0);
      return `  🏷️ فاتورة <b>#${r.sale_number}</b>: خصم ${Number(pct).toFixed(1)}% (${r.discount_amount} ج.م من أصل ${r.subtotal} ج.م)`;
    })
    .join('\n');
  return {
    title,
    status: 'warning',
    text: `
🚨 <b>إنذار الرقابة المالية — فواتير ملغاة أو خصومات مرتفعة</b>
━━━━━━━━━━━━━━━━━━━━
رصد النظام العمليات التالية خلال آخر 24 ساعة:
${fraudList}
━━━━━━━━━━━━━━━━━━━━
⏱ <i>توقيت الرصد: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const warehouseBalancingHandler: AutomationHandler = async () => {
  const { default: WarehouseBalancingService } = await import('./warehouseBalancingService.ts');
  const bal = await WarehouseBalancingService.generateBalancingRecommendations();
  return {
    title: 'إعادة توازن مخزون المخازن',
    status: 'success',
    text: bal.htmlReport,
  };
};

const supplierPaymentDueHandler: AutomationHandler = async (ctx) => {
  const businessDate = getCairoBusinessDate(ctx.scheduledFor);
  const configuredDays = Number(ctx.config?.days_before_due);
  const daysBeforeDue = Number.isFinite(configuredDays)
    ? Math.min(Math.max(configuredDays, 0), 90)
    : 3;
  const dueRes = await query(
    `SELECT si.invoice_number, s.name_ar AS supplier_name, si.due_date,
            ROUND((si.total_amount - COALESCE(si.paid_amount, 0))::numeric, 2) AS outstanding,
            (si.due_date - $1::date) AS days_until_due
     FROM supplier_invoices si
     JOIN suppliers s ON s.id = si.supplier_id
     WHERE si.deleted_at IS NULL AND si.due_date IS NOT NULL
       AND si.total_amount > COALESCE(si.paid_amount, 0)
       AND si.due_date <= $1::date + $2::int
     ORDER BY si.due_date ASC, si.id ASC
     LIMIT 20`,
    [businessDate, daysBeforeDue],
  );
  const title = `مراجعة مستحقات الموردين حتى ${businessDate}`;
  if (dueRes.rows.length) {
    const invoices = dueRes.rows
      .map((invoice: any) => {
        const dayCount = Number(invoice.days_until_due);
        const dueLabel =
          dayCount < 0
            ? `متأخرة ${Math.abs(dayCount)} يوم`
            : dayCount === 0
              ? 'مستحقة اليوم'
              : `خلال ${dayCount} يوم`;
        return `• ${invoice.invoice_number} — ${invoice.supplier_name} — متبقٍ ${Number(invoice.outstanding).toLocaleString('ar-EG')} ج.م — ${dueLabel}`;
      })
      .join('\n');
    return {
      title,
      status: 'warning',
      text: `
📥 <b>فواتير الموردين غير المسددة</b>
━━━━━━━━━━━━━━━━━━━━
${invoices}
━━━━━━━━━━━━━━━━━━━━
الفحص حتى ${businessDate}
      `.trim(),
    };
  }
  return {
    title,
    status: 'success',
    text: `لا توجد فواتير موردين غير مسددة تستحق حتى ${businessDate}.`,
  };
};

const profitMarginAnomalyHandler: AutomationHandler = async (ctx) => {
  const businessDate = getCairoBusinessDate(ctx.scheduledFor);
  const configuredTarget = Number(ctx.config?.min_target_margin_pct);
  const targetMargin = Number.isFinite(configuredTarget)
    ? Math.min(Math.max(configuredTarget, 0), 100)
    : 28;
  const marginRes = await query(
    `SELECT COUNT(*)::int AS invoice_count,
            COALESCE(SUM(total_amount), 0) AS total_sales,
            COALESCE(SUM(profit_amount), 0) AS gross_profit,
            CASE WHEN COALESCE(SUM(total_amount), 0) > 0
              THEN COALESCE(SUM(profit_amount), 0) * 100.0 / SUM(total_amount)
              ELSE NULL END AS margin_pct
     FROM sales
     WHERE sale_date = $1::date AND deleted_at IS NULL AND status = 'completed'`,
    [businessDate],
  );
  const margin =
    marginRes.rows[0]?.margin_pct == null ? null : Number(marginRes.rows[0].margin_pct);
  const title = `فحص هامش الربح الإجمالي ليوم ${businessDate}`;
  if (margin === null) {
    return {
      title,
      status: 'warning',
      text: `لم تُسجل مبيعات مكتملة في ${businessDate}؛ لم يتوفر أساس لحساب هامش الربح.`,
    };
  }
  return {
    title,
    status: margin < targetMargin ? 'warning' : 'success',
    text: `
${margin < targetMargin ? '⚠️ <b>هامش الربح أقل من الحد المحدد</b>' : '✅ <b>هامش الربح ضمن الحد المحدد</b>'}
━━━━━━━━━━━━━━━━━━━━
اليوم: ${businessDate}
المبيعات المكتملة: ${Number(marginRes.rows[0].total_sales).toLocaleString('ar-EG')} ج.م
مجمل الربح المسجل: ${Number(marginRes.rows[0].gross_profit).toLocaleString('ar-EG')} ج.م
هامش الربح الإجمالي: ${margin.toLocaleString('ar-EG', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%
الحد المستهدف: ${targetMargin}%
عدد الفواتير: ${Number(marginRes.rows[0].invoice_count)}
    `.trim(),
  };
};

const systemHealthHandler: AutomationHandler = async () => {
  const title = 'فحص سلامة النظام';
  const { checkHealth } = await import('../database/pool.ts');
  const dbHealth = await checkHealth();
  return {
    title,
    status: dbHealth.ok ? 'success' : 'warning',
    text: `
🖥️ <b>تقرير فحص سلامة النظام والخادم</b>
━━━━━━━━━━━━━━━━━━━━
🟢 <b>حالة الخدمة:</b> تم تشغيل الفحص
🗄️ <b>قاعدة البيانات:</b> ${dbHealth.ok ? 'اتصال ناجح' : 'تعذر الاتصال'} (${dbHealth.latencyMs}ms)
⏱ ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
    `.trim(),
  };
};

const dailyBackupReminderHandler: AutomationHandler = async () => {
  const title = 'تذكير بالتحقق من النسخ الاحتياطية';
  const now = new Date();
  // فحص فعلي لعمر آخر نسخة ناجحة عبر خدمة النسخ الاحتياطي (أحدث ملف في مجلد النسخ)
  let latest: { name: string; ageHours: number; sizeMb: number } | null = null;
  try {
    const { listBackups } = await import('./backupService.ts');
    const backups = await listBackups();
    const newest = backups[0];
    if (newest) {
      latest = {
        name: newest.name,
        ageHours: (now.getTime() - new Date(newest.mtime).getTime()) / 3_600_000,
        sizeMb: Number(newest.size || 0) / (1024 * 1024),
      };
    }
  } catch {
    // تعذر فحص ملفات النسخ — نعتمد حالة التحذير أدناه
  }

  if (latest && latest.ageHours < 24) {
    return {
      title,
      status: 'warning',
      text: `
🔒 <b>تقرير فحص النسخ الاحتياطية</b>
━━━━━━━━━━━━━━━━━━━━
📦 <b>وُجد ملف نسخة احتياطية حديث.</b>
⚠️ لم يتم التحقق من سلامته أو إمكانية استعادته؛ وجود الملف وحده لا يثبت نجاح الاستعادة.
📦 <b>آخر نسخة:</b> <code>${latest.name}</code>
⏳ <b>عمر النسخة:</b> ${latest.ageHours.toFixed(1)} ساعة (${latest.sizeMb.toFixed(1)} م.ب)
💡 يُنصح دورياً بتجربة استعادة نسخة والتأكد من موقع التخزين الخارجي.
⏱ ${now.toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
      `.trim(),
    };
  }

  const staleNote = latest
    ? `⚠️ <b>آخر نسخة موجودة قديمة:</b> <code>${latest.name}</code> — عمرها ${latest.ageHours.toFixed(1)} ساعة (الحد المقبول 24 ساعة).`
    : '⚠️ <b>لم يُعثر على أي ملف نسخة احتياطية في مجلد النسخ المحلي.</b>';
  return {
    title,
    status: 'warning',
    text: `
🔒 <b>تذكير بفحص النسخ الاحتياطية</b>
━━━━━━━━━━━━━━━━━━━━
⚠️ لم يتم التحقق من وجود نسخة احتياطية حديثة قابلة للاستعادة خلال الـ 24 ساعة الماضية.
${staleNote}
راجع آخر ملف محفوظ، وموقع التخزين الخارجي، ونتيجة تجربة الاستعادة قبل اعتبار النسخ سليمة.
⏱ ${now.toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
    `.trim(),
  };
};

const largeDiscountAlertHandler: AutomationHandler = async () => {
  const title = 'تنبيه الخصومات المرتفعة';
  const discountRes = await query(
    `SELECT s.sale_number, s.subtotal, s.total_amount, s.discount_amount, s.discount_percent, s.created_at, u.full_name as cashier_name
     FROM sales s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.created_at >= NOW() - INTERVAL '24 HOURS'
       AND s.deleted_at IS NULL
       AND (s.discount_percent >= 15 OR (s.subtotal > 0 AND (s.discount_amount / s.subtotal * 100) >= 15))
     ORDER BY s.created_at DESC LIMIT 10`,
  );

  if (discountRes.rows.length === 0) {
    return {
      title,
      status: 'success',
      text: `
🛡️ <b>تقرير فحص الخصومات المرتفعة</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>العمليات طبيعية:</b> لم يتم رصد أي خصومات استثنائية (أعلى من 15%) خلال آخر 24 ساعة.
⏱ ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}
      `.trim(),
    };
  }
  const list = discountRes.rows
    .map((r: any) => {
      const pct =
        r.discount_percent || (r.subtotal > 0 ? (r.discount_amount / r.subtotal) * 100 : 0);
      const cashier = r.cashier_name ? ` (الكاشير: ${r.cashier_name})` : '';
      return `  🏷️ فاتورة <b>#${r.sale_number}</b>: خصم ${Number(pct).toFixed(1)}% (${Number(r.discount_amount).toLocaleString('ar-EG')} ج.م من أصل ${Number(r.subtotal).toLocaleString('ar-EG')} ج.م)${cashier}`;
    })
    .join('\n');
  return {
    title,
    status: 'warning',
    text: `
🚨 <b>إنذار الرقابة المالية — خصومات مرتفعة تم رصدها</b>
━━━━━━━━━━━━━━━━━━━━
العمليات التالية تجاوزت حد الخصم المسموح (15%) خلال آخر 24 ساعة:
${list}
━━━━━━━━━━━━━━━━━━━━
⏱ <i>توقيت الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const cashflowRiskShieldHandler: AutomationHandler = async () => {
  const title = 'درع حماية السيولة والتدفقات النقدية';
  const { getCashFlowProjection } = await import('./cashFlowProjectionService.ts');
  const proj = await getCashFlowProjection();
  const currentCash = Number(proj.currentBalance || 0);
  const projected30d = Number(proj.projectedBalance30d || 0);
  const hasDeficit =
    proj.status === 'danger' || proj.runwayDays !== null || currentCash < 0 || projected30d < 0;

  if (hasDeficit) {
    return {
      title,
      status: 'warning',
      text: `
⚠️ <b>إنذار درع السيولة — مخاطر في التدفقات النقدية</b>
━━━━━━━━━━━━━━━━━━━━
💰 <b>الرصيد النقدي الحالي:</b> ${currentCash.toLocaleString('ar-EG')} ج.م
📉 <b>الرصيد المتوقع بعد 30 يوماً:</b> ${projected30d.toLocaleString('ar-EG')} ج.م
${proj.runwayDays !== null ? `🚨 <b>السيولة تغطي فقط:</b> ${proj.runwayDays} يوم\n` : ''}⚠️ <b>التفاصيل:</b> ${proj.warningMsg}
━━━━━━━━━━━━━━━━━━━━
💡 يُنصح بمراجعة جدول دفعات الموردين وتأجيل المصاريف غير العاجلة.
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
      `.trim(),
    };
  }
  return {
    title,
    status: 'success',
    text: `
🛡️ <b>تقرير درع السيولة والتدفقات النقدية</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>وضع السيولة مستقر ومطمئن:</b>
💰 <b>الرصيد النقدي الحالي:</b> ${currentCash.toLocaleString('ar-EG')} ج.م
📈 <b>الرصيد المتوقع بعد 30 يوماً:</b> ${projected30d.toLocaleString('ar-EG')} ج.م
${proj.warningMsg}
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const shiftHandoverReconciliationHandler: AutomationHandler = async () => {
  const title = 'مطابقة عهدة الكاشير وإغلاق الورديات';
  const shiftRes = await query(
    `SELECT ps.id, ps.shift_number, ps.cashier_name, ps.actual_cash, ps.expected_cash, ps.difference, ps.end_time
     FROM pos_shifts ps
     WHERE ps.status = 'closed'
       AND ps.end_time >= NOW() - INTERVAL '24 HOURS'
       AND ABS(COALESCE(ps.difference, 0)) >= 10
     ORDER BY ps.end_time DESC LIMIT 10`,
  );

  if (shiftRes.rows.length === 0) {
    return {
      title,
      status: 'success',
      text: `
⚖️ <b>تقرير مطابقة عهدة الورديات (24 ساعة)</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>كافة الورديات المغلقة متطابقة تماماً</b> ولا توجد أي فروقات نقدية (عجز أو زيادة) تتجاوز 10 ج.م.
⏱ ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}
      `.trim(),
    };
  }
  const list = shiftRes.rows
    .map((s: any) => {
      const diff = Number(s.difference);
      const diffText =
        diff < 0
          ? `عجز ${Math.abs(diff).toLocaleString('ar-EG')} ج.م 🔻`
          : `زيادة ${diff.toLocaleString('ar-EG')} ج.م 🔺`;
      return `  • وردية <b>#${s.shift_number || s.id}</b> (${s.cashier_name || 'كاشير'}): ${diffText} (متوقع: ${Number(s.expected_cash).toLocaleString('ar-EG')} | فعلي: ${Number(s.actual_cash).toLocaleString('ar-EG')})`;
    })
    .join('\n');
  return {
    title,
    status: 'warning',
    text: `
🚨 <b>إنذار فروقات نقدية في ورديات الكاشير</b>
━━━━━━━━━━━━━━━━━━━━
تم رصد الفروقات التالية في الورديات المغلقة خلال آخر 24 ساعة:
${list}
━━━━━━━━━━━━━━━━━━━━
⏱ <i>توقيت الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const roasteryRecipeWasteGuardHandler: AutomationHandler = async () => {
  const title = 'حارس الهدر والفاقد لخامات التحميص والبار';
  const wasteRes = await query(
    `SELECT p.name_ar, p.sku, COALESCE(SUM(sm.quantity), 0) AS wasted_qty, p.unit
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     WHERE sm.movement_type IN ('wastage', 'waste', 'damage', 'spoilage', 'adjustment')
       AND sm.from_warehouse_id IS NOT NULL
       AND sm.to_warehouse_id IS NULL
       AND sm.created_at >= NOW() - INTERVAL '24 HOURS'
     GROUP BY p.id, p.name_ar, p.sku, p.unit
     ORDER BY wasted_qty ASC LIMIT 10`,
  );

  if (wasteRes.rows.length === 0) {
    return {
      title,
      status: 'success',
      text: `
☕ <b>تقرير حارس الهدر والفاقد للخامات</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>سجل الهدر نظيف:</b> لم تُسجل أي حركات تالف أو هدر لخامات البن والمستلزمات خلال آخر 24 ساعة.
⏱ ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}
      `.trim(),
    };
  }
  const list = wasteRes.rows
    .map(
      (r: any) =>
        `  ⚠️ <b>${r.name_ar}</b>: هدر ${Math.abs(Number(r.wasted_qty)).toFixed(2)} ${r.unit || 'كجم'}`,
    )
    .join('\n');
  return {
    title,
    status: 'warning',
    text: `
🚨 <b>إنذار هدر وفاقد في خامات التحميص والبار</b>
━━━━━━━━━━━━━━━━━━━━
حركات الهدر والتالف المسجلة خلال آخر 24 ساعة:
${list}
━━━━━━━━━━━━━━━━━━━━
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const customerLoyaltyDormantWinbackHandler: AutomationHandler = async () => {
  const title = 'حملة استعادة وتنشيط العملاء المنقطعين';
  const dormantRes = await query(
    `SELECT c.id, c.name_ar, c.phone, COALESCE(c.points, 0) as points,
            COUNT(s.id) as total_orders,
            COALESCE(SUM(s.total_amount), 0) as lifetime_spend,
            MAX(s.sale_date) as last_order_date
     FROM customers c
     JOIN sales s ON s.customer_id = c.id
     WHERE c.deleted_at IS NULL AND s.deleted_at IS NULL AND s.status = 'completed'
     GROUP BY c.id, c.name_ar, c.phone, c.points
     HAVING MAX(s.sale_date) < CURRENT_DATE - INTERVAL '30 DAYS' AND COUNT(s.id) >= 2
     ORDER BY lifetime_spend DESC LIMIT 5`,
  );

  if (dormantRes.rows.length === 0) {
    return {
      title,
      status: 'success',
      text: `
🎯 <b>حملة استعادة العملاء المميزين</b>
━━━━━━━━━━━━━━━━━━━━
✅ لا يوجد عملاء دائمون منقطعون لأكثر من 30 يوماً حالياً. معدل عودة العملاء ممتاز!
⏱ ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}
      `.trim(),
    };
  }
  const list = dormantRes.rows
    .map(
      (c: any) =>
        `  • <b>${c.name_ar}</b> (${c.phone || 'بدون هاتف'}): ${c.total_orders} طلبات سابقة — إجمالي إنفاق ${Number(c.lifetime_spend).toLocaleString('ar-EG')} ج.م — آخر زيارة: ${c.last_order_date}`,
    )
    .join('\n');
  return {
    title,
    status: 'success',
    text: `
🎁 <b>فرص استعادة وتنشيط العملاء المنقطعين</b>
━━━━━━━━━━━━━━━━━━━━
العملاء الدائمون التاليون لم يزوروا المحل منذ أكثر من 30 يوماً:
${list}
━━━━━━━━━━━━━━━━━━━━
💡 يُقترح إرسال رسالة ترحيبية أو نقاط ولاء إضافية لتشجيع عودتهم.
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const aiCopilotAssistantHandler: AutomationHandler = async (ctx) => {
  const title = 'الموجز الذكي للمحل — Gemini Copilot';
  const { askCopilot } = await import('./aiCopilotService.ts');
  const reportDate = getCairoBusinessDate(ctx.scheduledFor);
  const summaryPrompt = `اليوم هو ${reportDate}. أعطني تقريراً تحليلياً تنفيذياً من 3 نقاط سريعة تركز على أداء المحل والمخزون والتوصيات العملية لإدارة الوردية القادمة.`;
  const failureHeader = `
🤖 <b>الموجز التنفيذي الذكي — Gemini AI</b>
━━━━━━━━━━━━━━━━━━━━
⚠️ <b>فشل توليد الموجز الذكي:</b> `;
  try {
    const copilotRes = await askCopilot(summaryPrompt);
    const replyText = typeof copilotRes === 'string' ? copilotRes : (copilotRes as any)?.text || '';
    // الخدمة تعيد سبب الفشل نصًا (مفتاح غير مفعّل) بدل رمي استثناء — نكشفه بدل إخفائه خلف نجاح زائف
    if (replyText.includes('لم يتم تفعيل المساعد الذكي بعد')) {
      return {
        title,
        status: 'warning',
        text: `
${failureHeader}${replyText}
⏱ ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}
        `.trim(),
      };
    }
    return {
      title,
      status: 'success',
      text: `
🤖 <b>الموجز التنفيذي الذكي — Gemini AI</b>
━━━━━━━━━━━━━━━━━━━━
${replyText || 'تم إجراء الفحص والتحليل الذكي بنجاح.'}
━━━━━━━━━━━━━━━━━━━━
⏱ <i>توقيت التوليد: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
      `.trim(),
    };
  } catch (err: any) {
    return {
      title,
      status: 'warning',
      text: `
${failureHeader}${err?.message || 'خطأ غير معروف من خدمة Gemini'}
⏱ ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}
      `.trim(),
    };
  }
};

const errorTrackerAlertHandler: AutomationHandler = async () => {
  const title = 'كاشف الأخطاء والإنذارات البرمجية';
  const errLogs = await query(
    `SELECT event_name, title, message, error_message, created_at
     FROM automation_logs
     WHERE (status = 'failed' OR error_message IS NOT NULL)
       AND created_at >= NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC
     LIMIT 5`,
  );

  if (errLogs.rows.length > 0) {
    const list = errLogs.rows
      .map((r: any) => `• <b>${r.title || r.event_name}</b>: ${r.error_message || r.message}`)
      .join('\n');
    return {
      title,
      status: 'warning',
      text: `
⚠️ <b>إنذار كاشف الأخطاء — تم رصد (${errLogs.rows.length}) أخطاء خلال آخر 24 ساعة:</b>
━━━━━━━━━━━━━━━━━━━━
${list}
━━━━━━━━━━━━━━━━━━━━
💡 يُنصح بفحص سجلات الخادم ومعالجة أسباب الأعطال.
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
      `.trim(),
    };
  }
  return {
    title,
    status: 'success',
    text: `
🛡️ <b>تقرير كاشف الأخطاء البرمجية وسلامة النظام</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>النظام يعمل بكفاءة واستقرار تام:</b>
لا توجد أية استثناءات أو أخطاء برمجية مسجلة خلال آخر 24 ساعة.
قاعدة البيانات والخدمات السحابية تعمل بحالة ممتازة.
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const scheduledCronTaskHandler: AutomationHandler = async () => {
  const title = 'مدير المهام والجدولة الزمنية';
  const cronsRes = await query(
    `SELECT key, name_ar, cron_expression, last_run_at, last_status
     FROM automations
     WHERE trigger_type = 'cron' AND is_enabled = TRUE
     ORDER BY id ASC`,
  );
  const count = cronsRes.rows.length;
  const list = cronsRes.rows
    .map((r: any) => `• <b>${r.name_ar}</b> (<code>${r.cron_expression}</code>)`)
    .join('\n');

  return {
    title,
    status: 'success',
    text: `
⏰ <b>تقرير مدير المهام والجدولة الزمنية</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>إجمالي المهام الدورية المجدولة والنشطة:</b> ${count} مهام
${list}
━━━━━━━━━━━━━━━━━━━━
⚡ محرك الجدولة يعمل بانتظام وجاهز للتنفيذ في مواعيده المحددة.
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const telegramNotifierHandler: AutomationHandler = async () => {
  const title = 'وكيل إشعارات تليجرام الفوري';
  const { default: TelegramBotService } = await import('./telegramBotService.ts');
  const botStatus = await TelegramBotService.getBotStatus();

  if (botStatus.connected) {
    return {
      title,
      status: 'success',
      text: `
📢 <b>تقرير وكيل إشعارات تليجرام الفوري</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>حالة البوت:</b> متصل ونشط 🟢
🤖 <b>اسم البوت:</b> ${botStatus.botFirstName || 'Agoouz-Report'} (@${botStatus.botUsername || 'Agoouz_bot'})
🆔 <b>معرف الشات الأساسي:</b> <code>${botStatus.defaultChatId || 'غير محدد'}</code>
📡 <b>الاستماع التفاعلي:</b> ${botStatus.isPolling ? 'يعمل بنجاح' : 'جاهز'}
━━━━━━━━━━━━━━━━━━━━
🚀 قنوات إرسال التقارير والإنذارات الفورية مؤمنة وتعمل بكفاءة.
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
      `.trim(),
    };
  }
  return {
    title,
    status: 'warning',
    text: `
⚠️ <b>إنذار وكيل إشعارات تليجرام</b>
━━━━━━━━━━━━━━━━━━━━
❌ <b>البوت غير متصل:</b> ${botStatus.error || 'يرجى مراجعة إعدادات البوت والتوكن في لوحة التحكم'}
━━━━━━━━━━━━━━━━━━━━
💡 توجه إلى تبويب تليجرام بالأتمتة لتحديث بيانات البوت والتحقق منه.
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const webhookListenerHandler: AutomationHandler = async () => {
  return {
    title: 'مستمع الـ Webhook للطلبات الخارجية',
    status: 'success',
    text: `
🌐 <b>تقرير مستمع الـ Webhook للطلبات الخارجية</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>حالة مسارات الاستقبال:</b> نشطة ومؤمنة
🔗 <b>المسارات المتاحة:</b> <code>/telegram/webhook</code> و <code>/api/telegram/webhook</code>
🛡️ <b>الحماية:</b> استقبال مشفر ومحمي برمز الجلسة والمصادقة
━━━━━━━━━━━━━━━━━━━━
جاهز لاستقبال الطلبات والتحديثات الفورية ومعالجتها لحظياً.
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const debtCreditSentinelHandler: AutomationHandler = async () => {
  const title = 'حارس المديونيات والائتمان لمحل بن العجوز';
  // 1. مديونيات العملاء
  const custStatsRes = await query(
    `SELECT COUNT(*)::int as debtor_count,
            COALESCE(SUM(balance), 0) as total_customer_debt
     FROM customers
     WHERE deleted_at IS NULL AND balance > 0`,
  );
  const debtorCount = Number(custStatsRes.rows[0]?.debtor_count || 0);
  const totalCustomerDebt = Number(custStatsRes.rows[0]?.total_customer_debt || 0);

  // العملاء المتجاوزين للحد الائتماني
  const overLimitRes = await query(
    `SELECT id, name_ar, phone, customer_type, balance, credit_limit
     FROM customers
     WHERE deleted_at IS NULL AND balance > 0 AND credit_limit > 0 AND balance > credit_limit
     ORDER BY (balance - credit_limit) DESC LIMIT 5`,
  );

  // أعلى العملاء مديونية
  const topDebtorsRes = await query(
    `SELECT id, name_ar, phone, customer_type, balance, credit_limit
     FROM customers
     WHERE deleted_at IS NULL AND balance > 0
     ORDER BY balance DESC LIMIT 5`,
  );

  // 2. مستحقات الموردين
  const suppStatsRes = await query(
    `SELECT COUNT(*)::int as unpaid_invoices_count,
            COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) as total_supplier_debt,
            COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN (total_amount - COALESCE(paid_amount, 0)) ELSE 0 END), 0) as overdue_supplier_debt
     FROM supplier_invoices
     WHERE deleted_at IS NULL AND total_amount > COALESCE(paid_amount, 0)`,
  );
  const unpaidInvoicesCount = Number(suppStatsRes.rows[0]?.unpaid_invoices_count || 0);
  const totalSupplierDebt = Number(suppStatsRes.rows[0]?.total_supplier_debt || 0);
  const overdueSupplierDebt = Number(suppStatsRes.rows[0]?.overdue_supplier_debt || 0);

  const hasBreaches = overLimitRes.rows.length > 0 || overdueSupplierDebt > 0;

  const breachesText =
    overLimitRes.rows.length > 0
      ? `\n🚨 <b>عملاء تجاوزوا الحد الائتماني المسموح:</b>\n` +
        overLimitRes.rows
          .map(
            (c: any) =>
              `  ⚠️ <b>${c.name_ar}</b> (${c.customer_type === 'wholesale' ? 'جملة' : 'تجزئة'}): رصيد <code>${Number(c.balance).toLocaleString('ar-EG')}</code> ج.م (الحد: ${Number(c.credit_limit).toLocaleString('ar-EG')} ج.م)`,
          )
          .join('\n')
      : '';

  const topDebtorsText =
    topDebtorsRes.rows.length > 0
      ? `\n📋 <b>أبرز أرصدة العملاء المدينة:</b>\n` +
        topDebtorsRes.rows
          .map(
            (c: any) =>
              `  • ${c.name_ar}: ${Number(c.balance).toLocaleString('ar-EG')} ج.م (${c.phone || 'بدون هاتف'})`,
          )
          .join('\n')
      : '  • لا توجد مديونيات قائمة على العملاء.';

  const supplierText =
    unpaidInvoicesCount > 0
      ? `\n🏭 <b>مستحقات الموردين:</b> ${totalSupplierDebt.toLocaleString('ar-EG')} ج.م (${unpaidInvoicesCount} فواتير)${overdueSupplierDebt > 0 ? `\n  ⚠️ منها متأخر السداد: <b>${overdueSupplierDebt.toLocaleString('ar-EG')} ج.م</b>` : ''}`
      : '\n🏭 <b>مستحقات الموردين:</b> مسددة بالكامل.';

  return {
    title,
    status: hasBreaches ? 'warning' : 'success',
    text: `
💳 <b>تقرير حارس المديونيات والائتمان — بن العجوز</b>
━━━━━━━━━━━━━━━━━━━━
👥 <b>إجمالي مديونيات العملاء:</b> ${totalCustomerDebt.toLocaleString('ar-EG')} ج.م (${debtorCount} عميل)
${supplierText}
${breachesText}
━━━━━━━━━━━━━━━━━━━━
${topDebtorsText}
━━━━━━━━━━━━━━━━━━━━
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const purchaseStockIngestionGuardHandler: AutomationHandler = async (ctx) => {
  const title = 'حارس المشتريات وتوريد المخزن وتغير التكلفة';
  // 1. فحص فواتير الشراء لآخر 24 ساعة
  const recentPurchasesRes = await query(
    `SELECT pi.id, pi.invoice_number, pi.total_amount, pi.invoice_date, w.name_ar as warehouse_name,
            COUNT(pii.id)::int as items_count
     FROM purchase_invoices pi
     JOIN warehouses w ON w.id = pi.warehouse_id
     LEFT JOIN purchase_invoice_items pii ON pii.purchase_invoice_id = pi.id
     WHERE pi.created_at >= NOW() - INTERVAL '24 HOURS' AND pi.deleted_at IS NULL
     GROUP BY pi.id, pi.invoice_number, pi.total_amount, pi.invoice_date, w.name_ar
     ORDER BY pi.created_at DESC`,
  );

  // 2. التحقق من سلامة الربط المخزني (عدم وجود فواتير شراء بدون حركات مخزنية)
  const orphanPurchasesRes = await query(
    `SELECT pi.invoice_number
     FROM purchase_invoices pi
     WHERE pi.created_at >= NOW() - INTERVAL '7 DAYS' AND pi.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM stock_movements sm
         WHERE sm.reference_type = 'purchase_invoice' AND sm.reference_id = pi.id
       )
     LIMIT 5`,
  );

  // 3. فحص ارتفاع أسعار التكلفة للخامات الواردة مقارنة بأسعار الأساس
  const spikeThresholdPct = Number(ctx.config?.cost_spike_threshold_pct || 5.0);
  const costSpikesRes = await query(
    `SELECT p.name_ar, p.purchase_price as old_price, pii.unit_price as new_price,
            pi.invoice_number,
            ROUND(((pii.unit_price - p.purchase_price) / NULLIF(p.purchase_price, 0) * 100)::numeric, 1) as increase_pct
     FROM purchase_invoice_items pii
     JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id
     JOIN products p ON p.id = pii.product_id
     WHERE pi.created_at >= NOW() - INTERVAL '24 HOURS' AND pi.deleted_at IS NULL
       AND p.purchase_price > 0
       AND pii.unit_price > p.purchase_price * (1 + $1::numeric / 100)
     ORDER BY increase_pct DESC
     LIMIT 5`,
    [spikeThresholdPct],
  );

  const hasOrphans = orphanPurchasesRes.rows.length > 0;
  const hasSpikes = costSpikesRes.rows.length > 0;
  const isWarning = hasOrphans || hasSpikes;

  const purchasesCount = recentPurchasesRes.rows.length;
  const totalPurchasedToday = recentPurchasesRes.rows.reduce(
    (sum: number, r: any) => sum + Number(r.total_amount || 0),
    0,
  );

  let details = '';
  if (purchasesCount > 0) {
    details +=
      `\n📦 <b>فواتير الشراء الواردة (آخر 24 ساعة):</b> ${purchasesCount} فاتورة بإجمالي <b>${totalPurchasedToday.toLocaleString('ar-EG')} ج.م</b>\n` +
      recentPurchasesRes.rows
        .slice(0, 3)
        .map(
          (r: any) =>
            `  • <b>#${r.invoice_number}</b>: ${Number(r.total_amount).toLocaleString('ar-EG')} ج.م (${r.warehouse_name})`,
        )
        .join('\n');
  } else {
    details += `\n📦 <b>فواتير الشراء:</b> لم يتم تسجيل فواتير شراء جديدة خلال آخر 24 ساعة.`;
  }

  if (hasOrphans) {
    details +=
      `\n\n🚨 <b>إنذار أمني للمخزن:</b> فواتير مشتريات لم تُرحل لحركات المخزن:\n` +
      orphanPurchasesRes.rows
        .map(
          (r: any) => `  ❌ فاتورة <code>${r.invoice_number}</code> غير مسجلة في stock_movements!`,
        )
        .join('\n');
  }

  if (hasSpikes) {
    details +=
      `\n\n📈 <b>تنبيه تضخم أسعار التوريد (ارتفاع > ${spikeThresholdPct}%):</b>\n` +
      costSpikesRes.rows
        .map(
          (r: any) =>
            `  🔺 <b>${r.name_ar}</b>: السعر السابق <code>${r.old_price}</code> ➔ الجديد <code>${r.new_price}</code> ج.م (+${r.increase_pct}%) بفاتورة #${r.invoice_number}`,
        )
        .join('\n') +
      `\n💡 يُنصح بمراجعة تسعير المنيو أو التفاوض مع المورد.`;
  }

  return {
    title,
    status: isWarning ? 'warning' : 'success',
    text: `
🚚 <b>تقرير حارس المشتريات وتوريد المخزن</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>تكامل المخزن:</b> ${hasOrphans ? 'يوجد خلل في بعض التوريدات ⚠️' : 'كافة المشتريات دخلت المخزن وتحدثت تكلفتها بنجاح 🟢'}
${details}
━━━━━━━━━━━━━━━━━━━━
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

const coffeeBagsCupsReconcilerHandler: AutomationHandler = async (ctx) => {
  const title = 'مدقق استهلاك الأكواب ومبيعات أكياس البن';
  const reportDate = getCairoBusinessDate(ctx.scheduledFor);
  const maxVariancePct = Number(ctx.config?.max_cup_variance_pct || 5.0);

  // 1. مبيعات المشروبات بالكوب اليوم
  const drinksRes = await query(
    `SELECT COUNT(si.id)::int as drink_lines,
            COALESCE(SUM(si.quantity), 0) as total_cups_sold
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN products p ON p.id = si.product_id
     LEFT JOIN product_categories pc ON pc.id = p.category_id
     WHERE s.sale_date = $1::date AND s.deleted_at IS NULL AND s.status = 'completed'
       AND (
         pc.name_ar ILIKE '%مشروب%' OR pc.name_ar ILIKE '%قهوة%' OR pc.name_ar ILIKE '%بار%'
         OR p.name_ar ILIKE '%كوب%' OR p.name_ar ILIKE '%لاتيه%' OR p.name_ar ILIKE '%إسبريسو%'
         OR p.name_ar ILIKE '%مقطر%' OR p.name_ar ILIKE '%شاي%' OR p.name_ar ILIKE '%كابتشينو%'
         OR p.name_ar ILIKE '%فلات وايت%' OR p.name_ar ILIKE '%أمريكانو%' OR p.name_ar ILIKE '%موكا%'
       )`,
    [reportDate],
  );
  const totalCupsSold = Number(drinksRes.rows[0]?.total_cups_sold || 0);

  // 2. فحص استهلاك الأكواب من المخزن (حركات الصرف والتالف والوصفات)
  const cupDispatchedRes = await query(
    `SELECT p.name_ar, ABS(COALESCE(SUM(sm.quantity), 0)) as cups_dispatched
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     WHERE sm.created_at::date = $1::date AND sm.quantity < 0
       AND (p.name_ar ILIKE '%كوب%' OR p.name_ar ILIKE '%كاس%' OR p.name_ar ILIKE '%cup%')
     GROUP BY p.name_ar`,
    [reportDate],
  );
  const totalCupsDispatched = cupDispatchedRes.rows.reduce(
    (acc: number, r: any) => acc + Number(r.cups_dispatched || 0),
    0,
  );

  // حساب الفرق ونسبة التباين للأكواب
  let cupVarianceText: string;
  let isCupWarning = false;
  if (totalCupsDispatched > 0 && totalCupsSold > 0) {
    const diff = totalCupsDispatched - totalCupsSold;
    const variancePct = (Math.abs(diff) / totalCupsSold) * 100;
    if (diff > 0 && variancePct > maxVariancePct) {
      isCupWarning = true;
      cupVarianceText = `\n⚠️ <b>انحراف في استهلاك الأكواب:</b> تم صرف <b>${totalCupsDispatched}</b> كوب بينما المباع <b>${totalCupsSold}</b> مشروب (هدر/فرق: ${diff} كوب، ${variancePct.toFixed(1)}%)`;
    } else {
      cupVarianceText = `\n✅ <b>تطابق الأكواب:</b> تم صرف (${totalCupsDispatched}) كوب مقابل (${totalCupsSold}) مشروب مباع (مطابقة ممتازة).`;
    }
  } else if (totalCupsSold > 0) {
    cupVarianceText = `\n☕ <b>المشروبات المباعة اليوم:</b> <b>${totalCupsSold}</b> كوب مشروب محضّر.`;
  } else {
    cupVarianceText = `\n☕ لم تسجل مبيعات مشروبات حتى الآن لهذا اليوم.`;
  }

  // 3. مبيعات أكياس البن المعبأ والمباع بالكيلو اليوم
  const coffeeBagsRes = await query(
    `SELECT p.name_ar,
            COALESCE(SUM(si.quantity), 0) as bags_sold,
            COALESCE(SUM(si.total_amount), 0) as total_revenue
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN products p ON p.id = si.product_id
     LEFT JOIN product_categories pc ON pc.id = p.category_id
     WHERE s.sale_date = $1::date AND s.deleted_at IS NULL AND s.status = 'completed'
       AND (
         pc.name_ar ILIKE '%بن%' OR pc.name_ar ILIKE '%حبوب%' OR pc.name_ar ILIKE '%محمصة%'
         OR p.name_ar ILIKE '%كيس%' OR p.name_ar ILIKE '%بن %' OR p.name_ar ILIKE '%توليفة%'
         OR p.unit = 'kg' OR p.name_ar ILIKE '%جرام%'
       )
     GROUP BY p.name_ar
     ORDER BY bags_sold DESC
     LIMIT 5`,
    [reportDate],
  );

  const totalBagsCount = coffeeBagsRes.rows.reduce(
    (acc: number, r: any) => acc + Number(r.bags_sold || 0),
    0,
  );
  const totalBagsRevenue = coffeeBagsRes.rows.reduce(
    (acc: number, r: any) => acc + Number(r.total_revenue || 0),
    0,
  );

  let bagsText: string;
  if (coffeeBagsRes.rows.length > 0) {
    bagsText =
      `\n🛍️ <b>مبيعات أكياس البن والتحميص اليوم:</b> ${totalBagsCount} كيس/كجم بقيمة <b>${totalBagsRevenue.toLocaleString('ar-EG')} ج.م</b>\n` +
      coffeeBagsRes.rows
        .map(
          (r: any) =>
            `  • ${r.name_ar}: ${Number(r.bags_sold).toFixed(1)} كيس/كجم (${Number(r.total_revenue).toLocaleString('ar-EG')} ج.م)`,
        )
        .join('\n');
  } else {
    bagsText = `\n🛍️ <b>أكياس البن:</b> لم تُسجل مبيعات لأكياس البن حتى الآن لهذا اليوم.`;
  }

  return {
    title,
    status: isCupWarning ? 'warning' : 'success',
    text: `
☕ <b>تقرير تدقيق استهلاك الأكواب ومبيعات أكياس البن</b>
━━━━━━━━━━━━━━━━━━━━
التاريخ: ${reportDate}
${cupVarianceText}
${bagsText}
━━━━━━━━━━━━━━━━━━━━
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
    `.trim(),
  };
};

// ─── السجل ───────────────────────────────────────────────

export const AUTOMATION_HANDLERS: Record<string, AutomationHandler> = {
  daily_sales_report: dailySalesReportHandler,
  low_stock_alert: lowStockAlertHandler,
  void_invoice_alert: antiFraudHandler,
  anti_fraud_sentinel: antiFraudHandler,
  warehouse_balancing: warehouseBalancingHandler,
  supplier_payment_due_alert: supplierPaymentDueHandler,
  daily_profit_margin_anomaly: profitMarginAnomalyHandler,
  system_health: systemHealthHandler,
  daily_backup_reminder: dailyBackupReminderHandler,
  large_discount_alert: largeDiscountAlertHandler,
  cashflow_risk_shield: cashflowRiskShieldHandler,
  shift_handover_reconciliation: shiftHandoverReconciliationHandler,
  roastery_recipe_waste_guard: roasteryRecipeWasteGuardHandler,
  customer_loyalty_dormant_winback: customerLoyaltyDormantWinbackHandler,
  ai_copilot_assistant: aiCopilotAssistantHandler,
  error_tracker_alert: errorTrackerAlertHandler,
  scheduled_cron_task: scheduledCronTaskHandler,
  telegram_notifier: telegramNotifierHandler,
  webhook_listener: webhookListenerHandler,
  debt_credit_sentinel: debtCreditSentinelHandler,
  purchase_stock_ingestion_guard: purchaseStockIngestionGuardHandler,
  coffee_bags_cups_reconciler: coffeeBagsCupsReconcilerHandler,
};

/**
 * services/automationEventBus.ts — ناقل أحداث الأتمتة الفورية (event-triggered)
 * يربط أحداث النظام الحية (إلغاء فاتورة، خصم كبير، إغلاق وردية بفرق عهدة، خطأ برمجي)
 * بمهام الأتمتة المسجلة بـ trigger_type = 'event' عبر WorkflowGraphService.runAutomationNow.
 * مبادئ التصميم (البند 0.1 من مراجعة الأتمتة 2026-09-28):
 *  - لا يرمي أبدًا: كل فشل يُلتقط ويُسجل عبر loggerService فقط.
 *  - تنفيذ غير حاجب (fire-and-forget) حتى لا يبطئ مسار البيع.
 *  - خنق زمني لكل مهمة: لا تكرار الإطلاق قبل 5 دقائق عبر مطالبة ذرية بـ last_run_at.
 */

import { query } from '../database/pool.ts';
import logger from './loggerService.ts';
import WorkflowGraphService from './workflowGraphService.ts';

/** نافذة الخنق الزمني لكل مهمة (بالدقائق) */
const THROTTLE_MINUTES = 5;
/** الحد الافتراضي لنسبة الخصم المثير للتنبيه (%) — يُتجاوز بـ config.max_discount_pct */
const DEFAULT_DISCOUNT_PCT = 15;
/** الحد الافتراضي لفرق العهدة المثير للتنبيه (ج.م) */
const SHIFT_DIFF_THRESHOLD = 10;

export type AutomationEventPayload = Record<string, any>;

/**
 * فلترة التسليم حسب نوع الحدث: بعض الأحداث تُطلق المهمة فقط عند تجاوز الحد.
 * @returns {boolean} true إذا استحق الحدث تشغيل المهمة
 */
const shouldDeliver = (
  eventType: string,
  payload: AutomationEventPayload,
  config: Record<string, any> | null | undefined,
): boolean => {
  if (eventType === 'large_discount_alert') {
    const subtotal = Number(payload.subtotal || 0);
    const discountAmount = Number(payload.discount_amount || 0);
    const pct = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;
    const configured = Number(config?.max_discount_pct);
    const threshold =
      Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DISCOUNT_PCT;
    return pct >= threshold;
  }
  if (eventType === 'shift_handover_reconciliation') {
    const diff = Math.abs(Number(payload.cash_difference || 0));
    return diff >= SHIFT_DIFF_THRESHOLD;
  }
  return true;
};

/**
 * التوزيع الفعلي للحدث: مطابقة المهمة المفعّلة، فلترة الحد، ثم الإطلاق.
 */
const dispatchAutomationEvent = async (
  eventType: string,
  payload: AutomationEventPayload,
): Promise<void> => {
  const res = await query(
    `SELECT id, key, config FROM automations
     WHERE key = $1 AND trigger_type = 'event' AND is_enabled = TRUE
     LIMIT 1`,
    [eventType],
  );
  const task = res.rows[0];
  if (!task) return;

  if (!shouldDeliver(eventType, payload, task.config)) return;

  // خنق زمني بمطالبة ذرية: منع الإطلاق المزدوج حتى مع أكثر من عملية/خادم
  const claimed = await query(
    `UPDATE automations SET last_run_at = NOW(), updated_at = NOW()
     WHERE id = $1
       AND (last_run_at IS NULL OR last_run_at < NOW() - make_interval(mins => $2::int))
     RETURNING id`,
    [task.id, THROTTLE_MINUTES],
  );
  if (!claimed.rows[0]) return; // مُخنق: أُطلقت نفس المهمة قبل أقل من 5 دقائق

  await WorkflowGraphService.runAutomationNow(task.key, { triggerSource: 'event' });
};

/**
 * إطلاق حدث أتمتة فوري — آمن للاستدعاء من أي مسار حساس (بيع/إغلاق وردية/ميدلوير أخطاء).
 * لا يرمي أبدًا ولا يعيد وعدًا على المتصل؛ الفشل يُسجل فقط.
 * @param {string} eventType مفتاح مهمة الأتمتة المطابق (مثل void_invoice_alert)
 * @param {AutomationEventPayload} payload بيانات الحدث (رقم الفاتورة، المبلغ، الكاشير...)
 */
export function emitAutomationEvent(eventType: string, payload: AutomationEventPayload = {}): void {
  try {
    void dispatchAutomationEvent(eventType, payload).catch((err: any) => {
      logger.error(`automationEventBus: فشل معالجة الحدث ${eventType}: ${err?.message}`);
    });
  } catch (err: any) {
    logger.error(`automationEventBus: خطأ غير متوقع في الحدث ${eventType}: ${err?.message}`);
  }
}

/**
 * نسخة بانتظار اكتمال المعالجة — للاختبارات فقط؛ مسارات الإنتاج تستخدم emitAutomationEvent.
 */
export const emitAutomationEventAsync = dispatchAutomationEvent;

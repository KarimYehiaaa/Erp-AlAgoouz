import crypto from 'node:crypto';
import { query } from '../database/pool.ts';
import logger from './loggerService.ts';
import WorkflowGraphService from './workflowGraphService.ts';

const TIME_ZONE = 'Africa/Cairo';
const TICK_INTERVAL_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 3;

// المفاتيح القديمة المرادفة لمفاتيح أساسية: الترحيل 083 يحذف الصف القديم من قاعدة
// البيانات، وهنا نضمن ألا يُنفَّذ التقرير مرتين لو وُجد الصفان قبل تطبيق الترحيل
// (نفس دلالات الترحيل 072: الدمج فقط عند تطابق الجدول الزمني).
const LEGACY_AUTOMATION_ALIASES: Record<string, string> = {
  daily_summary_report: 'daily_sales_report',
};
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let tickInProgress = false;

// ثابت مُخزَّن مؤقتًا: إنشاء Intl.DateTimeFormat مكلف ولا يلزم تكراره في كل استدعاء.
const cairoFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  weekday: 'short',
  // h23 يضمن أن منتصف الليل يُمثَّل بـ 00 بدل 24 (سلوك h24 في نسخ ICU قديمة يُفشل مهام الساعة 00).
  hourCycle: 'h23',
});

const CAIRO_WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const getCairoParts = (date = new Date()) => {
  const parts = cairoFormatter.formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return {
    minute: Number(value('minute')),
    hour: Number(value('hour')),
    day: Number(value('day')),
    month: Number(value('month')),
    weekday: CAIRO_WEEKDAYS[value('weekday')] ?? 0,
  };
};

const matchesField = (raw: string, value: number, min: number, max: number) => {
  if (raw === '*') return true;
  return raw.split(',').some((part) => {
    const [range, stepText] = part.split('/');
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step <= 0) return false;
    if (range === '*') return (value - min) % step === 0;
    if (range.includes('-')) {
      const [start, end] = range.split('-').map(Number);
      return value >= start && value <= end && (value - start) % step === 0;
    }
    const exact = Number(range);
    return Number.isInteger(exact) && exact >= min && exact <= max && value === exact;
  });
};

/** دعم Cron الخماسي للمهام الزمنية مع توقيت القاهرة. */
export const matchesCronExpression = (expression: string, date = new Date()) => {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const now = getCairoParts(date);
  const [minute, hour, day, month, weekday] = fields;
  return (
    matchesField(minute, now.minute, 0, 59) &&
    matchesField(hour, now.hour, 0, 23) &&
    matchesField(day, now.day, 1, 31) &&
    matchesField(month, now.month, 1, 12) &&
    matchesField(weekday, now.weekday, 0, 6)
  );
};

// إزاحة القاهرة ساعة كاملة (+2 شتاءً و +3 صيفًا)، لذا دقيقة القاهرة تطابق دائمًا دقيقة UTC.
const parseFieldValues = (raw: string, min: number, max: number): Set<number> | null => {
  if (raw === '*') return null;
  const values = new Set<number>();
  for (let value = min; value <= max; value += 1) {
    if (matchesField(raw, value, min, max)) values.add(value);
  }
  return values;
};

// تخزين مؤقت لنتيجة البحث لكل (تعبير، دقيقة حالية) تفاديًا لإعادة الحساب داخل الدقيقة نفسها.
const scheduledMinuteCache = new Map<string, Date | null>();
const SCHEDULED_MINUTE_CACHE_LIMIT = 512;
const MS_PER_HOUR = 3_600_000;

const mostRecentScheduledMinute = (expression: string, now: Date): Date | null => {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const currentMinute = Math.floor(now.getTime() / 60_000) * 60_000;
  const cacheKey = `${expression}|${currentMinute}`;
  if (scheduledMinuteCache.has(cacheKey)) return scheduledMinuteCache.get(cacheKey) ?? null;
  let result: Date | null = null;
  // التعبير المفتوح بالكامل يطابق الدقيقة الحالية بلا بحث.
  if (fields.every((field) => field === '*')) {
    result = new Date(currentMinute);
  } else {
    const [minuteField, hourField, dayField, monthField, weekdayField] = fields;
    // جدول الدقائق الصالحة يُحسب مرة واحدة بدل مطابقة cron كاملة لكل دقيقة مرشحة.
    const validMinutes = parseFieldValues(minuteField, 0, 59);
    // 35 days cover daily, weekly, and monthly schedules, including 31-day gaps.
    for (let offset = 0; offset <= 35 * 24 * 60; offset += 1) {
      const candidate = new Date(currentMinute - offset * 60_000);
      // فلترة رخيصة 1: الدقيقة عبر جدول محسوب مسبقًا.
      if (validMinutes && !validMinutes.has(candidate.getUTCMinutes())) continue;
      // فلترة رخيصة 2: الساعة عبر الإزاحتين الممكنتين (+2/+3)؛ نرفض فقط إذا تعذّرت الاثنتان،
      // والحالات الملتبسة قرب لحظات تغيّر التوقيت تُفاضل بدقة عبر matchesCronExpression.
      const utcHour = candidate.getUTCHours();
      const hourPossible =
        matchesField(hourField, (utcHour + 2) % 24, 0, 23) ||
        matchesField(hourField, (utcHour + 3) % 24, 0, 23);
      if (!hourPossible) continue;
      // فلترة رخيصة 3: اليوم/الشهر/أسبوع اليوم عبر التاريخين المدنيين المحتملين للقاهرة.
      const datePossible = [2, 3].some((offsetHours) => {
        const shifted = new Date(candidate.getTime() + offsetHours * MS_PER_HOUR);
        return (
          matchesField(dayField, shifted.getUTCDate(), 1, 31) &&
          matchesField(monthField, shifted.getUTCMonth() + 1, 1, 12) &&
          matchesField(weekdayField, shifted.getUTCDay(), 0, 6)
        );
      });
      if (!datePossible) continue;
      if (matchesCronExpression(expression, candidate)) {
        result = candidate;
        break;
      }
    }
  }
  if (scheduledMinuteCache.size >= SCHEDULED_MINUTE_CACHE_LIMIT) scheduledMinuteCache.clear();
  scheduledMinuteCache.set(cacheKey, result);
  return result;
};

export const tickDueAutomations = async (now = new Date()) => {
  if (tickInProgress) return { skipped: true, executed: 0, failed: 0 };
  tickInProgress = true;
  try {
    const result = await query(
      `SELECT key, cron_expression, last_run_at, last_status, retry_count, next_retry_at
       FROM automations
       WHERE is_enabled = TRUE AND trigger_type = 'cron' AND cron_expression IS NOT NULL
       ORDER BY id`,
    );
    const staleBefore = new Date(now.getTime() - 15 * 60_000);
    const due = result.rows.flatMap((task: any) => {
      const lastRunAt = task.last_run_at ? new Date(task.last_run_at).getTime() : 0;
      const staleClaim = task.last_status === 'running' && lastRunAt < staleBefore.getTime();
      const scheduledAt = mostRecentScheduledMinute(task.cron_expression, now);
      // 1) موعد مجدول فائت أو مطالبة من مهمة عالقة.
      if (scheduledAt && (lastRunAt < scheduledAt.getTime() || staleClaim)) {
        return [{ task, scheduledAt, isRetry: false }];
      }
      // 2) مهمة فاشلة حان موعد إعادة محاولتها (بعد الحد الأقصى تُترك للدورة المجدولة التالية).
      const retryDue =
        task.last_status === 'failed' &&
        Number(task.retry_count ?? 0) < MAX_RETRY_ATTEMPTS &&
        task.next_retry_at &&
        new Date(task.next_retry_at).getTime() <= now.getTime();
      if (retryDue) return [{ task, scheduledAt: now, isRetry: true }];
      return [];
    });
    // إزالة ازدواج المرادفات: إذا كان المفتاح الأساسي مفعّلًا بنفس الجدول الزمني
    // يُنفَّذ الأساسي فقط كي لا يصل التقرير للمستخدم مرتين.
    const dueTasks = due.filter(({ task }) => {
      const canonicalKey = LEGACY_AUTOMATION_ALIASES[task.key];
      if (!canonicalKey) return true;
      const canonical = result.rows.find((row: any) => row.key === canonicalKey);
      return !(canonical && canonical.cron_expression === task.cron_expression);
    });
    let failed = 0;
    let executed = 0;
    for (const { task, scheduledAt, isRetry } of dueTasks) {
      // Persist the claim before any outbound notification. A second serverless
      // invocation will see no returned row and cannot send a duplicate alert.
      const claim = isRetry
        ? await query(
            `UPDATE automations
             SET last_run_at = $1, last_status = 'running', updated_at = NOW()
             WHERE key = $2 AND is_enabled = TRUE AND trigger_type = 'cron'
               AND last_status = 'failed' AND retry_count < $3
               AND next_retry_at IS NOT NULL AND next_retry_at <= $1
             RETURNING key`,
            [now, task.key, MAX_RETRY_ATTEMPTS],
          )
        : await query(
            `UPDATE automations
             SET last_run_at = $1, last_status = 'running', updated_at = NOW()
             WHERE key = $2 AND is_enabled = TRUE AND trigger_type = 'cron'
               AND (last_run_at IS NULL OR last_run_at < $3
                    OR (last_status = 'running' AND last_run_at < $4))
             RETURNING key`,
            [now, task.key, scheduledAt, staleBefore],
          );
      if (!claim.rows.length) continue;
      executed += 1;
      const execution = await WorkflowGraphService.runAutomationNow(task.key, {
        triggerSource: 'scheduler',
        executionId: crypto.randomUUID(),
        scheduledFor: scheduledAt,
      });
      if (!execution.success) failed += 1;
    }
    return { skipped: false, executed, failed };
  } finally {
    tickInProgress = false;
  }
};

export const initAutomationScheduler = () => {
  if (schedulerTimer) return schedulerTimer;
  logger.info('[Automation] تم تفعيل المجدول المحلي — فحص المهام كل دقيقة بتوقيت القاهرة.');
  schedulerTimer = setInterval(() => {
    tickDueAutomations().catch((error: any) =>
      logger.error(`[Automation] فشل فحص الجدولة: ${error.message}`),
    );
  }, TICK_INTERVAL_MS);
  void tickDueAutomations().catch((error: any) =>
    logger.error(`[Automation] فشل الفحص الأولي: ${error.message}`),
  );
  return schedulerTimer;
};

export const stopAutomationScheduler = () => {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
};

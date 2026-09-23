import crypto from 'node:crypto';
import { query } from '../database/pool.ts';
import logger from './loggerService.ts';
import WorkflowGraphService from './workflowGraphService.ts';

const TIME_ZONE = 'Africa/Cairo';
const TICK_INTERVAL_MS = 60_000;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let tickInProgress = false;

const getCairoParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    minute: Number(value('minute')),
    hour: Number(value('hour')),
    day: Number(value('day')),
    month: Number(value('month')),
    weekday: weekdays[value('weekday')] ?? 0,
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

const mostRecentScheduledMinute = (expression: string, now: Date): Date | null => {
  const minuteField = expression.trim().split(/\s+/)[0];
  const currentMinute = Math.floor(now.getTime() / 60_000) * 60_000;
  // 35 days cover daily, weekly, and monthly schedules, including 31-day gaps.
  for (let offset = 0; offset <= 35 * 24 * 60; offset += 1) {
    const candidate = new Date(currentMinute - offset * 60_000);
    // Cairo's UTC offset is in whole hours, so the minute can be rejected cheaply.
    if (!matchesField(minuteField, candidate.getUTCMinutes(), 0, 59)) continue;
    if (matchesCronExpression(expression, candidate)) return candidate;
  }
  return null;
};

export const tickDueAutomations = async (now = new Date()) => {
  if (tickInProgress) return { skipped: true, executed: 0, failed: 0 };
  tickInProgress = true;
  try {
    const result = await query(
      `SELECT key, cron_expression, last_run_at, last_status
       FROM automations
       WHERE is_enabled = TRUE AND trigger_type = 'cron' AND cron_expression IS NOT NULL
       ORDER BY id`,
    );
    const staleBefore = new Date(now.getTime() - 15 * 60_000);
    const canonicalDailyReport = result.rows.find((task: any) => task.key === 'daily_sales_report');
    const due = result.rows.flatMap((task: any) => {
      if (
        task.key === 'daily_summary_report' &&
        canonicalDailyReport?.cron_expression === task.cron_expression
      )
        return [];
      const scheduledAt = mostRecentScheduledMinute(task.cron_expression, now);
      if (!scheduledAt) return [];
      const lastRunAt = task.last_run_at ? new Date(task.last_run_at).getTime() : 0;
      const staleClaim = task.last_status === 'running' && lastRunAt < staleBefore.getTime();
      return lastRunAt < scheduledAt.getTime() || staleClaim ? [{ task, scheduledAt }] : [];
    });
    let failed = 0;
    let executed = 0;
    for (const { task, scheduledAt } of due) {
      // Persist the claim before any outbound notification. A second serverless
      // invocation will see no returned row and cannot send a duplicate alert.
      const claim = await query(
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

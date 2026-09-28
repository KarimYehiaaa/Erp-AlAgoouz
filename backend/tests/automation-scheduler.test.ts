import { describe, expect, it } from 'vitest';
import { matchesCronExpression } from '../src/services/automationSchedulerService.ts';

describe('automation scheduler cron matching', () => {
  it('matches a Cairo daily schedule', () => {
    expect(matchesCronExpression('30 23 * * *', new Date('2026-09-20T20:30:00.000Z'))).toBe(true);
    expect(matchesCronExpression('30 23 * * *', new Date('2026-09-20T20:31:00.000Z'))).toBe(false);
  });

  it('matches selected hours and weekdays', () => {
    expect(matchesCronExpression('0 10,18 * * *', new Date('2026-09-21T07:00:00.000Z'))).toBe(true);
    expect(matchesCronExpression('0 10,18 * * *', new Date('2026-09-21T08:00:00.000Z'))).toBe(
      false,
    );
  });

  it('rejects malformed cron expressions', () => {
    expect(matchesCronExpression('every hour')).toBe(false);
    expect(matchesCronExpression('0 10 * *')).toBe(false);
  });

  it('matches Cairo midnight for "0 0 * * *" (h23 safety)', () => {
    // منتصف ليل القاهرة في الصيف (+3): 21:00Z. يفشل السلوك h24 هنا حين يعيد "24" بدل "00".
    expect(matchesCronExpression('0 0 * * *', new Date('2026-09-20T21:00:00.000Z'))).toBe(true);
    expect(matchesCronExpression('0 0 * * *', new Date('2026-09-20T21:01:00.000Z'))).toBe(false);
    // منتصف ليل القاهرة في الشتاء (+2): 22:00Z.
    expect(matchesCronExpression('0 0 * * *', new Date('2026-02-19T22:00:00.000Z'))).toBe(true);
    expect(matchesCronExpression('0 0 * * *', new Date('2026-02-19T21:59:00.000Z'))).toBe(false);
    // لفة اليوم: 21:00Z يوم 20 سبتمبر هو 21 سبتمبر بتوقيت القاهرة لا 20.
    expect(matchesCronExpression('0 0 21 * *', new Date('2026-09-20T21:00:00.000Z'))).toBe(true);
    expect(matchesCronExpression('0 0 20 * *', new Date('2026-09-20T21:00:00.000Z'))).toBe(false);
  });

  it('handles month-end boundaries in Cairo time', () => {
    // 1 أغسطس 00:00 بالقاهرة = 31 يوليو 21:00Z — الشهر واليوم من أجزاء القاهرة لا UTC.
    expect(matchesCronExpression('0 0 1 8 *', new Date('2026-07-31T21:00:00.000Z'))).toBe(true);
    expect(matchesCronExpression('0 0 1 8 *', new Date('2026-08-01T21:00:00.000Z'))).toBe(false);
    // آخر دقيقة في الشهر: 31 أغسطس 23:30 بالقاهرة = 20:30Z.
    expect(matchesCronExpression('30 23 31 8 *', new Date('2026-08-31T20:30:00.000Z'))).toBe(true);
    expect(matchesCronExpression('30 23 31 8 *', new Date('2026-09-01T00:30:00.000Z'))).toBe(false);
  });

  it('handles Egypt DST spring-forward (skipped hour)', () => {
    // القفزة الربيعية 2026: آخر لحظة +2 هي 23 أبريل 23:59 (21:59Z) ثم تقفز الساعة إلى 01:00 (+3).
    expect(matchesCronExpression('59 23 23 4 *', new Date('2026-04-23T21:59:00.000Z'))).toBe(true);
    // ساعة 00:00–00:59 من 24 أبريل لا وجود لها فلا تُطابق أبدًا.
    expect(matchesCronExpression('0 0 24 4 *', new Date('2026-04-23T22:00:00.000Z'))).toBe(false);
    expect(matchesCronExpression('0 1 24 4 *', new Date('2026-04-23T22:00:00.000Z'))).toBe(true);
    expect(matchesCronExpression('0 0 24 4 *', new Date('2026-04-24T22:00:00.000Z'))).toBe(false);
  });

  it('handles Egypt DST fall-back (repeated hour)', () => {
    // الرجوع الخريفي 2026: ساعة 23:00–23:59 من 29 أكتوبر تتكرر مرتين (+3 ثم +2).
    expect(matchesCronExpression('0 23 29 10 *', new Date('2026-10-29T20:00:00.000Z'))).toBe(true);
    expect(matchesCronExpression('0 23 29 10 *', new Date('2026-10-29T21:00:00.000Z'))).toBe(true);
    // منتصف ليل 30 أكتوبر بالقاهرة (بعد الرجوع +2) = 22:00Z.
    expect(matchesCronExpression('0 0 30 10 *', new Date('2026-10-29T21:00:00.000Z'))).toBe(false);
    expect(matchesCronExpression('0 0 30 10 *', new Date('2026-10-29T22:00:00.000Z'))).toBe(true);
  });
});

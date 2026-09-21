import { describe, expect, it } from 'vitest';
import { matchesCronExpression } from '../src/services/automationSchedulerService.ts';

describe('automation scheduler cron matching', () => {
  it('matches a Cairo daily schedule', () => {
    expect(matchesCronExpression('30 23 * * *', new Date('2026-09-20T20:30:00.000Z'))).toBe(true);
    expect(matchesCronExpression('30 23 * * *', new Date('2026-09-20T20:31:00.000Z'))).toBe(false);
  });

  it('matches selected hours and weekdays', () => {
    expect(matchesCronExpression('0 10,18 * * *', new Date('2026-09-21T07:00:00.000Z'))).toBe(true);
    expect(matchesCronExpression('0 10,18 * * *', new Date('2026-09-21T08:00:00.000Z'))).toBe(false);
  });

  it('rejects malformed cron expressions', () => {
    expect(matchesCronExpression('every hour')).toBe(false);
    expect(matchesCronExpression('0 10 * *')).toBe(false);
  });
});

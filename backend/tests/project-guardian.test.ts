import { describe, expect, it } from 'vitest';
import { buildGuardianFingerprint } from '../src/services/projectGuardianService.ts';

describe('Project Guardian fingerprinting', () => {
  it('is deterministic for the same incident identity', () => {
    const input = {
      kind: 'incident' as const,
      source: 'github',
      eventType: 'ci.workflow.completed',
      title: 'CI/CD Pipeline: failure',
      severity: 'high' as const,
      component: 'ci',
      environment: 'online',
      dedupeKey: 'ci:CI/CD Pipeline:failure',
    };
    expect(buildGuardianFingerprint(input)).toBe(buildGuardianFingerprint(input));
  });

  it('uses dedupeKey so repeated occurrences map to one incident', () => {
    const first = buildGuardianFingerprint({
      source: 'runtime',
      eventType: 'http.5xx',
      title: 'first text',
      component: 'backend',
      environment: 'local',
      dedupeKey: 'runtime:GET:/api/v1/sales:INTERNAL_ERROR',
    });
    const repeated = buildGuardianFingerprint({
      source: 'runtime',
      eventType: 'http.5xx',
      title: 'different text',
      component: 'backend',
      environment: 'local',
      dedupeKey: 'runtime:GET:/api/v1/sales:INTERNAL_ERROR',
    });
    expect(first).toBe(repeated);
  });

  it('separates incidents with different stable identities', () => {
    const a = buildGuardianFingerprint({
      source: 'github',
      eventType: 'ci.workflow.completed',
      title: 'CI failed',
      component: 'ci',
      environment: 'online',
      dedupeKey: 'ci:backend:failure',
    });
    const b = buildGuardianFingerprint({
      source: 'github',
      eventType: 'ci.workflow.completed',
      title: 'CI failed',
      component: 'ci',
      environment: 'online',
      dedupeKey: 'ci:desktop:failure',
    });
    expect(a).not.toBe(b);
  });
});

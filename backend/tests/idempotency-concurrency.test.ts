/**
 * tests/idempotency-concurrency.test.ts
 * ═══════════════════════════════════════════════════════════════════════
 * اختبارات القفل الذري المتزامن وموثوقية Idempotency في منع Race Conditions
 * وتأكيد إعادة تشغيل الردود المخزنة وإلغاء القفل عند الأخطاء.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { query } from '../src/database/pool.ts';
import { requireIdempotency, clearIdempotencyMemory } from '../src/middleware/idempotency.ts';

describe('Idempotency & Concurrency Hardening', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;
  let executionCount = 0;
  let shouldFailOnce = false;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(requireIdempotency);

    // Mock endpoint that simulates async work
    app.post('/test-idempotent-action', async (req, res) => {
      executionCount++;

      if (shouldFailOnce) {
        shouldFailOnce = false;
        return res.status(500).json({ error: 'Simulated server fault' });
      }

      const delay = Number(req.query.delay || 50);
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      res.status(201).json({
        success: true,
        actionId: req.body.actionId || 'default',
        executionCount,
      });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Clean up test idempotency keys
    await query(`DELETE FROM idempotency_records WHERE key LIKE '%test-idempotent-action%'`);
    clearIdempotencyMemory();
  });

  it('Concurrent requests with identical key produce 1 winner and 1 409 Conflict', async () => {
    executionCount = 0;
    const testKey = `test-concurrent-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Fire 2 concurrent requests with a 150ms delay inside handler so the lock window is wide
    const req1 = fetch(`${baseUrl}/test-idempotent-action?delay=150`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ actionId: 'concurrent-1' }),
    });

    // Slight microtask pause (5ms) to ensure req1 enters and claims lock first
    await new Promise((r) => setTimeout(r, 5));

    const req2 = fetch(`${baseUrl}/test-idempotent-action?delay=150`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ actionId: 'concurrent-2' }),
    });

    const [res1, res2] = await Promise.all([req1, req2]);

    const statuses = [res1.status, res2.status].sort();
    // One must be 201 Created and the other must be 409 Conflict
    expect(statuses).toEqual([201, 409]);

    const conflictRes = res1.status === 409 ? res1 : res2;
    const conflictBody = (await conflictRes.json()) as any;
    expect(conflictBody.code).toBe('REQUEST_IN_PROGRESS');

    // Business logic executed exactly ONCE
    expect(executionCount).toBe(1);
  });

  it('Completed request replays cached response with _idempotentReplay: true', async () => {
    const testKey = `test-replay-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // First request executes
    const res1 = await fetch(`${baseUrl}/test-idempotent-action?delay=10`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ actionId: 'replay-action' }),
    });

    expect(res1.status).toBe(201);
    const body1 = (await res1.json()) as any;
    expect(body1.success).toBe(true);
    expect(body1.actionId).toBe('replay-action');
    const firstExecCount = body1.executionCount;

    // Second request with SAME key replays cached response
    const res2 = await fetch(`${baseUrl}/test-idempotent-action?delay=10`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ actionId: 'replay-action' }),
    });

    expect(res2.status).toBe(201);
    const body2 = (await res2.json()) as any;
    expect(body2._idempotentReplay).toBe(true);
    expect(body2.actionId).toBe('replay-action');
    // Execution count in the body matches the original (not re-executed)
    expect(body2.executionCount).toBe(firstExecCount);
  });

  it('Server error (5xx) unlocks key so subsequent retry succeeds', async () => {
    const testKey = `test-retry-on-error-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    shouldFailOnce = true;

    // First request fails with 500
    const res1 = await fetch(`${baseUrl}/test-idempotent-action?delay=10`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ actionId: 'retry-fail' }),
    });

    expect(res1.status).toBe(500);

    // Wait a brief moment for error handler unlock to commit
    await new Promise((r) => setTimeout(r, 20));

    // Retry with SAME key now succeeds because lock was automatically cleared on 5xx
    const res2 = await fetch(`${baseUrl}/test-idempotent-action?delay=10`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ actionId: 'retry-success' }),
    });

    expect(res2.status).toBe(201);
    const body2 = (await res2.json()) as any;
    expect(body2.success).toBe(true);
    expect(body2.actionId).toBe('retry-success');
  });

  it('Stale lock (>30s) is reclaimed and processed successfully', async () => {
    const testKey = `test-stale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const scopedKey = `anon:/test-idempotent-action:${testKey}`;

    // Manually insert an expired lock from 40 seconds ago in DB
    await query(
      `INSERT INTO idempotency_records (key, user_id, request_path, status, locked_at, expires_at)
       VALUES ($1, NULL, '/test-idempotent-action', 'PROCESSING', NOW() - INTERVAL '40 seconds', NOW() + INTERVAL '24 hours')`,
      [scopedKey],
    );

    // New request comes in: should reclaim stale lock and complete successfully
    const res = await fetch(`${baseUrl}/test-idempotent-action?delay=10`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ actionId: 'stale-reclaimed' }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.actionId).toBe('stale-reclaimed');
  });
});

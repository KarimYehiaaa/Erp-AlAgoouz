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
import pool, { getClient, query } from '../src/database/pool.ts';
import { runSharedMaintenanceTask } from '../src/database/maintenanceBarrier.ts';
import { requireIdempotency, clearIdempotencyMemory } from '../src/middleware/idempotency.ts';

describe('Idempotency & Concurrency Hardening', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;
  let executionCount = 0;
  let shouldFailOnce = false;
  let enterHeldRequest: (() => void) | undefined;
  let heldRequest: Promise<void> | undefined;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(requireIdempotency);

    // Mock endpoint that simulates async work
    app.post('/test-idempotent-action', async (req, res) => {
      executionCount++;

      if (req.query.hold === 'true' && executionCount === 1) {
        enterHeldRequest?.();
        await heldRequest;
      }

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

    // Hold the first handler until the second response arrives; no timing assumption.
    let release!: () => void;
    heldRequest = new Promise((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      enterHeldRequest = resolve;
    });
    const req1 = fetch(`${baseUrl}/test-idempotent-action?delay=0&hold=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ actionId: 'concurrent-1' }),
    });

    await entered;

    const req2 = fetch(`${baseUrl}/test-idempotent-action?delay=0&hold=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ actionId: 'concurrent-2' }),
    });

    let res2: Response;
    try {
      res2 = await req2;
    } finally {
      release();
      enterHeldRequest = undefined;
      heldRequest = undefined;
    }
    const res1 = await req1;

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

  it('Server error after execution is replayed without executing twice', async () => {
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

    // The response is persisted before it is delivered; no timing delay is needed.

    // An error after business work is uncertain: the same key must never rerun it.
    const res2 = await fetch(`${baseUrl}/test-idempotent-action?delay=10`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ actionId: 'retry-success' }),
    });

    expect(res2.status).toBe(500);
    const body2 = (await res2.json()) as any;
    expect(body2._idempotentReplay).toBe(true);
    expect(body2.error).toBe('Simulated server fault');
  });

  it('A processing lock older than 30 seconds still prevents duplicate execution', async () => {
    const testKey = `test-stale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const scopedKey = `anon:127.0.0.1:POST:/test-idempotent-action:${testKey}`;

    // Manually insert an expired lock from 40 seconds ago in DB
    await query(
      `INSERT INTO idempotency_records (key, user_id, request_path, status, locked_at, expires_at)
       VALUES ($1, NULL, '/test-idempotent-action', 'PROCESSING', NOW() - INTERVAL '40 seconds', NOW() + INTERVAL '24 hours')`,
      [scopedKey],
    );

    // Slow or disconnected requests cannot be reclaimed solely based on elapsed time.
    const res = await fetch(`${baseUrl}/test-idempotent-action?delay=10`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ actionId: 'stale-reclaimed' }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.code).toBe('REQUEST_IN_PROGRESS');
  });
  it('atomically reclaims an expired completed response with only one executor', async () => {
    const testKey = `test-expired-${Date.now()}`;
    const scopedKey = `anon:127.0.0.1:POST:/test-idempotent-action:${testKey}`;
    await query(
      `INSERT INTO idempotency_records (key, request_path, status, status_code, response_body, expires_at)
      VALUES ($1, '/test-idempotent-action', 'COMPLETED', 201, '{}', NOW() - INTERVAL '1 second')`,
      [scopedKey],
    );
    executionCount = 0;
    let release!: () => void;
    heldRequest = new Promise((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      enterHeldRequest = resolve;
    });
    const request = () =>
      fetch(`${baseUrl}/test-idempotent-action?hold=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': testKey },
        body: '{}',
      });
    const first = request();
    await entered;
    try {
      expect((await request()).status).toBe(409);
    } finally {
      release();
      enterHeldRequest = undefined;
      heldRequest = undefined;
    }
    expect((await first).status).toBe(201);
    expect(executionCount).toBe(1);
  });

  it('cleanup preserves an expired unconfirmed operation and retry does not execute', async () => {
    const testKey = `test-unconfirmed-${Date.now()}`;
    const scopedKey = `anon:127.0.0.1:POST:/test-idempotent-action:${testKey}`;
    await query(
      `INSERT INTO idempotency_records (key, request_path, status, locked_at, expires_at)
      VALUES ($1, '/test-idempotent-action', 'PROCESSING', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day')`,
      [scopedKey],
    );
    await query('SELECT cleanup_expired_idempotency_records()');
    executionCount = 0;
    const result = await fetch(`${baseUrl}/test-idempotent-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': testKey },
      body: '{}',
    });
    expect(result.status).toBe(409);
    expect(executionCount).toBe(0);
    expect(
      (await query('SELECT status FROM idempotency_records WHERE key=$1', [scopedKey])).rows[0]
        .status,
    ).toBe('PROCESSING');
  });

  it('retains ownership when a pooled connection changes timezone before completion', async () => {
    const changePoolTimezone = (timezone: string) =>
      runSharedMaintenanceTask(async () => {
        const loans = await Promise.allSettled(
          Array.from({ length: pool.options.max || 10 }, () => getClient()),
        );
        const clients = loans.flatMap((loan) => (loan.status === 'fulfilled' ? [loan.value] : []));
        try {
          const failed = loans.find((loan) => loan.status === 'rejected');
          if (failed?.status === 'rejected') throw failed.reason;
          await Promise.all(
            clients.map((client) =>
              client.query("SELECT set_config('TimeZone',$1,false)", [timezone]),
            ),
          );
        } finally {
          clients.forEach((client) => client.release());
        }
      });
    executionCount = 0;
    let release!: () => void;
    heldRequest = new Promise((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      enterHeldRequest = resolve;
    });
    const first = fetch(`${baseUrl}/test-idempotent-action?hold=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `test-zone-${Date.now()}` },
      body: '{}',
    });
    await entered;
    try {
      await changePoolTimezone('UTC');
      release();
      expect((await first).status).toBe(201);
      expect(executionCount).toBe(1);
    } finally {
      // A failed checkout must still release the held HTTP request and every loan.
      release();
      await first;
      enterHeldRequest = undefined;
      heldRequest = undefined;
      await changePoolTimezone('Africa/Cairo');
    }
  });
});

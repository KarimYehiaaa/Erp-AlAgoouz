import { afterAll, beforeAll, expect, it } from 'vitest';
import pg from 'pg';
import pool, { query, getClient, withTransaction } from '../src/database/pool.ts';
import { databaseConnectionOptions } from '../src/database/connectionOptions.ts';
import {
  runSharedMaintenanceTask,
  withExclusiveMaintenance,
  recordMaintenancePrincipal,
} from '../src/database/maintenanceBarrier.ts';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let inspector: pg.Client;
beforeAll(async () => {
  inspector = new pg.Client(databaseConnectionOptions());
  await inspector.connect();
});
afterAll(async () => {
  await inspector?.end();
});

const waitForExclusive = async () => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const waiting = await inspector.query(
      `SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=1095516487
       AND objid=1 AND mode='ExclusiveLock' AND NOT granted`,
    );
    if (waiting.rowCount) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Exclusive maintenance did not reach its database lock');
};

it('returns every business loan after concurrent pooled queries in one admitted task', async () => {
  await runSharedMaintenanceTask(async () => {
    const results = await Promise.allSettled(
      Array.from({ length: (pool.options.max || 10) + 2 }, () => query('SELECT 42 AS value')),
    );
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
  });
  expect(pool.waitingCount).toBe(0);
  expect(pool.idleCount).toBe(pool.totalCount);
});

it('coordinates with another database connection, independently of process memory', async () => {
  await inspector.query('BEGIN READ ONLY');
  await inspector.query('SELECT pg_advisory_xact_lock_shared(1095516487,1)');
  let entered = false;
  const maintenance = withExclusiveMaintenance(async () => {
    entered = true;
    expect((await query('SELECT 42 AS value')).rows[0].value).toBe(42);
  });
  try {
    await waitForExclusive();
    expect(entered).toBe(false);
  } finally {
    await inspector.query('ROLLBACK');
    await maintenance;
  }
  expect(entered).toBe(true);
});

it('lets admitted work start a transaction while exclusive maintenance is queued', async () => {
  const started = deferred();
  const continueWork = deferred();
  const task = runSharedMaintenanceTask(async () => {
    const client = await getClient();
    try {
      started.resolve();
      await continueWork.promise;
      await client.query('BEGIN');
      expect((await client.query('SELECT 73 AS value')).rows[0].value).toBe(73);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });
  await started.promise;
  const maintenance = withExclusiveMaintenance(async () => query('SELECT 1'));
  try {
    await waitForExclusive();
  } finally {
    continueWork.resolve();
    await task;
    await maintenance;
  }
});

it('refuses a delayed database write after its shared task has ended', async () => {
  const proceed = deferred();
  let lateWork!: Promise<unknown>;
  await runSharedMaintenanceTask(async () => {
    lateWork = (async () => {
      await proceed.promise;
      return query('SELECT 1');
    })();
  });
  const rejected = expect(lateWork).rejects.toMatchObject({ code: 'SYSTEM_MAINTENANCE' });
  proceed.resolve();
  await rejected;
  expect((await query('SELECT 99 AS value')).rows[0].value).toBe(99);
});

it('keeps nested transaction work admitted while maintenance is queued', async () => {
  const started = deferred();
  const proceed = deferred();
  const work = withTransaction(async (client) => {
    started.resolve();
    await proceed.promise;
    expect((await query('SELECT 41 AS value')).rows[0].value).toBe(41);
    expect((await client.query('SELECT 42 AS value')).rows[0].value).toBe(42);
  });
  await started.promise;
  const maintenance = withExclusiveMaintenance(async () => query('SELECT 1'));
  try {
    await waitForExclusive();
  } finally {
    proceed.resolve();
    await work;
    await maintenance;
  }
});

it('drains admitted transactions even when every business pool connection is occupied', async () => {
  const occupied = deferred();
  const proceed = deferred();
  const work = runSharedMaintenanceTask(async () => {
    const clients: pg.PoolClient[] = [];
    try {
      for (let index = 0; index < pool.options.max!; index++) clients.push(await getClient());
      expect(pool.idleCount).toBe(0);
      occupied.resolve();
      await proceed.promise;
      const results = await Promise.allSettled(
        clients.map(async (client) => {
          try {
            await client.query('BEGIN');
            await client.query('SELECT 1');
            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          }
        }),
      );
      expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    } finally {
      for (const client of clients) client.release();
    }
  });
  await Promise.race([
    occupied.promise,
    work.then(() => {
      throw new Error('Pool was not occupied');
    }),
  ]);
  const maintenance = withExclusiveMaintenance(async () => query('SELECT 1'));
  try {
    await waitForExclusive();
  } finally {
    proceed.resolve();
    await work;
    await maintenance;
  }
});

it('releases its exclusive lock after work fails, allowing the next operation', async () => {
  await expect(withExclusiveMaintenance(async () => query('SELECT 1 / 0'))).rejects.toThrow(
    'division by zero',
  );
  await withExclusiveMaintenance(async () => {
    expect((await query('SELECT 7 AS value')).rows[0].value).toBe(7);
  });
  expect((await query('SELECT 8 AS value')).rows[0].value).toBe(8);
});

it('releases its principal lookup table lock before an exclusive maintenance write', async () => {
  const actor = (
    await query(`SELECT id,session_generation,token_version FROM users
    WHERE is_active=TRUE AND deleted_at IS NULL ORDER BY id LIMIT 1`)
  ).rows[0];
  await runSharedMaintenanceTask(async () => {
    recordMaintenancePrincipal(actor.id, actor.session_generation, Number(actor.token_version));
    await withExclusiveMaintenance(async () => {
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL statement_timeout=1000');
        await client.query('LOCK TABLE users IN ACCESS EXCLUSIVE MODE');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });
  });
});

it('fails closed when its admission connection is lost during a business transaction', async () => {
  await expect(
    runSharedMaintenanceTask(async () => {
      const client = await getClient();
      try {
        await client.query('BEGIN');
        const pid = (
          await inspector.query(
            `SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=1095516487
         AND objid=1 AND mode='ShareLock' AND granted`,
          )
        ).rows[0]?.pid;
        expect(pid).toBeDefined();
        await inspector.query('SELECT pg_terminate_backend($1)', [pid]);
        // Wait until the terminated connection is removed from the server.
        const deadline = Date.now() + 2000;
        while (
          (await inspector.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid])).rowCount
        ) {
          if (Date.now() > deadline) throw new Error('Admission connection did not terminate');
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await new Promise((resolve) => setImmediate(resolve));
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    }),
  ).rejects.toThrow();
  await withExclusiveMaintenance(async () => {
    expect((await query('SELECT 5 AS value')).rows[0].value).toBe(5);
  });
});

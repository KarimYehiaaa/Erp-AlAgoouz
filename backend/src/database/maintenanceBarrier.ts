import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { databaseConnectionOptions, isLoopbackDatabaseConnection } from './connectionOptions.ts';
import { AppError } from '../types/errors.ts';

// Two separate lock levels prevent a queued restore from deadlocking an admitted
// request that still needs to start a business transaction. Always acquire 1 then 2.
const namespace = 1095516487;
const admissionKey = 1;
const transactionKey = 2;
const configuredMax = Number.parseInt(process.env.DB_MAINTENANCE_POOL_MAX || '', 10);
const connectionOptions = databaseConnectionOptions();
const loopbackDatabase = isLoopbackDatabaseConnection(connectionOptions);
// Remote session-pooler budgets include both pools; keep their admission default
// conservative even when the API process itself runs on the shop computer.
const defaultMax =
  !loopbackDatabase || process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL
    ? 3
    : 10;
const admissionPool = new pg.Pool({
  ...connectionOptions,
  max:
    Number.isFinite(configuredMax) && configuredMax > 0 ? Math.min(configuredMax, 10) : defaultMax,
  min: 0,
  idleTimeoutMillis: 2000,
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
  statement_timeout: 10000,
  allowExitOnIdle: true,
  application_name: 'alagoouz-maintenance-admission',
});
admissionPool.on('error', () => {});

type Lease = { release: () => Promise<void>; onLost: (handler: () => void) => void };
type Scope = {
  mode: 'shared' | 'upgrading' | 'exclusive' | 'closed';
  lease: Lease | null;
  ended: boolean;
  pending: number;
  closing: boolean;
  lost: boolean;
  clients: Set<pg.PoolClient>;
  principal?: { userId: number; generation: string; version: number };
  closed: Promise<void>;
  resolveClosed: () => void;
};
const scopes = new AsyncLocalStorage<Scope>();
let exclusivePrincipalValidator: ((scope: Scope) => Promise<void>) | undefined;

const unavailable = (phase = 'scope', cause?: unknown) => {
  const error = new AppError(
    'النظام مشغول أو ينفذ صيانة أو استعادة. انتظر قليلًا ثم أعد المحاولة.',
    503,
    'SYSTEM_MAINTENANCE',
  );
  if (process.env.NODE_ENV === 'test') {
    Object.assign(error, {
      maintenanceDiagnostics: {
        phase,
        total: admissionPool.totalCount,
        idle: admissionPool.idleCount,
        waiting: admissionPool.waitingCount,
        cause: cause instanceof Error ? cause.name : undefined,
      },
    });
  }
  return error;
};

const createLease = async (
  client: pg.PoolClient | pg.Client,
  exclusive: boolean,
): Promise<Lease> => {
  let released = false;
  let lost = false;
  const listeners = new Set<() => void>();
  const onLost = () => {
    if (released || lost) return;
    lost = true;
    for (const listener of listeners) listener();
  };
  client.on('error', onLost);
  client.on('end', onLost);
  const dispose = async () => {
    if (released) return;
    released = true;
    let releaseError: Error | undefined;
    try {
      await client.query('ROLLBACK');
    } catch {
      releaseError = new Error('Maintenance lease connection was lost');
    } finally {
      client.off('error', onLost);
      client.off('end', onLost);
      if ('release' in client) client.release(releaseError);
      else await client.end().catch(() => undefined);
    }
  };
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(
      `SELECT pg_advisory_xact_lock${exclusive ? '' : '_shared'}($1::int,$2::int)`,
      [namespace, admissionKey],
    );
    if (lost) throw unavailable();
    return {
      release: dispose,
      onLost: (handler) => {
        listeners.add(handler);
        if (lost) handler();
      },
    };
  } catch (error) {
    await dispose();
    throw unavailable(exclusive ? 'exclusive_lock' : 'admission_lock', error);
  }
};

const acquireShared = async () => {
  let client: pg.PoolClient;
  try {
    client = await admissionPool.connect();
  } catch (error) {
    throw unavailable('admission_connection', error);
  }
  return createLease(client, false);
};

const newScope = (lease: Lease | null, mode: Scope['mode'] = 'shared'): Scope => {
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const scope: Scope = {
    mode,
    lease,
    ended: false,
    pending: 0,
    closing: false,
    lost: false,
    clients: new Set(),
    closed,
    resolveClosed,
  };
  if (lease) attachLease(scope, lease);
  return scope;
};

const attachLease = (scope: Scope, lease: Lease) => {
  scope.lease = lease;
  lease.onLost(() => {
    scope.lost = true;
    scope.ended = true;
    // Stop owned business connections. Their transaction locks remain until
    // PostgreSQL rolls them back, so restore cannot race their queued writes.
    for (const client of scope.clients) void client.end().catch(() => undefined);
    scheduleClose(scope);
  });
};

const scheduleClose = (scope: Scope) => {
  if (
    !scope.ended ||
    scope.pending ||
    scope.closing ||
    scope.mode === 'exclusive' ||
    scope.mode === 'upgrading'
  )
    return;
  scope.closing = true;
  // Let response/audit/idempotency microtasks register their database work first.
  setImmediate(() => {
    scope.closing = false;
    if (scope.pending || !scope.ended || scope.mode !== 'shared') return;
    scope.mode = 'closed';
    const lease = scope.lease;
    scope.lease = null;
    void (lease?.release() || Promise.resolve())
      .catch(() => {
        scope.lost = true;
      })
      .finally(scope.resolveClosed);
  });
};

export const assertMaintenanceScopeUsable = () => {
  const scope = scopes.getStore();
  if (scope && (scope.lost || scope.mode === 'closed' || scope.mode === 'upgrading'))
    throw unavailable();
};

export const recordMaintenancePrincipal = (userId: number, generation: string, version: number) => {
  const scope = scopes.getStore();
  if (scope) scope.principal = { userId, generation, version };
};

const validatePrincipal = async (run: (...args: any[]) => Promise<any>, scope?: Scope) => {
  if (!scope?.principal) return;
  const { userId, generation, version } = scope.principal;
  const row = (
    await run(
      'SELECT session_generation,token_version FROM users WHERE id=$1 AND is_active=TRUE AND deleted_at IS NULL',
      [userId],
    )
  ).rows[0];
  if (!row || row.session_generation !== generation || Number(row.token_version) !== version) {
    throw new AppError('تم إلغاء الجلسة. يرجى تسجيل الدخول مرة أخرى', 401, 'SESSION_REVOKED');
  }
};

/** Runs on the business connection, inside its actual transaction. */
export const protectBusinessTransaction = async (run: (...args: any[]) => Promise<any>) => {
  assertMaintenanceScopeUsable();
  const scope = scopes.getStore();
  await run(
    `SELECT pg_advisory_xact_lock${scope?.mode === 'exclusive' ? '' : '_shared'}($1::int,$2::int)`,
    [namespace, transactionKey],
  );
  assertMaintenanceScopeUsable();
  // The admission lease prevents restore throughout this request. Rechecking a
  // principal here would reject its own audit after logout/password changes.
  // An exclusive upgrade drops that lease and validates the principal anew.
};

/** Bind every loan (including pg's callback API) to its admitted operation. */
export const protectPoolConnections = (pool: pg.Pool) => {
  // Validate in a short business transaction. Reading users on the long-lived
  // control transaction would retain its table lock and deadlock TRUNCATE users.
  exclusivePrincipalValidator = (scope) => validatePrincipal(pool.query.bind(pool), scope);
  const connect = pool.connect.bind(pool) as () => Promise<pg.PoolClient>;
  const checkout = async () => {
    let scope = scopes.getStore();
    if (!scope) {
      scope = newScope(await acquireShared());
      scope.ended = true; // This standalone loan ends when its client is released.
    }
    assertScope(scope);
    scope.pending++;
    let client: pg.PoolClient;
    try {
      client = await scopes.run(scope, connect);
    } catch (error) {
      scope.pending--;
      scheduleClose(scope);
      throw error;
    }
    scope.clients.add(client);
    const query = client.query;
    const release = client.release.bind(client);
    let returned = false;
    client.query = ((...args: any[]) =>
      scopes.run(scope!, () => query.apply(client, args as any))) as typeof client.query;
    client.release = (error) => {
      if (returned) return release(error);
      returned = true;
      client.query = query;
      try {
        release(error);
      } finally {
        scope!.clients.delete(client);
        scope!.pending--;
        scheduleClose(scope!);
      }
    };
    return { client, scope };
  };
  const assertScope = (scope: Scope) => {
    if (scope.lost || scope.mode === 'closed' || scope.mode === 'upgrading') throw unavailable();
  };
  (pool as any).connect = (callback?: (...args: any[]) => void) => {
    const result = checkout();
    if (typeof callback !== 'function') return result.then(({ client }) => client);
    void result.then(
      ({ client, scope }) => scopes.run(scope, () => callback(null, client, client.release)),
      (error) => callback(error),
    );
    return undefined;
  };
};

export const runSharedMaintenanceTask = async <T>(work: () => Promise<T>): Promise<T> => {
  if (scopes.getStore()) {
    assertMaintenanceScopeUsable();
    return work();
  }
  const scope = newScope(await acquireShared());
  try {
    return await scopes.run(scope, work);
  } finally {
    scope.ended = true;
    scheduleClose(scope);
    await scope.closed;
  }
};

export const withExclusiveMaintenance = async <T>(work: () => Promise<T>): Promise<T> => {
  const parent = scopes.getStore();
  if (parent?.mode === 'exclusive') {
    assertMaintenanceScopeUsable();
    return work();
  }
  if (parent) {
    assertMaintenanceScopeUsable();
    if (parent.pending)
      throw new AppError('انتظر انتهاء عمليات الطلب قبل الاستعادة', 409, 'REQUEST_IN_PROGRESS');
    parent.mode = 'upgrading';
    await parent.lease?.release();
    parent.lease = null;
  }
  const scope = parent || newScope(null, 'upgrading');
  const client = new pg.Client({
    ...databaseConnectionOptions(),
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
    query_timeout: 35000,
    application_name: 'alagoouz-maintenance-exclusive',
  });
  client.on('error', () => {});
  let lease: Lease | undefined;
  try {
    await client.connect();
    lease = await createLease(client, true);
    scope.mode = 'exclusive';
    lease.onLost(() => {
      scope.lost = true;
      for (const businessClient of scope.clients) void businessClient.end().catch(() => undefined);
    });
    return await scopes.run(scope, async () => {
      if (scope.principal) {
        if (!exclusivePrincipalValidator) throw unavailable();
        await exclusivePrincipalValidator(scope);
      }
      assertMaintenanceScopeUsable();
      return work();
    });
  } finally {
    await lease?.release();
    if (!lease) await client.end().catch(() => undefined);
    scope.mode = 'upgrading';
    if (parent && !parent.ended && !parent.lost) {
      try {
        const replacement = await acquireShared();
        parent.mode = 'shared';
        attachLease(parent, replacement);
        scheduleClose(parent);
      } catch {
        parent.lost = true;
        parent.mode = 'closed';
        parent.resolveClosed();
      }
    } else {
      scope.mode = 'closed';
      scope.resolveClosed();
    }
  }
};

export const maintenanceRequest = async (req: any, res: any, next: any) => {
  if (req.method === 'OPTIONS' || /\/(?:health|sync\/status)$/.test(req.path)) return next();
  try {
    const scope = newScope(await acquireShared());
    const ended = () => {
      scope.ended = true;
      scheduleClose(scope);
    };
    res.once('finish', ended);
    res.once('close', ended);
    if (res.destroyed) {
      ended();
      return;
    }
    scopes.run(scope, next);
  } catch (error) {
    next(error);
  }
};

export const closeMaintenancePool = () => admissionPool.end();

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import app from '../src/app.ts';
import { query } from '../src/database/pool.ts';
import { login, logout } from '../src/services/authService.ts';
import {
  clearAllData,
  readBackupSnapshot,
  restoreBackupContent,
} from '../src/services/backupService.ts';
import { encrypt } from '../src/utils/crypto.ts';

type ProfitLossFixture = { operating_expenses: { total: number } };
type DashboardFixture = { monthlyExpenses: number };

// Restoration truncates the complete contract: run only in a dedicated disposable database.
describe.skipIf(process.env.ERP_RESTORE_TEST !== '1')('restore session revocation', () => {
  let server: http.Server;
  let base: string;
  let username: string;
  let userId: number;
  let session: Awaited<ReturnType<typeof login>>;
  let snapshot: Awaited<ReturnType<typeof readBackupSnapshot>>;
  const password = 'IsolatedRestoreSession123!';
  const request = async <T = unknown>(path: string, token: string, body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: 'null',
        Authorization: `Bearer ${token}`,
        'X-Client-Type': 'desktop-pos',
        'User-Agent': 'AlAgoouz-POS/1.0.15 Electron/44.4.3',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    return { status: response.status, data: (await response.json()) as { data: T } };
  };
  const restore = async (data = snapshot) =>
    restoreBackupContent(
      JSON.stringify({
        encrypted: true,
        payload: encrypt(JSON.stringify({ data })),
      }),
    );
  const assertRevoked = async (oldSession = session) => {
    expect((await request('/auth/profile', oldSession.token)).status).toBe(401);
    expect(
      (await request('/auth/refresh', oldSession.token, { refreshToken: oldSession.refreshToken }))
        .status,
    ).toBe(401);
    expect(
      (await query('SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE revoked=FALSE')).rows[0].n,
    ).toBe(0);
  };

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });
  beforeEach(async () => {
    username = `rs-${randomUUID()}`;
    const role = (await query("SELECT id FROM roles WHERE name='admin'")).rows[0];
    userId = (
      await query(
        `INSERT INTO users (username,password_hash,full_name,role_id,is_active)
      VALUES ($1,$2,'Restore session fixture',$3,TRUE) RETURNING id`,
        [username, await bcrypt.hash(password, 10), role.id],
      )
    ).rows[0].id;
    session = await login(username, password);
    // Establish a valid HTTP refresh channel before any destructive operation:
    // otherwise a wrong-client 401 can falsely appear to prove session revocation.
    const renewed = await request<{ token: string; refreshToken: string }>(
      '/auth/refresh',
      session.token,
      {
        refreshToken: session.refreshToken,
      },
    );
    expect(renewed.status, 'Desktop refresh must work before the maintenance operation').toBe(200);
    expect(typeof renewed.data.data?.token).toBe('string');
    expect(typeof renewed.data.data?.refreshToken).toBe('string');
    session = { ...session, ...renewed.data.data };
    expect((await request('/auth/profile', session.token)).status).toBe(200);
    snapshot = await readBackupSnapshot();
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('does not resurrect a logged-out access or refresh session from an encrypted backup', async () => {
    expect((await request('/auth/profile', session.token)).status).toBe(200);
    await logout(userId);
    expect((await request('/auth/profile', session.token)).status).toBe(401);
    await restore();
    await assertRevoked();
    const fresh = await login(username, password);
    expect((await request('/auth/profile', fresh.token)).status).toBe(200);
    expect(fresh.user).not.toHaveProperty('session_generation');
  });

  it('uses a new generation for repeated restores and for a physically reintroduced account', async () => {
    await restore();
    await assertRevoked();
    const firstGeneration = (
      await query('SELECT session_generation FROM users WHERE id=$1', [userId])
    ).rows[0].session_generation;
    const fresh = await login(username, password);
    await query('DELETE FROM refresh_tokens WHERE user_id=$1', [userId]);
    await query('DELETE FROM activity_logs WHERE user_id=$1', [userId]);
    await query('DELETE FROM users WHERE id=$1', [userId]);
    await restore();
    await assertRevoked(fresh);
    const secondGeneration = (
      await query('SELECT session_generation FROM users WHERE id=$1', [userId])
    ).rows[0].session_generation;
    expect(secondGeneration).not.toBe(firstGeneration);
    await assertRevoked();
  });

  it('accepts legacy backup rows without the generation column while revoking pre-restore sessions', async () => {
    const legacy = structuredClone(snapshot);
    for (const user of legacy.users) delete user.session_generation;
    await restore(legacy);
    await assertRevoked();
    const fresh = await login(username, password);
    expect((await request('/auth/profile', fresh.token)).status).toBe(200);
  });

  it('preserves current access and refresh credentials when restoration rolls back', async () => {
    const before = await query('SELECT * FROM users WHERE id=$1', [userId]);
    const damaged = structuredClone(snapshot);
    damaged.users.find((user) => user.id === userId)!.role_id = 2147483647;
    await expect(restore(damaged)).rejects.toMatchObject({ statusCode: 400 });
    expect((await query('SELECT * FROM users WHERE id=$1', [userId])).rows).toEqual(before.rows);
    expect((await request('/auth/profile', session.token)).status).toBe(200);
    expect(
      (await request('/auth/refresh', session.token, { refreshToken: session.refreshToken }))
        .status,
    ).toBe(200);
  });

  it('records the HTTP file restore atomically after revoking the initiating session', async () => {
    const form = new FormData();
    form.append(
      'file',
      new Blob([JSON.stringify({ data: snapshot })], { type: 'application/json' }),
      'isolated.json',
    );
    const response = await fetch(`${base}/backup/restore-file`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.token}`,
        'x-confirm-action': 'CONFIRM_RESTORE_BACKUP',
      },
      body: form,
      signal: AbortSignal.timeout(90000),
    });
    expect(response.status, JSON.stringify(await response.json())).toBe(200);
    const rows = (
      await query(
        "SELECT user_id,new_data FROM audit_logs WHERE action='backup_restore_file' AND new_data->>'actor_username'=$1",
        [username],
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(userId);
    expect(rows[0].new_data.restored).toBe(Object.keys(snapshot).length);
    await assertRevoked();
  });

  it('returns restored reports and recipe costs after a fresh login instead of old cached values', async () => {
    const product = async (suffix: string) =>
      (
        await query(
          `INSERT INTO products(sku,name_ar,unit,purchase_price,sale_price,category_id)
       VALUES($1,$2,'count',10,100,1) RETURNING id`,
          [
            `restore-cache-${randomUUID().slice(0, 16)}-${suffix}`,
            `restore cache ${suffix} ${randomUUID()}`,
          ],
        )
      ).rows[0].id as number;
    const ingredientId = await product('ingredient');
    const parentId = await product('recipe');
    const recipeId = (
      await query(
        "INSERT INTO product_recipes(product_id,name_ar,is_active) VALUES($1,'restore cache recipe',TRUE) RETURNING id",
        [parentId],
      )
    ).rows[0].id;
    await query(
      `INSERT INTO product_recipe_items(recipe_id,ingredient_product_id,quantity,unit_code)
      VALUES($1,$2,1,'count')`,
      [recipeId, ingredientId],
    );
    snapshot = await readBackupSnapshot();
    await query('UPDATE products SET purchase_price=97 WHERE id=$1', [ingredientId]);
    await query(
      `INSERT INTO expenses(expense_number,title,amount,expense_date)
      VALUES($1,'restore cache expense',50,'2101-01-16')`,
      [`restore-cache-${randomUUID()}`],
    );
    const values = async (token: string) => {
      const pl = await request<ProfitLossFixture>(
        '/reports/pl/monthly?from_date=2101-01-01&to_date=2101-01-31',
        token,
      );
      const dashboard = await request<DashboardFixture>(
        '/dashboard?range=custom&from_date=2101-01-01&to_date=2101-01-31',
        token,
      );
      const product = await request<{ purchase_price: number | string }>(
        `/products/${parentId}`,
        token,
      );
      for (const response of [pl, dashboard, product]) expect(response.status).toBe(200);
      return [
        pl.data.data.operating_expenses.total,
        dashboard.data.data.monthlyExpenses,
        Number(product.data.data.purchase_price),
      ];
    };
    expect(await values(session.token)).toEqual([50, 50, 97]);
    await restore();
    const fresh = await login(username, password);
    expect(await values(fresh.token)).toEqual([0, 0, 10]);
  });

  it('rolls back the data and session rotation if the maintenance audit cannot be stored', async () => {
    const before = (await query('SELECT * FROM users WHERE id=$1', [userId])).rows;
    await query(
      "ALTER TABLE audit_logs ADD CONSTRAINT isolated_maintenance_audit CHECK (action <> 'backup_restore')",
    );
    try {
      await expect(
        restoreBackupContent(JSON.stringify({ data: snapshot }), {
          userId,
          username,
          action: 'backup_restore',
        }),
      ).rejects.toThrow('isolated_maintenance_audit');
      expect((await query('SELECT * FROM users WHERE id=$1', [userId])).rows).toEqual(before);
      expect((await request('/auth/profile', session.token)).status).toBe(200);
    } finally {
      await query('ALTER TABLE audit_logs DROP CONSTRAINT isolated_maintenance_audit');
    }
  });

  it('clears cached reports and revokes pre-reset credentials when business data is reset', async () => {
    await query(
      `INSERT INTO expenses(expense_number,title,amount,expense_date)
      VALUES($1,'reset cache fixture',50,'2102-01-16')`,
      [`reset-cache-${randomUUID()}`],
    );
    const values = async (token: string) => {
      const pl = await request<ProfitLossFixture>(
        '/reports/pl/monthly?from_date=2102-01-01&to_date=2102-01-31',
        token,
      );
      const dashboard = await request<DashboardFixture>(
        '/dashboard?range=custom&from_date=2102-01-01&to_date=2102-01-31',
        token,
      );
      expect(pl.status).toBe(200);
      expect(dashboard.status).toBe(200);
      return [pl.data.data.operating_expenses.total, dashboard.data.data.monthlyExpenses];
    };
    expect(await values(session.token)).toEqual([50, 50]);
    await clearAllData();
    const oldStatus = (await request('/auth/profile', session.token)).status;
    const fresh = await login(username, password);
    expect(await values(fresh.token)).toEqual([0, 0]);
    expect(oldStatus).toBe(401);
    expect(
      (await request('/auth/refresh', session.token, { refreshToken: session.refreshToken }))
        .status,
    ).toBe(401);
  });
});

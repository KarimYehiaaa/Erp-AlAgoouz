import { expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import app from '../src/app.ts';
import routes from '../src/routes/index.ts';
import { authenticate } from '../src/middleware/auth.ts';
import { query } from '../src/database/pool.ts';
import { login } from '../src/services/authService.ts';
import { readBackupSnapshot, restoreBackupContent } from '../src/services/backupService.ts';

// Complete-contract restoration is destructive and must use the isolated runner.
it.skipIf(process.env.ERP_RESTORE_TEST !== '1')(
  'drains an authenticated in-flight write before restoring and refuses its old session afterward',
  async () => {
    const suffix = randomUUID();
    const username = `ri-${suffix}`;
    const marker = `Isolated inflight fixture ${suffix}`;
    const routePath = `/__restore_inflight_${suffix}`;
    const password = 'IsolatedInflightRestore123!';
    const role = (await query("SELECT id FROM roles WHERE name='admin'")).rows[0];
    await query(
      `INSERT INTO users (username,password_hash,full_name,role_id,is_active)
       VALUES ($1,$2,'Inflight restore fixture',$3,TRUE)`,
      [username, await bcrypt.hash(password, 10), role.id],
    );
    const session = await login(username, password);
    const snapshot = await readBackupSnapshot();
    let releaseWrite!: () => void;
    const paused = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    let reachedWrite!: () => void;
    const authenticated = new Promise<void>((resolve) => {
      reachedWrite = resolve;
    });
    routes.post(routePath, authenticate, async (_req, res, next) => {
      try {
        reachedWrite();
        await paused;
        await query('INSERT INTO customers (name_ar) VALUES ($1)', [marker]);
        res.status(200).json({ success: true });
      } catch (error) {
        next(error);
      }
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    const send = () =>
      fetch(`${base}${routePath}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        signal: AbortSignal.timeout(90000),
      });
    let pendingRequest: ReturnType<typeof send> | undefined;
    let restoration: ReturnType<typeof restoreBackupContent> | undefined;
    let observationTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      pendingRequest = send();
      await Promise.race([
        authenticated,
        pendingRequest.then(() => {
          throw new Error('Request did not reach the paused write');
        }),
      ]);
      restoration = restoreBackupContent(JSON.stringify({ data: snapshot }));
      const observed = await Promise.race([
        restoration.then(() => 'completed'),
        new Promise<string>((resolve) => {
          observationTimer = setTimeout(() => resolve('pending'), 3000);
        }),
      ]);
      clearTimeout(observationTimer);
      releaseWrite();
      expect((await pendingRequest).status).toBe(200);
      await restoration;
      expect
        .soft(observed, 'Restore must wait for the already-authenticated request to finish')
        .toBe('pending');
      expect(
        (await query('SELECT COUNT(*)::int AS count FROM customers WHERE name_ar=$1', [marker]))
          .rows[0].count,
      ).toBe(0);
      expect((await send()).status).toBe(401);
    } finally {
      clearTimeout(observationTimer);
      releaseWrite();
      await pendingRequest?.catch(() => undefined);
      await restoration?.catch(() => undefined);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      const index = routes.stack.findIndex((layer) => layer.route?.path === routePath);
      if (index >= 0) routes.stack.splice(index, 1);
    }
  },
  120000,
);

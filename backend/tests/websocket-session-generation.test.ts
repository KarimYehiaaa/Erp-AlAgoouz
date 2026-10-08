import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import WebSocket, { type WebSocketServer } from 'ws';
import app from '../src/app.ts';
import { getClient, query } from '../src/database/pool.ts';
import { broadcast, initWebSocket } from '../src/services/websocketService.ts';

const webOrigin = 'https://agoouz.vercel.app';
const password = 'IsolatedWebSocketFixture123!';
const username = `websocket-${randomUUID()}`;
const openedSockets = new Set<WebSocket>();
let server: http.Server;
let wss: WebSocketServer | undefined;
let origin: string;
let userId: number | undefined;
let adminRoleId: number;
let cashierRoleId: number;

const loginCookie = async () => {
  const response = await fetch(`${origin}/api/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: webOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(5000),
  });
  const result = (await response.json()) as { data: { user: { id: number } } };
  expect(response.status).toBe(200);
  expect(result.data.user.id).toBe(userId);
  const cookies = response.headers.getSetCookie();
  expect(cookies.some((cookie) => cookie.startsWith('access_token='))).toBe(true);
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
};

const connect = async (cookie: string) => {
  const existingPeers = new Set(wss?.clients || []);
  const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/ws`, {
    origin: webOrigin,
    headers: { Cookie: cookie },
  });
  openedSockets.add(socket);
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('open', onOpen);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Socket closed during connection'));
    };
    const timer = setTimeout(() => {
      cleanup();
      socket.terminate();
      reject(new Error('WebSocket connection timed out'));
    }, 3000);
    socket.once('open', onOpen);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
  // The client receives OPEN before the asynchronous database authentication finishes.
  const deadline = Date.now() + 3000;
  while (
    ![...(wss?.clients || [])].some(
      (peer) =>
        !existingPeers.has(peer) && peer.userId === userId && peer.readyState === WebSocket.OPEN,
    )
  ) {
    if (socket.readyState !== WebSocket.OPEN || Date.now() >= deadline) {
      throw new Error('WebSocket database authentication did not finish');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return socket;
};

const nextMessage = (socket: WebSocket): Promise<Record<string, unknown>> =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('message', onMessage);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    const onMessage = (data: import('ws').RawData) => {
      cleanup();
      try {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Socket closed before receiving the fixture event'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('WebSocket event timed out'));
    }, 3000);
    socket.once('message', onMessage);
    socket.once('error', onError);
    socket.once('close', onClose);
  });

const nextClose = (socket: WebSocket) =>
  new Promise<number>((resolve, reject) => {
    const onClose = (code: number) => {
      clearTimeout(timer);
      resolve(code);
    };
    const timer = setTimeout(() => {
      socket.off('close', onClose);
      reject(new Error('Revoked WebSocket did not close'));
    }, 3000);
    socket.once('close', onClose);
  });

beforeAll(async () => {
  const roles = await query('SELECT id, name FROM roles WHERE name = ANY($1::text[])', [
    ['admin', 'cashier'],
  ]);
  adminRoleId = Number(roles.rows.find((role) => role.name === 'admin')?.id);
  cashierRoleId = Number(roles.rows.find((role) => role.name === 'cashier')?.id);
  expect(adminRoleId).toBeGreaterThan(0);
  expect(cashierRoleId).toBeGreaterThan(0);
  userId = (
    await query(
      `INSERT INTO users (username,password_hash,full_name,role_id,is_active)
     VALUES ($1,$2,'Isolated WebSocket fixture',$3,TRUE) RETURNING id`,
      [username, await bcrypt.hash(password, 10), adminRoleId],
    )
  ).rows[0].id;
  server = http.createServer(app);
  wss = initWebSocket(server);
  expect(wss).toBeDefined();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await query(
    `UPDATE users SET role_id=$1, is_active=TRUE, deleted_at=NULL,
      password_changed_at=NULL, token_version=token_version+1,
      session_generation=gen_random_uuid() WHERE id=$2`,
    [adminRoleId, userId],
  );
});

afterAll(async () => {
  for (const socket of openedSockets) socket.terminate();
  for (const socket of wss?.clients || []) socket.terminate();
  if (wss) await new Promise<void>((resolve) => wss!.close(() => resolve()));
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (userId !== undefined) {
    await query('DELETE FROM refresh_tokens WHERE user_id=$1', [userId]);
    await query('DELETE FROM activity_logs WHERE user_id=$1', [userId]);
    await query('DELETE FROM users WHERE id=$1', [userId]);
  }
});

describe('real WebSocket session generation revocation', () => {
  it('waits for the new socket authentication even when another socket for the account is already open', async () => {
    const cookie = await loginCookie();
    await connect(cookie);
    const blocker = await getClient();
    let connected = false;
    let pending: Promise<WebSocket> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('LOCK TABLE users IN ACCESS EXCLUSIVE MODE');
      pending = connect(cookie).then((socket) => {
        connected = true;
        return socket;
      });
      const deadline = Date.now() + 2000;
      while ((wss?.clients.size || 0) < 2) {
        if (Date.now() >= deadline) throw new Error('Second socket transport did not open');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(connected).toBe(false);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      if (pending) await pending;
    }
    expect(connected).toBe(true);
  });

  it('closes an already-open session before broadcasting after generation changes, while a fresh login receives events', async () => {
    const stale = await connect(await loginCookie());
    const baseline = nextMessage(stale);
    await broadcast('session_generation_fixture', { phase: 'before' });
    expect(await baseline).toMatchObject({
      event: 'session_generation_fixture',
      data: { phase: 'before' },
    });
    const original = (await query('SELECT token_version FROM users WHERE id=$1', [userId])).rows[0];
    const afterRotation = (
      await query(
        'UPDATE users SET session_generation=gen_random_uuid() WHERE id=$1 RETURNING token_version',
        [userId],
      )
    ).rows[0];
    expect(afterRotation.token_version).toBe(original.token_version);

    const staleMessages: string[] = [];
    stale.on('message', (data) => staleMessages.push(data.toString()));
    const closed = nextClose(stale);
    await broadcast('session_generation_fixture', { phase: 'after' });
    expect(await closed).toBe(4001);
    expect(staleMessages).toEqual([]);

    const fresh = await connect(await loginCookie());
    const received = nextMessage(fresh);
    await broadcast('session_generation_fixture', { phase: 'fresh' });
    expect(await received).toMatchObject({
      event: 'session_generation_fixture',
      data: { phase: 'fresh' },
    });
    expect(staleMessages).toEqual([]);
  });

  it('refreshes the role of an open socket before sending privileged notifications', async () => {
    const socket = await connect(await loginCookie());
    const messages: string[] = [];
    socket.on('message', (data) => messages.push(data.toString()));

    await query('UPDATE users SET role_id=$1 WHERE id=$2', [cashierRoleId, userId]);
    await broadcast('approval:requested', { approval_id: 7 });
    expect(messages).toEqual([]);

    await query('UPDATE users SET role_id=$1 WHERE id=$2', [adminRoleId, userId]);
    const allowedEvent = nextMessage(socket);
    await broadcast('approval:requested', { approval_id: 8 });
    expect(await allowedEvent).toMatchObject({
      event: 'approval:requested',
      data: { approval_id: 8 },
    });
  });

  it.each([
    ['token version changes', 'UPDATE users SET token_version=token_version+1 WHERE id=$1'],
    ['account deactivation', 'UPDATE users SET is_active=FALSE WHERE id=$1'],
  ])('closes an open socket after %s', async (_case, updateSql) => {
    const socket = await connect(await loginCookie());
    const closed = nextClose(socket);
    await query(updateSql, [userId]);
    await broadcast('session_invalidation_fixture', {});
    expect(await closed).toBe(4001);
  });
});

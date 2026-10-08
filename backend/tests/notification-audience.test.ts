import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../src/app.ts';
import config from '../src/config/index.ts';
import { query } from '../src/database/pool.ts';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../src/services/userService.ts';

let server: http.Server;
let base: string;
let users: number[] = [];
let notifications: number[] = [];
let managerRole: number;
let cashierRole: number;
let globalId: number;
let personalId: number;
const token = async (id: number) => {
  const user = (
    await query('SELECT token_version, session_generation FROM users WHERE id=$1', [id])
  ).rows[0];
  return jwt.sign(
    { userId: id, ver: user.token_version, gen: user.session_generation, jti: randomUUID() },
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: '5m' },
  );
};
const request = async (id: number, path = '', method = 'GET') => {
  const response = await fetch(`${base}/notifications${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token(id)}` },
    signal: AbortSignal.timeout(10000),
  });
  expect(response.status).toBe(200);
  return await response.json();
};
const ownFixtures = async (id: number) =>
  (await getNotifications(id)).filter((row) => notifications.includes(row.id));

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  managerRole = (await query("SELECT id FROM roles WHERE name='manager'")).rows[0].id;
  cashierRole = (await query("SELECT id FROM roles WHERE name='cashier'")).rows[0].id;
});
beforeEach(async () => {
  users = [];
  notifications = [];
  for (const role of [managerRole, managerRole, cashierRole]) {
    users.push(
      (
        await query(
          "INSERT INTO users(username,password_hash,full_name,role_id,is_active) VALUES($1,'unused-fixture-hash','Notification fixture',$2,TRUE) RETURNING id",
          [`notification-${randomUUID()}`, role],
        )
      ).rows[0].id,
    );
  }
  globalId = (
    await query(
      "INSERT INTO notifications(type,title_ar,message_ar,data) VALUES('report','Financial fixture','Confidential totals',$1::jsonb) RETURNING id",
      [JSON.stringify({ retained: 'metadata' })],
    )
  ).rows[0].id;
  notifications.push(globalId);
  personalId = (
    await query(
      "INSERT INTO notifications(user_id,type,title_ar,message_ar) VALUES($1,'info','Personal fixture','Own message') RETURNING id",
      [users[2]],
    )
  ).rows[0].id;
  notifications.push(personalId);
});
afterEach(async () => {
  await query('DELETE FROM notifications WHERE id=ANY($1::int[])', [notifications]);
  await query('DELETE FROM activity_logs WHERE user_id=ANY($1::int[])', [users]);
  await query('DELETE FROM users WHERE id=ANY($1::int[])', [users]);
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('real PostgreSQL notification audience and independent read state', () => {
  it('keeps global financial reports out of cashier HTTP responses and writes', async () => {
    const response = await request(users[2]);
    expect(
      response.data
        .filter((row: { id: number }) => notifications.includes(row.id))
        .map((row: { id: number }) => row.id),
    ).toEqual([personalId]);
    await request(users[2], `/${globalId}/read`, 'PATCH');
    expect((await ownFixtures(users[0])).find((row) => row.id === globalId).is_read).toBe(false);
    expect(
      (await query('SELECT is_read,data FROM notifications WHERE id=$1', [globalId])).rows[0],
    ).toEqual({ is_read: false, data: { retained: 'metadata' } });
  });
  it('marks a global report independently for each manager', async () => {
    await request(users[0], `/${globalId}/read`, 'PATCH');
    expect((await ownFixtures(users[0]))[0].is_read).toBe(true);
    expect((await ownFixtures(users[1]))[0].is_read).toBe(false);
    await markAllNotificationsRead(users[1]);
    expect((await ownFixtures(users[1]))[0].is_read).toBe(true);
    expect(
      (await query('SELECT is_read,data FROM notifications WHERE id=$1', [globalId])).rows[0],
    ).toEqual({
      is_read: false,
      data: { retained: 'metadata', _read_by: { [users[0]]: true, [users[1]]: true } },
    });
  });
  it('merges simultaneous reads without losing other metadata or users', async () => {
    await Promise.all(users.slice(0, 2).map((id) => markNotificationRead(globalId, id)));
    const data = (await query('SELECT data FROM notifications WHERE id=$1', [globalId])).rows[0]
      .data;
    expect(data).toEqual({
      retained: 'metadata',
      _read_by: { [users[0]]: true, [users[1]]: true },
    });
  });
  it('rechecks the current role and rejects another user personal notification', async () => {
    await query('UPDATE users SET role_id=$1 WHERE id=$2', [cashierRole, users[0]]);
    expect(await ownFixtures(users[0])).toEqual([]);
    expect(await markNotificationRead(globalId, users[0])).toEqual({ updated: 0 });
    expect(await markNotificationRead(personalId, users[1])).toEqual({ updated: 0 });
    expect(await markNotificationRead(personalId, users[2])).toEqual({ updated: 1 });
    expect((await ownFixtures(users[2]))[0].is_read).toBe(true);
  });
  it('never inherits the old shared read flag and preserves the stored history', async () => {
    await query('UPDATE notifications SET is_read=TRUE WHERE id=$1', [globalId]);
    expect((await ownFixtures(users[0]))[0].is_read).toBe(false);
    await markNotificationRead(globalId, users[0]);
    expect(
      (await query('SELECT is_read FROM notifications WHERE id=$1', [globalId])).rows[0].is_read,
    ).toBe(true);
  });
  it('keeps read-all confined to the cashier own unread notifications', async () => {
    await request(users[2], '/read-all', 'PATCH');
    expect((await ownFixtures(users[2]))[0].is_read).toBe(true);
    expect((await ownFixtures(users[0]))[0].is_read).toBe(false);
  });
  it('denies global reads and updates to inactive accounts even at service level', async () => {
    await query('UPDATE users SET is_active=FALSE WHERE id=$1', [users[0]]);
    expect(await ownFixtures(users[0])).toEqual([]);
    expect(await markNotificationRead(globalId, users[0])).toEqual({ updated: 0 });
    expect(await markAllNotificationsRead(users[0])).toEqual({ updated: 0 });
  });
  it('rejects missing, fractional and unsafe identifiers before accessing notifications', async () => {
    for (const id of [undefined, 0, -1, 1.5, 2147483648, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(getNotifications(id)).rejects.toMatchObject({ code: 'USER_REQUIRED' });
      await expect(markNotificationRead(globalId, id)).rejects.toMatchObject({
        code: 'USER_REQUIRED',
      });
      await expect(markAllNotificationsRead(id)).rejects.toMatchObject({ code: 'USER_REQUIRED' });
    }
    for (const id of [0, -1, 1.5, 2147483648, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(markNotificationRead(id, users[0])).rejects.toMatchObject({
        code: 'INVALID_NOTIFICATION_ID',
      });
    }
  });
  it('keeps personal metadata intact and hides global read metadata from the response', async () => {
    await query('UPDATE notifications SET data=$1::jsonb WHERE id=$2', [
      JSON.stringify({ _read_by: ['invalid old map'], retained: 'metadata' }),
      globalId,
    ]);
    await markNotificationRead(globalId, users[0]);
    expect((await ownFixtures(users[0]))[0].data).toEqual({ retained: 'metadata' });
    expect(
      (await query('SELECT data FROM notifications WHERE id=$1', [globalId])).rows[0].data,
    ).toEqual({ retained: 'metadata', _read_by: { [users[0]]: true } });
    await query('UPDATE notifications SET data=$1::jsonb WHERE id=$2', [
      JSON.stringify({ _read_by: 'personal business field' }),
      personalId,
    ]);
    await markNotificationRead(personalId, users[2]);
    expect((await ownFixtures(users[2]))[0].data).toEqual({ _read_by: 'personal business field' });
  });
  it('denies notifications after soft deletion of the user', async () => {
    await query('UPDATE users SET deleted_at=NOW() WHERE id=$1', [users[0]]);
    expect(await ownFixtures(users[0])).toEqual([]);
    expect(await markNotificationRead(globalId, users[0])).toEqual({ updated: 0 });
    expect(await markAllNotificationsRead(users[0])).toEqual({ updated: 0 });
  });
});

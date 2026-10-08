import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import app from '../src/app.ts';
import { query } from '../src/database/pool.ts';
import { requiredText } from './helpers/requiredText.ts';

type Channel = { name: string; headers: Record<string, string>; token: string; refresh: string };
type ApiBody = {
  success?: boolean;
  code?: string;
  data: {
    user: { id: number; full_name?: string; [key: string]: unknown };
    token: string;
    refreshToken?: string;
    [key: string]: unknown;
  };
};
const webOrigin = 'https://agoouz.vercel.app';
const nativeOrigin = 'https://localhost';
const password = 'IsolatedChannelFixture123!';
let server: http.Server;
let base: string;
let userId: number | undefined;
let username: string;

const request = async (path: string, headers: Record<string, string>, body?: unknown) => {
  if (headers.Host) {
    // fetch normalizes Host; use real HTTP to exercise LAN virtual hosts accurately.
    return await new Promise<{
      response: { status: number; headers: Headers };
      data: ApiBody;
      cookies: string[];
    }>((resolve, reject) => {
      const req = http.request(
        `${base}${path}`,
        {
          method: body === undefined ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('error', reject);
          res.on('end', () => {
            try {
              const responseHeaders = new Headers();
              for (const [key, value] of Object.entries(res.headers)) {
                for (const item of Array.isArray(value)
                  ? value
                  : value === undefined
                    ? []
                    : [value])
                  responseHeaders.append(key, item);
              }
              resolve({
                response: { status: res.statusCode!, headers: responseHeaders },
                data: JSON.parse(Buffer.concat(chunks).toString()) as ApiBody,
                cookies: res.headers['set-cookie'] || [],
              });
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.on('error', reject);
      req.setTimeout(10000, () => req.destroy(new Error('HTTP fixture timed out')));
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    response,
    data: (await response.json()) as ApiBody,
    cookies: response.headers.getSetCookie(),
  };
};
const cookieHeader = (cookies: string[]) =>
  cookies.map((cookie) => cookie.split(';')[0]).join('; ');
const refreshCookie = (cookies: string[]) =>
  cookies
    .find((cookie) => cookie.startsWith('refresh_token='))
    ?.split(';')[0]
    .slice('refresh_token='.length) || '';
const login = async (name: string, origin: string, desktop = false): Promise<Channel> => {
  const headers: Record<string, string> = {
    Origin: origin,
    ...(desktop
      ? { 'X-Client-Type': 'desktop-pos', 'User-Agent': 'Mozilla/5.0 Electron/38.1.0' }
      : {}),
  };
  const result = await request('/auth/login', headers, { username, password });
  expect(result.response.status).toBe(200);
  expect(result.data.data.user.id).toBe(userId);
  if (desktop) {
    expect(result.cookies).toHaveLength(0);
    expect(result.response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(result.data.data.refreshToken).toBeTruthy();
    headers.Authorization = `Bearer ${result.data.data.token}`;
  } else {
    expect(result.data.data.refreshToken).toBeUndefined();
    expect(result.cookies.filter((cookie) => cookie.includes('HttpOnly'))).toHaveLength(2);
    expect(result.response.headers.get('access-control-allow-credentials')).toBe('true');
    headers.Cookie = cookieHeader(result.cookies);
  }
  return {
    name,
    headers,
    token: result.data.data.token,
    refresh: requiredText(
      desktop ? result.data.data.refreshToken : refreshCookie(result.cookies),
      `${name} refresh token`,
    ),
  };
};
const allChannels = async () => {
  // Force identical JWT iat values: uniqueness cannot rely on waiting one second.
  vi.spyOn(Date, 'now').mockReturnValue(Date.now());
  return [
    await login('web', webOrigin),
    await login('mobile', nativeOrigin),
    await login('desktop', 'null', true),
  ];
};

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});
beforeEach(async () => {
  userId = undefined;
  username = `channel-${randomUUID()}`;
  const role = (await query("SELECT id FROM roles WHERE name='admin'")).rows[0];
  expect(role).toBeDefined();
  userId = (
    await query(
      `INSERT INTO users (username,password_hash,full_name,role_id,is_active)
    VALUES ($1,$2,'Shared channel fixture',$3,TRUE) RETURNING id`,
      [username, await bcrypt.hash(password, 10), role.id],
    )
  ).rows[0].id;
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (userId === undefined) return;
  await query('DELETE FROM refresh_tokens WHERE user_id=$1', [userId]);
  await query('DELETE FROM activity_logs WHERE user_id=$1', [userId]);
  await query('DELETE FROM users WHERE id=$1', [userId]);
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('real shared-database authentication across the three channels', () => {
  it('rejects opaque-origin cookie reads even when a desktop header is forged', async () => {
    const web = await login('web', webOrigin);
    for (const origin of ['null', 'file://']) {
      const result = await request('/auth/profile', {
        ...web.headers,
        Origin: origin,
        'X-Client-Type': 'desktop-pos',
      });
      expect(result.response.status).toBe(403);
      expect(result.data.code).toBe('CSRF_ORIGIN_REJECTED');
    }
  });

  it('uses three distinct sessions in the same second and reads the current common user row', async () => {
    const channels = await allChannels();
    expect(new Set(channels.map((channel) => channel.refresh)).size).toBe(3);
    await query("UPDATE users SET full_name='Updated shared identity' WHERE id=$1", [userId]);
    for (const channel of channels) {
      const profile = await request('/auth/profile', channel.headers);
      expect(profile.response.status).toBe(200);
      expect(profile.data.data.user).toMatchObject({
        id: userId,
        full_name: 'Updated shared identity',
      });
    }
    const count = (
      await query(
        'SELECT COUNT(DISTINCT token_hash)::int AS count FROM refresh_tokens WHERE user_id=$1',
        [userId],
      )
    ).rows[0].count;
    expect(count).toBe(3);
  });

  it('does not disclose the desktop refresh token when a web origin spoofs the client marker', async () => {
    const result = await request(
      '/auth/login',
      { Origin: webOrigin, 'X-Client-Type': 'desktop-pos' },
      { username, password },
    );

    expect(result.response.status).toBe(200);
    expect(result.data.data.refreshToken).toBeUndefined();
    expect(result.cookies.some((cookie) => cookie.startsWith('refresh_token='))).toBe(true);
  });

  it('does not disclose the desktop refresh token to an opaque browser origin', async () => {
    const result = await request(
      '/auth/login',
      { Origin: 'null', 'X-Client-Type': 'desktop-pos' },
      { username, password },
    );

    expect(result.response.status).toBe(200);
    expect(result.data.data.refreshToken).toBeUndefined();
  });

  it('allows the local LAN server origin and rejects an unrelated private site', async () => {
    const web = await login('web', webOrigin);
    const lan = '192.168.254.253:3000';
    expect(
      (await request('/auth/profile', { ...web.headers, Origin: `http://${lan}`, Host: lan }))
        .response.status,
    ).toBe(200);
    expect(
      (
        await request('/auth/profile', {
          ...web.headers,
          Origin: `http://${lan}`,
          Host: 'agoouz.vercel.app',
        })
      ).response.status,
    ).toBe(403);
    expect(
      (
        await request('/auth/profile', {
          ...web.headers,
          Origin: 'http://10.254.253.252:3000',
          Host: lan,
        })
      ).response.status,
    ).toBe(403);
    expect(
      (
        await request('/auth/profile', {
          ...web.headers,
          Origin: `http://${lan}`,
          Host: 'agoouz.vercel.app',
          'X-Forwarded-Host': lan,
        })
      ).response.status,
    ).toBe(403);
  });

  it('cannot renew a session after the account token version has been revoked', async () => {
    const desktop = await login('desktop', 'null', true);
    await query('UPDATE users SET token_version=COALESCE(token_version,0)+1 WHERE id=$1', [userId]);
    expect((await request('/auth/profile', desktop.headers)).response.status).toBe(401);
    expect(
      (await request('/auth/refresh', desktop.headers, { refreshToken: desktop.refresh })).response
        .status,
    ).toBe(401);
  });

  it('uses the explicit bearer identity and never falls back to a different cookie account', async () => {
    const web = await login('web', webOrigin);
    const otherId = (
      await query(
        `INSERT INTO users (username,password_hash,full_name,role_id,is_active)
      SELECT $1,password_hash,'Other identity',role_id,TRUE FROM users WHERE id=$2 RETURNING id`,
        [`other-${randomUUID()}`, userId],
      )
    ).rows[0].id;
    try {
      const other = await request(
        '/auth/login',
        { Origin: webOrigin },
        {
          username: (await query('SELECT username FROM users WHERE id=$1', [otherId])).rows[0]
            .username,
          password,
        },
      );
      expect(other.response.status).toBe(200);
      const profile = await request('/auth/profile', {
        ...web.headers,
        Authorization: `Bearer ${other.data.data.token}`,
      });
      expect(profile.response.status).toBe(200);
      expect(profile.data.data.user.id).toBe(otherId);
      expect(
        (await request('/auth/profile', { ...web.headers, Authorization: 'Bearer invalid' }))
          .response.status,
      ).toBe(401);
      const mismatched = await request(
        '/auth/refresh',
        { ...web.headers, Authorization: `Bearer ${other.data.data.token}` },
        {},
      );
      expect(mismatched.response.status).toBe(401);
      expect(mismatched.data.code).toBe('SESSION_CONTEXT_CHANGED');
      // Rejection must not consume the owner's refresh token.
      expect(
        (
          await request(
            '/auth/refresh',
            { ...web.headers, Authorization: `Bearer ${web.token}` },
            {},
          )
        ).response.status,
      ).toBe(200);
    } finally {
      await query('DELETE FROM refresh_tokens WHERE user_id=$1', [otherId]);
      await query('DELETE FROM activity_logs WHERE user_id=$1', [otherId]);
      await query('DELETE FROM users WHERE id=$1', [otherId]);
    }
  });

  it('rotates all three channels in the same second and rejects reuse of the old refresh token', async () => {
    const channels = await allChannels();
    for (const channel of channels) {
      const body = channel.name === 'desktop' ? { refreshToken: channel.refresh } : {};
      const rotated = await request('/auth/refresh', channel.headers, body);
      expect(rotated.response.status).toBe(200);
      const fresh =
        channel.name === 'desktop'
          ? rotated.data.data.refreshToken
          : refreshCookie(rotated.cookies);
      expect(fresh).toBeTruthy();
      expect(fresh === channel.refresh).toBe(false);
      if (channel.name !== 'desktop') expect(rotated.data.data.refreshToken).toBeUndefined();
      expect((await request('/auth/refresh', channel.headers, body)).response.status).toBe(401);
    }
  });

  it('never returns a cookie refresh token in JSON when the desktop marker is spoofed', async () => {
    const web = await login('web', webOrigin);
    const rotated = await request(
      '/auth/refresh',
      { ...web.headers, 'X-Client-Type': 'desktop-pos' },
      {},
    );
    expect(rotated.response.status).toBe(200);
    expect(rotated.data.data.refreshToken).toBeUndefined();
    expect(rotated.cookies).toHaveLength(2);
  });

  it('revokes access and refresh sessions atomically across all three channels on logout', async () => {
    const channels = await allChannels();
    expect((await request('/auth/logout', channels[0].headers, {})).response.status).toBe(200);
    for (const channel of channels) {
      const profile = await request('/auth/profile', channel.headers);
      expect(profile.response.status).toBe(401);
      expect(profile.data.code).toBe('SESSION_REVOKED');
      expect(
        (
          await request(
            '/auth/refresh',
            channel.headers,
            channel.name === 'desktop' ? { refreshToken: channel.refresh } : {},
          )
        ).response.status,
      ).toBe(401);
    }
    expect(
      (
        await query(
          'SELECT COUNT(*)::int AS count FROM refresh_tokens WHERE user_id=$1 AND revoked=FALSE',
          [userId],
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it('serializes concurrent rotation and logout without leaving a renewed live session', async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const desktop = await login('desktop', 'null', true);
      const [logout, rotation] = await Promise.all([
        request('/auth/logout', desktop.headers, {}),
        request('/auth/refresh', desktop.headers, { refreshToken: desktop.refresh }),
      ]);
      expect(logout.response.status).toBe(200);
      expect([200, 401]).toContain(rotation.response.status);
      const token = rotation.response.status === 200 ? rotation.data.data.token : desktop.token;
      expect(
        (await request('/auth/profile', { ...desktop.headers, Authorization: `Bearer ${token}` }))
          .response.status,
      ).toBe(401);
      expect(
        (
          await query(
            'SELECT COUNT(*)::int AS count FROM refresh_tokens WHERE user_id=$1 AND revoked=FALSE',
            [userId],
          )
        ).rows[0].count,
      ).toBe(0);
    }
  });

  it('rolls back both access and refresh revocation when the required audit insert fails', async () => {
    const web = await login('web', webOrigin);
    const version = (await query('SELECT token_version FROM users WHERE id=$1', [userId])).rows[0]
      .token_version;
    await query(`CREATE FUNCTION test_channel_logout_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.user_id=TG_ARGV[0]::int AND NEW.module='auth' AND NEW.action_ar='تسجيل خروج' THEN
          RAISE EXCEPTION 'isolated audit failure';
        END IF;
        RETURN NEW;
      END $$`);
    try {
      // The identifier is constant; the argument is a database-generated integer.
      await query(`CREATE TRIGGER test_channel_logout_failure BEFORE INSERT ON activity_logs
        FOR EACH ROW EXECUTE FUNCTION test_channel_logout_failure('${Number(userId)}')`);
      try {
        expect((await request('/auth/logout', web.headers, {})).response.status).toBe(500);
        expect(
          (await query('SELECT token_version FROM users WHERE id=$1', [userId])).rows[0]
            .token_version,
        ).toBe(version);
        expect(
          (
            await query(
              'SELECT COUNT(*)::int AS count FROM refresh_tokens WHERE user_id=$1 AND revoked=FALSE',
              [userId],
            )
          ).rows[0].count,
        ).toBe(1);
        expect((await request('/auth/profile', web.headers)).response.status).toBe(200);
      } finally {
        await query('DROP TRIGGER IF EXISTS test_channel_logout_failure ON activity_logs');
      }
    } finally {
      await query('DROP FUNCTION IF EXISTS test_channel_logout_failure()');
    }
  });
});

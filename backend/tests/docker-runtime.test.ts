import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import config from '../src/config/index.ts';
import { query } from '../src/database/pool.ts';
import { assertSafeTestDatabase } from '../scripts/testDatabaseSafety.ts';

// Opt-in: requires a locally built image, never the running ERP container.
it.skipIf(process.env.ERP_DOCKER_SMOKE !== '1')(
  'serves the production web/API image with isolated channel sessions and persistent encrypted backups',
  async () => {
    assertSafeTestDatabase(config.db);
    expect(config.db.connectionString).toBeFalsy();
    const image = process.env.ERP_DOCKER_IMAGE || 'codex-erp-audit:2026-10-02';
    expect(image).toMatch(/^codex-erp-audit:[a-zA-Z0-9._-]+$/);
    const id = randomUUID();
    const name = `codex-erp-smoke-${id}`;
    const volume = `codex-erp-backups-${id}`;
    const label = `codex.audit=${id}`;
    const password = 'IsolatedDockerFixture123!';
    const username = `docker-${id}`;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3017',
      DATABASE_URL: '',
      DB_HOST: 'host.docker.internal',
      DB_PORT: String(config.db.port),
      DB_NAME: config.db.database!,
      DB_USER: config.db.user!,
      DB_PASSWORD: config.db.password!,
      DB_SSL: 'false',
      DB_SSL_CA_FILE: '',
      DB_POOL_MODE: 'auto',
      DB_POOL_MAX: '3',
      DB_MAINTENANCE_POOL_MAX: '3',
      JWT_SECRET: 'fictional-access-key-for-container-verification-2026',
      JWT_REFRESH_SECRET: 'fictional-refresh-key-for-container-verification-2026',
      BACKUP_ENCRYPTION_KEY: 'fictional-backup-key-for-container-verification-2026',
      CORS_ORIGIN: 'https://agoouz.vercel.app',
      REDIS_URL: '',
      SENTRY_DSN: '',
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_CHAT_ID: '',
    };
    const forwarded = [
      'NODE_ENV',
      'PORT',
      'DATABASE_URL',
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD',
      'DB_SSL',
      'DB_SSL_CA_FILE',
      'DB_POOL_MODE',
      'DB_POOL_MAX',
      'DB_MAINTENANCE_POOL_MAX',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'BACKUP_ENCRYPTION_KEY',
      'CORS_ORIGIN',
      'REDIS_URL',
      'SENTRY_DSN',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID',
    ];
    const docker = (args: string[]) =>
      execFileSync('docker', args, {
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 20000,
        maxBuffer: 4 * 1024 * 1024,
      }).trim();
    const ownedContainer = () => {
      try {
        return (
          docker(['inspect', '--format', '{{index .Config.Labels "codex.audit"}}', name]) === id
        );
      } catch {
        return false;
      }
    };
    let volumeCreated = false;
    const statuses: Record<string, number> = {};
    const start = async () => {
      docker([
        'run',
        '-d',
        '--name',
        name,
        '--label',
        label,
        '-p',
        '127.0.0.1::3017',
        '--mount',
        `type=volume,source=${volume},target=/app/backend/backups`,
        ...forwarded.flatMap((key) => ['--env', key]),
        image,
      ]);
      const endpoint = docker(['port', name, '3017/tcp']);
      expect(endpoint).toMatch(/^127\.0\.0\.1:\d+$/);
      const base = `http://${endpoint}`;
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        try {
          const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) });
          if (health.status === 200) return base;
        } catch {
          /* startup is asynchronous */
        }
        expect(docker(['inspect', '--format', '{{.State.Running}}', name])).toBe('true');
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      throw new Error('Isolated Docker image did not become ready within 60 seconds');
    };
    try {
      for (const [key, values] of [
        ['JWT_SECRET', []],
        ['BACKUP_ENCRYPTION_KEY', ['--env', `JWT_SECRET=${env.JWT_SECRET}`]],
      ] as const) {
        let failedClosed = false;
        try {
          docker([
            'run',
            '--rm',
            '--network=none',
            '--entrypoint',
            'node',
            '--env',
            'DB_HOST=127.0.0.1',
            '--env',
            'DB_NAME=fixture_test',
            '--env',
            'DB_USER=fixture',
            '--env',
            'DB_PASSWORD=fixture',
            ...values,
            image,
            '--import',
            'tsx',
            '-e',
            "import('./backend/src/config/index.ts')",
          ]);
        } catch (error) {
          const childError = error as NodeJS.ErrnoException & {
            status?: number;
            stderr?: string | Buffer;
          };
          failedClosed = childError.status === 1 && String(childError.stderr).includes(key);
        }
        expect(failedClosed, `production requires ${key}`).toBe(true);
      }
      const role = (await query("SELECT id FROM roles WHERE name='admin'")).rows[0];
      const user = (
        await query(
          `INSERT INTO users(username,password_hash,full_name,role_id,is_active)
        VALUES($1,$2,'Docker fixture',$3,TRUE) RETURNING id`,
          [username, await bcrypt.hash(password, 10), role.id],
        )
      ).rows[0];
      docker(['volume', 'create', '--label', label, volume]);
      volumeCreated = true;
      let base = await start();
      const html = await fetch(`${base}/products`);
      expect(html.status).toBe(200);
      expect(await html.text()).toMatch(/<div id="app"/);
      expect((await fetch(`${base}/logo.png`)).status).toBe(200);
      expect(docker(['exec', name, 'id', '-u'])).toBe('1000');
      const imageCheck = `const fs=require('fs');const assert=require('assert/strict');
        for(const p of ['/app/.env','/app/backend/.env','/app/backend/.postgres.local','/app/.codex','/app/.aws','/app/scratch','/app/desktop-pos','/app/backend/certs/key.pem'])assert(!fs.existsSync(p),p);
        assert.equal(process.env.NODE_ENV,'production');
        assert.equal(fs.statSync('/app/backend/backups').uid,1000);
        fs.writeFileSync('/app/backend/logs/permission-check.log','synthetic fixture');
        assert.equal(require('child_process').execFileSync('pg_dump',['--version']).toString().startsWith('pg_dump'),true);`;
      docker(['exec', name, 'node', '-e', imageCheck]);
      const channels: { headers: Record<string, string>; token: string }[] = [];
      for (const [channel, origin, desktop] of [
        ['web', 'https://agoouz.vercel.app', false],
        ['mobile', 'https://localhost', false],
        ['desktop', 'null', true],
      ] as const) {
        const headers: Record<string, string> = {
          Origin: origin,
          'Content-Type': 'application/json',
          ...(desktop ? { 'X-Client-Type': 'desktop-pos' } : {}),
        };
        const response = await fetch(`${base}/api/v1/auth/login`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ username, password }),
        });
        statuses[`${channel}Login`] = response.status;
        expect(response.status).toBe(200);
        const data = (await response.json()) as {
          data: { user: { id: number }; refreshToken?: string; token: string };
        };
        expect(data.data.user.id).toBe(user.id);
        if (desktop) {
          expect(response.headers.getSetCookie()).toHaveLength(0);
          expect(data.data.refreshToken).toBeTruthy();
          headers.Authorization = `Bearer ${data.data.token}`;
        } else {
          expect(data.data.refreshToken).toBeUndefined();
          const cookies = response.headers.getSetCookie();
          expect(
            cookies.filter((c) => c.includes('HttpOnly') && c.includes('Secure')),
          ).toHaveLength(2);
          headers.Cookie = cookies.map((cookie) => cookie.split(';')[0]).join('; ');
        }
        channels.push({ headers, token: data.data.token });
      }
      expect(new Set(channels.map((channel) => channel.token)).size).toBe(3);
      await query("UPDATE users SET full_name='Updated common Docker identity' WHERE id=$1", [
        user.id,
      ]);
      for (const [index, channel] of channels.entries()) {
        const response = await fetch(`${base}/api/v1/auth/profile`, { headers: channel.headers });
        statuses[`profile${index}`] = response.status;
        expect(response.status).toBe(200);
        expect(
          ((await response.json()) as { data: { user: { full_name: string } } }).data.user
            .full_name,
        ).toBe('Updated common Docker identity');
      }
      const backup = await fetch(`${base}/api/v1/backup/create`, {
        method: 'POST',
        headers: channels[2]!.headers,
        body: '{}',
      });
      statuses.backup = backup.status;
      expect(backup.status).toBe(200);
      const file = ((await backup.json()) as { data: { file: string } }).data.file;
      expect(file).toMatch(/^backup-[a-zA-Z0-9T.-]+\.json$/);
      const backupCheck = `const fs=require('fs');const assert=require('assert/strict');const data=JSON.parse(fs.readFileSync('/app/backend/backups/'+${JSON.stringify(file)},'utf8'));assert.equal(data.encrypted,true);assert.equal(typeof data.payload,'string');assert(!data.data);`;
      docker(['exec', name, 'node', '-e', backupCheck]);
      expect(ownedContainer()).toBe(true);
      docker(['rm', '--force', name]);
      base = await start();
      docker(['exec', name, 'node', '-e', backupCheck]);
      const restarted = await fetch(`${base}/api/v1/auth/profile`, {
        headers: channels[2]!.headers,
      });
      statuses.profileAfterRecreate = restarted.status;
      expect(restarted.status).toBe(200);
      const healthCommand = JSON.parse(
        docker(['inspect', '--format', '{{json .Config.Healthcheck.Test}}', name]),
      );
      expect(healthCommand[0]).toBe('CMD-SHELL');
      docker(['exec', name, 'sh', '-c', healthCommand[1]]);
      await fs.writeFile(
        path.resolve('../docs/audits/evidence/docker-runtime-2026-10-02.json'),
        JSON.stringify(
          {
            verifiedAt: new Date().toISOString(),
            image,
            nonRootUid: 1000,
            production: true,
            statuses,
            dynamicPort: 3017,
            privateInputsAbsent: true,
            encryptedBackupSurvivedContainerRecreate: true,
            productionDatabaseTouched: false,
            sharedProductionDeploymentVerified: false,
            startupRejectedMissingAccessAndBackupSecrets: true,
          },
          null,
          2,
        ) + '\n',
      );
    } finally {
      if (ownedContainer()) docker(['rm', '--force', name]);
      if (volumeCreated) {
        expect(
          docker(['volume', 'inspect', '--format', '{{index .Labels "codex.audit"}}', volume]),
        ).toBe(id);
        docker(['volume', 'rm', volume]);
      }
    }
  },
  180000,
);

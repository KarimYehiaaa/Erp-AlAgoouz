import { expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import config from '../src/config/index.ts';
import { assertSafeTestDatabase } from '../scripts/testDatabaseSafety.ts';

// Full boot reconciles invoices, so this gate gets its own freshly migrated database in CI.
const bootTest = it.skipIf(process.env.ERP_BOOT_LIFECYCLE_TEST !== '1');
const fixtureSource = `
  const { default: app } = await import('./src/app.ts');
  const { default: routes } = await import('./src/routes/index.ts');
  let releaseRequest;
  routes.get('/__runtime_fixture', async (_req, res) => {
    process.send({ type: 'request' });
    await new Promise(resolve => { releaseRequest = resolve; });
    res.end('business request completed');
  });
  const listen = app.listen.bind(app);
  app.listen = (...args) => {
    const server = listen(...args);
    server.once('listening', () => process.send({ type: 'ready', port: server.address().port }));
    return server;
  };
  process.on('message', message => {
    if (message === 'release') releaseRequest?.();
    if (message === 'stop') process.emit('SIGTERM');
    if (message === 'fatal') process.emit('unhandledRejection', new Error('Isolated runtime fixture failure'));
  });
  await import('./src/server.ts');
`;

const startFixture = () => {
  assertSafeTestDatabase(config.db);
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', fixtureSource],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '0',
        REDIS_URL: '',
        VERCEL: '',
        VERCEL_ENV: '',
        VERCEL_URL: '',
        ERP_SKIP_STARTUP_MIGRATIONS: '',
        TELEGRAM_BOT_TOKEN: '',
        TELEGRAM_CHAT_ID: '',
        ALERT_DISCORD_WEBHOOK_URL: '',
        SENTRY_DSN: '',
        SUPPRESS_CONFIG_LOG: '1',
      },
    },
  );
  let output = '';
  for (const stream of [child.stdout, child.stderr])
    stream?.on('data', (chunk) => {
      output = (output + String(chunk)).slice(-6000);
    });
  const exited = once(child, 'exit');
  const messages: Array<Record<string, unknown>> = [];
  child.on('message', (message) => messages.push(message as Record<string, unknown>));
  const waitFor = async (type: string) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const message = messages.find((item) => item.type === type);
      if (message) return message;
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(`Fixture exited before ${type}: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Fixture timeout waiting for ${type}: ${output}`);
  };
  return { child, exited, waitFor, output: () => output };
};

const stopFixture = async (child: ChildProcess) => {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGKILL'); // Only this exclusively spawned fixture process.
    await exited;
  }
};

bootTest.each([
  { method: 'stop', fatalDuringShutdown: false },
  { method: 'stop', fatalDuringShutdown: true },
  { method: 'shutdown', fatalDuringShutdown: false },
])(
  'full backend boot drains an admitted request using $method and retains fatal escalation=$fatalDuringShutdown',
  async ({ method, fatalDuringShutdown }) => {
    const fixture = startFixture();
    let response: Promise<string> | undefined;
    try {
      const ready = await fixture.waitFor('ready');
      response = fetch(`http://127.0.0.1:${ready.port}/api/v1/__runtime_fixture`).then((result) =>
        result.text(),
      );
      void response.catch(() => undefined);
      await fixture.waitFor('request');
      fixture.child.send(method);
      if (fatalDuringShutdown) fixture.child.send('fatal');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(fixture.child.exitCode, fixture.output()).toBeNull();
      fixture.child.send('release');
      expect(await response).toBe('business request completed');
      expect((await fixture.exited)[0], fixture.output()).toBe(fatalDuringShutdown ? 1 : 0);
    } finally {
      await stopFixture(fixture.child);
      await response?.catch(() => undefined);
    }
  },
  60000,
);

bootTest(
  'a fatal unhandled rejection exits the actual backend process with failure',
  async () => {
    const fixture = startFixture();
    try {
      await fixture.waitFor('ready');
      fixture.child.send('fatal');
      expect((await fixture.exited)[0], fixture.output()).toBe(1);
    } finally {
      await stopFixture(fixture.child);
    }
  },
  60000,
);

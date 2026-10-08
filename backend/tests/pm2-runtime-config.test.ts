import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RUNTIME_SHUTDOWN_TIMEOUT_MS } from '../src/utils/shutdownRuntime.ts';

const require = createRequire(import.meta.url);
const ecosystem = require('../../config/pm2/ecosystem.config.cjs') as {
  apps: Array<{
    cwd: string;
    script: string;
    interpreter: string;
    node_args: string[];
    kill_timeout?: number;
    shutdown_with_message?: boolean;
  }>;
};

describe('PM2 runtime configuration', () => {
  it('allows the backend shutdown deadline before forcing a process kill', () => {
    expect(ecosystem.apps[0].kill_timeout).toBeGreaterThan(RUNTIME_SHUTDOWN_TIMEOUT_MS);
    expect(ecosystem.apps[0].shutdown_with_message).toBe(true);
  });

  it('gives the Windows service console handler the same shutdown window', () => {
    const installer = readFileSync(
      new URL('../../scripts/windows/install-services.ps1', import.meta.url),
      'utf8',
    );
    const milliseconds = Number(installer.match(/AppStopMethodConsole\s*(?:=\s*)?(\d+)/)?.[1]);
    expect(milliseconds).toBeGreaterThan(RUNTIME_SHUTDOWN_TIMEOUT_MS);
  });

  it('gives the composed backend enough time to drain before Docker kills it', () => {
    const compose = readFileSync(new URL('../../docker-compose.yml', import.meta.url), 'utf8');
    const backend = compose.split('  backend:')[1];
    const seconds = Number(backend.match(/stop_grace_period:\s*(\d+)s/)?.[1]);
    expect(seconds * 1000).toBeGreaterThan(RUNTIME_SHUTDOWN_TIMEOUT_MS);
  });

  it.each(['Dockerfile', 'backend/Dockerfile'])(
    'runs Node directly as the container entry process in %s',
    (file) => {
      const source = readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
      const command = JSON.parse(source.match(/^CMD\s+(\[.*\])$/m)![1]);
      expect(command).toEqual([
        'node',
        '--import',
        'tsx',
        '--import',
        './src/services/sentryInstrumentation.ts',
        'src/index.ts',
      ]);
      expect(source).toContain('WORKDIR /app/backend');
    },
  );
  it('starts the backend TypeScript entrypoint through the project tsx loader', () => {
    expect(ecosystem.apps).toHaveLength(1);
    const [app] = ecosystem.apps;
    const entrypoint = path.resolve(app.cwd, app.script);

    expect(app.interpreter).toBe('node');
    expect(app.node_args).toEqual([
      '--import',
      'tsx',
      '--import',
      './src/services/sentryInstrumentation.ts',
    ]);
    expect(entrypoint).toBe(fileURLToPath(new URL('../src/index.ts', import.meta.url)));
    expect(existsSync(entrypoint)).toBe(true);
  });
});

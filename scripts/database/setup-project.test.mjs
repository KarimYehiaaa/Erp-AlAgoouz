import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { runProjectSetup } from './setup-project.ts';

const rootDir = path.resolve('isolated-setup-fixture');
const fixture = ({ failure, localDocker = false, answers = [] } = {}) => {
  const commands = [];
  const messages = [];
  const questions = [];
  return {
    commands,
    messages,
    questions,
    options: {
      rootDir,
      configurationAvailable: () => true,
      canStartLocalDocker: async () => localDocker,
      runCommand: (command, cwd) => {
        assert.equal(cwd, rootDir);
        commands.push(command);
        if (command === failure) throw new Error('Isolated setup step failed');
      },
      askQuestion: async (question) => {
        questions.push(question);
        return answers.shift() ?? 'n';
      },
      log: (message) => messages.push(message),
    },
  };
};

test('missing configuration stops before installing packages or touching a database', async () => {
  const state = fixture();
  state.options.configurationAvailable = () => false;
  await assert.rejects(runProjectSetup(state.options), /\.env\.example/);
  assert.deepEqual(state.commands, []);
  assert.deepEqual(state.questions, []);
});

for (const failure of [
  'npm ci --workspaces --include-workspace-root',
  'npm ci --prefix desktop-pos',
  'npm run setup-db -w backend',
]) {
  test(`a failed ${failure} prevents success and all later steps`, async () => {
    const state = fixture({ failure, answers: ['y'] });
    await assert.rejects(runProjectSetup(state.options), /Isolated setup step failed/);
    assert.equal(state.commands.at(-1), failure);
    assert.ok(!state.messages.some((message) => message.includes('completed successfully')));
    assert.ok(!state.commands.includes('npm run build:local -w frontend'));
  });
}

test('a Docker failure stops database setup instead of carrying on with a wrong endpoint', async () => {
  const command =
    'docker compose --profile local-db up -d --wait --wait-timeout 120 postgres redis';
  const state = fixture({ failure: command, localDocker: true, answers: ['y'] });
  await assert.rejects(runProjectSetup(state.options), /Isolated setup step failed/);
  assert.equal(state.commands.at(-1), command);
  assert.ok(!state.commands.includes('npm run setup-db -w backend'));
});

test('shared database mode does not offer or start a second PostgreSQL database', async () => {
  const state = fixture();
  await runProjectSetup(state.options);
  assert.ok(state.questions.every((question) => !question.includes('Docker')));
  assert.ok(state.commands.every((command) => !command.startsWith('docker ')));
  assert.deepEqual(state.commands, [
    'npm ci --workspaces --include-workspace-root',
    'npm ci --prefix desktop-pos',
    'npm run setup-db -w backend',
  ]);
});

test('local Docker setup waits for health before migrations and propagates build failures', async () => {
  const state = fixture({
    failure: 'npm run build:local -w frontend',
    localDocker: true,
    answers: ['yes', 'YES'],
  });
  await assert.rejects(runProjectSetup(state.options), /Isolated setup step failed/);
  assert.match(state.commands[2], /--wait --wait-timeout 120 postgres redis$/);
  assert.equal(state.commands[3], 'npm run setup-db -w backend');
  assert.equal(state.commands[4], 'npm run build:local -w frontend');
  assert.ok(!state.messages.some((message) => message.includes('completed successfully')));
});

test('the CLI on a fresh copy exits nonzero with configuration instructions', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'erp-setup-fixture-'));
  try {
    const directory = path.join(root, 'scripts', 'database');
    mkdirSync(directory, { recursive: true });
    const script = path.join(directory, 'setup-project.ts');
    copyFileSync(new URL('./setup-project.ts', import.meta.url), script);
    const env = { ...process.env };
    for (const key of ['DATABASE_URL', 'DB_USER', 'DB_PASSWORD']) delete env[key];
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\.env\.example/);
    assert.ok(!result.stdout.includes('completed successfully'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const databaseExit of [0, 17]) {
  test(
    `interactive Windows setup releases redirected input after database exit ${databaseExit}`,
    { skip: process.platform !== 'win32' },
    async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'erp-setup-open-input-'));
      const directory = path.join(root, 'scripts', 'database');
      const bin = path.join(root, 'fixture-bin');
      mkdirSync(directory, { recursive: true });
      mkdirSync(bin);
      copyFileSync(
        new URL('./setup-project.ts', import.meta.url),
        path.join(directory, 'setup-project.ts'),
      );
      writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
      writeFileSync(path.join(root, '.env'), '# isolated fixture; no real database\n');
      const optionsDirectory = path.join(root, 'backend', 'src', 'database');
      mkdirSync(optionsDirectory, { recursive: true });
      writeFileSync(
        path.join(optionsDirectory, 'connectionOptions.ts'),
        `export const databaseConnectionOptions = () => ({ host: '127.0.0.1', port: 5432 });
export const isLoopbackDatabaseConnection = () => true;`,
      );
      const fakeNpm = path.join(bin, 'fake-npm.mjs');
      writeFileSync(
        fakeNpm,
        `console.log('FIXTURE_NPM=' + process.argv.slice(2).join('|'));
process.exitCode = process.argv.includes('setup-db') ? ${databaseExit} : 0;`,
      );
      writeFileSync(
        path.join(bin, 'npm.cmd'),
        `@echo off\r\n"${process.execPath}" "${fakeNpm}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
      );
      const child = spawn(process.execPath, [path.join(directory, 'setup-project.ts')], {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${bin};${process.env.PATH}`,
          DATABASE_URL: '',
          DB_USER: '',
          DB_PASSWORD: '',
          NODE_OPTIONS: '',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let output = '';
      let errors = '';
      let dockerAnswered = false;
      let buildAnswered = false;
      let timedOut = false;
      child.stdout.on('data', (data) => {
        output += data;
        if (!dockerAnswered && output.includes('Start local PostgreSQL and Redis with Docker?')) {
          dockerAnswered = true;
          child.stdin.write('n\n');
        }
        if (!buildAnswered && output.includes('Build the frontend for local operation now?')) {
          buildAnswered = true;
          child.stdin.write('n\n');
        }
        // Keep the caller's pipe open: the CLI owns releasing its own input handle.
      });
      child.stderr.on('data', (data) => {
        errors += data;
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 6000);
      try {
        const exitCode = await new Promise((resolve, reject) => {
          child.once('error', reject);
          child.once('close', resolve);
        });
        assert.equal(timedOut, false, output + errors);
        assert.equal(exitCode, databaseExit === 0 ? 0 : 1, output + errors);
        assert.ok(dockerAnswered);
        assert.equal(buildAnswered, databaseExit === 0);
        assert.match(output, /FIXTURE_NPM=run\|setup-db\|-w\|backend/);
        assert.equal(output.includes('Setup completed successfully'), databaseExit === 0);
      } finally {
        clearTimeout(timer);
        child.stdin.destroy();
        const resolved = realpathSync(root);
        assert.ok(resolved.startsWith(realpathSync(tmpdir()) + path.sep));
        assert.match(path.basename(resolved), /^erp-setup-open-input-/);
        rmSync(resolved, { recursive: true, force: true });
      }
    },
  );
}

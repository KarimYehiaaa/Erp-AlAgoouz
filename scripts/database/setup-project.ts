/** Set up all Node applications from their lockfiles, then prepare the configured database. */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import readline from 'node:readline';

type SetupOptions = {
  rootDir: string;
  configurationAvailable: () => boolean;
  canStartLocalDocker: () => Promise<boolean>;
  runCommand: (command: string, cwd: string) => void;
  askQuestion: (question: string) => Promise<string>;
  log: (message: string) => void;
};

const isYes = (answer: string): boolean => ['y', 'yes'].includes(answer.trim().toLowerCase());

// An import must not start installation or migrations. Injecting the boundaries
// lets the failure paths be tested without using the shop's environment or data.
export const runProjectSetup = async (options: SetupOptions): Promise<void> => {
  const { rootDir, runCommand, askQuestion, log } = options;
  if (!options.configurationAvailable()) {
    throw new Error(
      'Create .env from .env.example and configure your database before setup. Existing environment files are never overwritten.',
    );
  }
  log('[1/4] Installing web and API dependencies from the root lockfile...');
  runCommand('npm ci --workspaces --include-workspace-root', rootDir);
  log('[2/4] Installing desktop POS dependencies from its lockfile...');
  runCommand('npm ci --prefix desktop-pos', rootDir);
  log('[3/4] Preparing the configured database...');
  if (await options.canStartLocalDocker()) {
    const useDocker = await askQuestion('Start local PostgreSQL and Redis with Docker? (y/n): ');
    if (isYes(useDocker)) {
      runCommand(
        'docker compose --profile local-db up -d --wait --wait-timeout 120 postgres redis',
        rootDir,
      );
    } else {
      log('Using your existing local PostgreSQL service.');
    }
  } else {
    log('Using the configured database endpoint; no second database will be started.');
  }
  // Preserve the backend's remote-migration approval guard and propagate errors.
  runCommand('npm run setup-db -w backend', rootDir);
  log('[4/4] Frontend build...');
  if (isYes(await askQuestion('Build the frontend for local operation now? (y/n): '))) {
    runCommand('npm run build:local -w frontend', rootDir);
  } else {
    log('Frontend build skipped. Use npm run dev -w frontend for development.');
  }
  log('Setup completed successfully: dependencies and database are ready.');
  log('API: npm run dev -w backend');
  log('Web: npm run dev -w frontend');
  log('Desktop POS: npm --prefix desktop-pos run dev');
  log('Android release also requires Android SDK and your private signing configuration.');
};

const askQuestion = (question: string): Promise<string> => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    const onClose = () => reject(new Error('Setup input closed before an answer was provided.'));
    rl.once('close', onClose);
    rl.question(question, (answer) => {
      rl.off('close', onClose);
      rl.close();
      resolve(answer);
    });
  });
};

const main = async (): Promise<void> => {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  console.log('AlAgoouz ERP - Setup');
  await runProjectSetup({
    rootDir,
    configurationAvailable: () =>
      existsSync(path.join(rootDir, '.env')) ||
      existsSync(path.join(rootDir, 'backend', '.env')) ||
      Boolean(process.env.DATABASE_URL?.trim()) ||
      Boolean(process.env.DB_USER?.trim() && process.env.DB_PASSWORD?.trim()),
    canStartLocalDocker: async () => {
      // Load after installation so the wizard itself needs only Node.js.
      const { databaseConnectionOptions, isLoopbackDatabaseConnection } =
        await import('../../backend/src/database/connectionOptions.ts');
      const endpoint = databaseConnectionOptions();
      return (
        !('connectionString' in endpoint && endpoint.connectionString) &&
        isLoopbackDatabaseConnection(endpoint) &&
        Number(('port' in endpoint && endpoint.port) || 5432) === 5432
      );
    },
    runCommand: (command, cwd) => {
      console.log(`Running: ${command}`);
      // Commands are fixed internal strings; no configuration or answers are interpolated.
      // Only the wizard reads answers. Package installs, Docker and migrations
      // are configured through arguments/environment and must not share its pipe.
      execSync(command, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
    },
    askQuestion,
    log: console.log,
  });
};

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main()
    .catch((error: unknown) => {
      console.error('Setup failed:', error instanceof Error ? error.message : 'Unknown error');
      process.exitCode = 1;
    })
    .finally(() => {
      // readline.close() pauses a redirected pipe without releasing its handle.
      // Release it at the CLI boundary on both success and failure; leave TTYs alone.
      if (!process.stdin.isTTY) process.stdin.destroy();
    });
}

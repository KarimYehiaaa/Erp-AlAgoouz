import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Use absolute child entries so a relocated server remains identifiable by its controller.
 * @param {string} directory
 * @param {boolean} [watch]
 * @returns {{executable: string, args: string[], options: import('node:child_process').SpawnOptions}}
 */
export const runtimeCommand = (directory, watch = false) => ({
  executable: process.execPath,
  args: [
    '--import',
    'tsx',
    '--import',
    pathToFileURL(path.join(directory, 'src/services/sentryInstrumentation.ts')).href,
    ...(watch ? ['--watch'] : []),
    path.join(directory, 'src/index.ts'),
  ],
  options: { cwd: directory, stdio: 'inherit', windowsHide: true },
});

/** @param {string[]} [args] @returns {Promise<number>} */
export const startRuntime = (args = process.argv.slice(2)) => {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--watch')) {
    console.error('Unsupported runtime option. Use npm start or npm run dev.');
    return Promise.resolve(1);
  }
  const command = runtimeCommand(backendRoot, args[0] === '--watch');
  return new Promise((resolve) => {
    const child = spawn(command.executable, command.args, command.options);
    // Windows delivers a console Ctrl+C to both processes. Do not turn that
    // graceful console event into child.kill(), which is forceful on Windows.
    const interrupt = () => {
      if (process.platform !== 'win32') child.kill('SIGINT');
    };
    const terminate = () => child.kill('SIGTERM');
    process.on('SIGINT', interrupt);
    if (process.platform !== 'win32') process.on('SIGTERM', terminate);
    const cleanup = () => {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', terminate);
    };
    child.once('error', () => {
      cleanup();
      console.error('Could not start the backend runtime. Check Node and installed dependencies.');
      resolve(1);
    });
    child.once('close', (code, signal) => {
      cleanup();
      resolve(code ?? (signal ? 128 + (constants.signals[signal] || 1) : 1));
    });
  });
};

const entry = process.argv[1] && path.resolve(process.argv[1]);
const thisFile = fileURLToPath(import.meta.url);
if (
  entry &&
  (process.platform === 'win32'
    ? entry.toLowerCase() === thisFile.toLowerCase()
    : entry === thisFile)
) {
  process.exitCode = await startRuntime();
}

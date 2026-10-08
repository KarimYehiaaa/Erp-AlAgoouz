import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';

type ProcessIdentity = {
  pid: number;
  parent: number;
  start: string;
  cwd: string;
  argv: string[];
  executable: string;
};
export type LinuxPortIO = {
  text: (file: string) => string;
  link: (file: string) => string;
  directory: (directory: string) => string[];
  realPath: (file: string) => string;
  signal: (pid: number, signal: 'SIGTERM' | 'SIGKILL') => void;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => number;
  userID: () => number;
};

const nativeIO: LinuxPortIO = {
  text: (file) => fs.readFileSync(file, 'utf8'),
  link: fs.readlinkSync,
  directory: fs.readdirSync,
  realPath: fs.realpathSync,
  signal: (pid, signal) => {
    process.kill(pid, signal);
  },
  sleep: async (milliseconds) => {
    await delay(milliseconds);
  },
  now: () => performance.now(),
  userID: () => process.geteuid!(),
};
const gone = (error: unknown) =>
  error instanceof Error && 'code' in error && ['ENOENT', 'ESRCH'].includes(String(error.code));

const listeningSockets = (table: string, port: number): Map<string, number> => {
  const lines = table.trim().split(/\r?\n/);
  if (!/^\s*sl\s+local_address\s+rem(?:ote)?_address\s+st\b/.test(lines.shift() || ''))
    throw new Error('Linux TCP inventory header could not be verified.');
  const inodes = new Map<string, number>();
  for (const line of lines) {
    const fields = line.trim().split(/\s+/);
    if (
      fields.length < 10 ||
      !/^\d+:$/.test(fields[0]) ||
      !/^[a-fA-F0-9]+:[a-fA-F0-9]{4}$/.test(fields[1]) ||
      !/^[a-fA-F0-9]{2}$/.test(fields[3])
    )
      throw new Error('Linux TCP inventory row could not be verified.');
    if (fields[3].toUpperCase() !== '0A' || parseInt(fields[1].split(':')[1], 16) !== port)
      continue;
    if (!/^[1-9]\d*$/.test(fields[9]))
      throw new Error('Linux listener inode could not be verified.');
    if (!/^\d+$/.test(fields[7])) throw new Error('Linux listener user could not be verified.');
    inodes.set(fields[9], Number(fields[7]));
  }
  return inodes;
};

export const listeningInodes = (table: string, port: number): string[] => [
  ...listeningSockets(table, port).keys(),
];

export const nodeEntry = (argv: string[], cwd: string): string | null => {
  const values = new Set([
    '--import',
    '--require',
    '-r',
    '--loader',
    '--experimental-loader',
    '--title',
    '--conditions',
    '-C',
    '--env-file',
    '--env-file-if-exists',
    '--redirect-warnings',
    '--watch-path',
    '--watch-kill-signal',
    '--disable-warning',
  ]);
  const flags = new Set([
    '--watch',
    '--watch-preserve-output',
    '--enable-source-maps',
    '--no-warnings',
    '--trace-warnings',
    '--inspect',
    '--inspect-brk',
    '--inspect-wait',
    '--no-deprecation',
    '--trace-deprecation',
    '--trace-uncaught',
    '--abort-on-uncaught-exception',
    '--experimental-strip-types',
    '--experimental-transform-types',
  ]);
  for (let index = 1; index < argv.length; index++) {
    let argument = argv[index];
    if (/^(?:-e|-p|--eval|--print)(?:$|=)/.test(argument)) return null;
    if (values.has(argument)) {
      if (++index >= argv.length) return null;
      continue;
    }
    if (argument === '--') {
      if (++index >= argv.length) return null;
      argument = argv[index];
    } else if (argument.startsWith('-')) {
      if (/^--[^=]+=/.test(argument) || flags.has(argument)) continue;
      return null;
    }
    return path.posix.resolve(cwd, argument);
  }
  return null;
};

const identity = (pid: number, io: LinuxPortIO): ProcessIdentity | null => {
  try {
    const directory = `/proc/${pid}`;
    const stat = io.text(`${directory}/stat`);
    const end = stat.lastIndexOf(')');
    if (!stat.startsWith(`${pid} (`) || end < 0)
      throw new Error('Linux process identity is invalid.');
    const fields = stat
      .slice(end + 1)
      .trim()
      .split(/\s+/);
    if (!/^\d+$/.test(fields[1]) || !/^\d+$/.test(fields[19]))
      throw new Error('Linux process creation identity is invalid.');
    if (fields[0] === 'Z') return null;
    return {
      pid,
      parent: Number(fields[1]),
      start: fields[19],
      cwd: io.link(`${directory}/cwd`),
      executable: io.link(`${directory}/exe`),
      argv: io.text(`${directory}/cmdline`).split('\0').filter(Boolean),
    };
  } catch (error) {
    if (gone(error)) return null;
    throw error;
  }
};

/** Kernel socket and process metadata; no lsof/netstat installation or shell command. */
export const stopOwnedLinuxPort = async (
  projectRoot: string,
  io: LinuxPortIO = nativeIO,
): Promise<void> => {
  const root = io.realPath(projectRoot);
  const callerUID = io.userID();
  if (!Number.isSafeInteger(callerUID) || callerUID < 0)
    throw new Error('Linux caller identity could not be verified.');
  const targets = ['index.ts', 'index.js'].map((name) =>
    path.posix.join(root, 'backend/src', name),
  );
  const isOwned = (process: ProcessIdentity) => {
    if (!/^node(?:js)?$/.test(path.posix.basename(process.executable))) return false;
    const entry = nodeEntry(process.argv, process.cwd);
    if (!entry || !targets.includes(entry)) return false;
    return io.realPath(entry) === entry;
  };
  const inventory = () => {
    const sockets = listeningSockets(io.text('/proc/net/tcp'), 3000);
    try {
      for (const [inode, uid] of listeningSockets(io.text('/proc/net/tcp6'), 3000))
        sockets.set(inode, uid);
    } catch (error) {
      if (!gone(error)) throw error;
    }
    if (!sockets.size) return [];
    if (callerUID !== 0 && [...sockets.values()].some((uid) => uid !== callerUID))
      throw new Error('Port 3000 belongs to another Linux user.');
    const owners = new Map<number, ProcessIdentity>();
    const located = new Set<string>();
    for (const candidate of io.directory('/proc').filter((name) => /^[1-9]\d*$/.test(name))) {
      const pid = Number(candidate);
      let descriptors: string[];
      try {
        if (callerUID !== 0) {
          const status = io.text(`/proc/${pid}/status`);
          const uid = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m.exec(status);
          if (!uid) throw new Error('Linux process user could not be verified.');
          if (Number(uid[1]) !== callerUID && Number(uid[2]) !== callerUID) continue;
        }
        descriptors = io.directory(`/proc/${pid}/fd`);
      } catch (error) {
        if (gone(error)) continue;
        throw error;
      }
      for (const descriptor of descriptors) {
        let link: string;
        try {
          link = io.link(`/proc/${pid}/fd/${descriptor}`);
        } catch (error) {
          if (gone(error)) continue;
          throw error;
        }
        const inode = /^socket:\[(\d+)\]$/.exec(link)?.[1];
        if (!inode || !sockets.has(inode)) continue;
        const process = identity(pid, io);
        if (!process) continue;
        if (!isOwned(process))
          throw new Error('Port 3000 has a process outside the verified ERP entry point.');
        owners.set(pid, process);
        located.add(inode);
      }
    }
    if (located.size !== sockets.size)
      throw new Error('Not every Linux listener owner could be verified.');
    return [...owners.values()];
  };
  const same = (before: ProcessIdentity, after: ProcessIdentity) =>
    before.start === after.start &&
    before.cwd === after.cwd &&
    before.executable === after.executable &&
    JSON.stringify(before.argv) === JSON.stringify(after.argv) &&
    isOwned(after);
  const initial = inventory();
  const plan = new Map(initial.map((process) => [process.pid, process]));
  // An owned Node watch supervisor must stop before its child can be respawned.
  for (const process of initial) {
    let parent = process.parent;
    const seen = new Set<number>();
    for (let depth = 0; depth < 16 && parent > 1 && !seen.has(parent); depth++) {
      seen.add(parent);
      const ancestor = identity(parent, io);
      if (!ancestor) break;
      if (/^PM2\b.*God Daemon/.test(ancestor.argv[0] || ''))
        throw new Error('Stop this ERP instance through its PM2 manager.');
      if (!isOwned(ancestor)) break;
      plan.set(parent, ancestor);
      parent = ancestor.parent;
    }
  }
  // Complete all preflight identity checks before the first signal.
  for (const process of plan.values()) {
    const current = identity(process.pid, io);
    if (current && !same(process, current))
      throw new Error('Linux process identity changed before stop.');
  }
  const signal = (process: ProcessIdentity, signal: 'SIGTERM' | 'SIGKILL') => {
    const current = identity(process.pid, io);
    if (!current) return;
    if (!same(process, current)) throw new Error('Linux process identity changed during stop.');
    try {
      io.signal(process.pid, signal);
    } catch (error) {
      if (!gone(error)) throw error;
    }
  };
  const reverse = [...plan.values()].reverse();
  for (const process of reverse) signal(process, 'SIGTERM');
  const wait = async (milliseconds: number) => {
    const deadline = io.now() + milliseconds;
    do {
      const owners = inventory();
      for (const owner of owners) {
        const before = plan.get(owner.pid);
        if (!before || !same(before, owner))
          throw new Error('A new listener appeared during Linux port cleanup.');
      }
      let running = false;
      for (const before of plan.values()) {
        const current = identity(before.pid, io);
        if (!current) continue;
        if (!same(before, current))
          throw new Error('Linux process identity changed while awaiting shutdown.');
        running = true;
      }
      if (!owners.length && !running) return true;
      await io.sleep(100);
    } while (io.now() < deadline);
    return false;
  };
  if (await wait(35000)) return;
  for (const process of reverse) signal(process, 'SIGKILL');
  if (!(await wait(5000))) throw new Error('The verified ERP runtime did not release port 3000.');
};

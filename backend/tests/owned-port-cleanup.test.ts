import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LinuxPortIO } from '../../scripts/maintenance/ownedLinuxPort.ts';

const commands = vi.hoisted(() => ({ execSync: vi.fn(), execFileSync: vi.fn() }));
vi.mock('child_process', () => commands);
vi.mock('node:child_process', () => commands);
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, '');

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  commands.execSync.mockReset();
  commands.execFileSync.mockReset();
});

const linuxRoot = '/srv/ERP shop';
const tcpHeader =
  '  sl  local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode';
const tcpRow = (port: number, inode: string, uid = 1000, state = '0A', remote = 0) =>
  `0: 0100007F:${port.toString(16).padStart(4, '0')} 00000000:${remote.toString(16).padStart(4, '0')} ${state} 00000000:00000000 00:00000000 00000000 ${uid} 0 ${inode} 1 0`;
type LinuxProcessFixture = {
  pid: number;
  parent: number;
  start: string;
  cwd: string;
  argv: string[];
  uid: number;
  alive: boolean;
  listening: boolean;
  inode: string;
  port: number;
};
const linuxFixture = () => {
  const processes = new Map<number, LinuxProcessFixture>();
  const add = (patch: Partial<LinuxProcessFixture> = {}) => {
    const value = {
      pid: 731,
      parent: 1,
      start: '12345',
      cwd: `${linuxRoot}/backend`,
      argv: ['/usr/bin/node', '--import', 'tsx', 'src/index.ts'],
      uid: 1000,
      alive: true,
      listening: true,
      inode: '42',
      port: 3000,
      ...patch,
    };
    processes.set(value.pid, value);
    return value;
  };
  const process = add();
  let elapsed = 0;
  const missing = () => Object.assign(new Error('Isolated missing process'), { code: 'ENOENT' });
  const get = (file: string) => {
    const pid = Number(/^\/proc\/(\d+)\//.exec(file)?.[1]);
    const value = processes.get(pid);
    if (!value?.alive) throw missing();
    return value;
  };
  const signals = vi.fn<(pid: number, signal: 'SIGTERM' | 'SIGKILL') => void>((pid) => {
    const value = processes.get(pid)!;
    value.alive = false;
    value.listening = false;
  });
  const io: LinuxPortIO = {
    text: (file) => {
      if (file === '/proc/net/tcp6') return tcpHeader;
      if (file === '/proc/net/tcp')
        return [
          tcpHeader,
          ...[...processes.values()]
            .filter((p) => p.alive && p.listening)
            .map((p) => tcpRow(p.port, p.inode, p.uid)),
        ].join('\n');
      const p = get(file);
      if (file.endsWith('/cmdline')) return p.argv.join('\0') + '\0';
      if (file.endsWith('/status')) return `Uid:\t${p.uid}\t${p.uid}\t${p.uid}\t${p.uid}\n`;
      if (file.endsWith('/stat'))
        return `${p.pid} (node (fixture)) ${['S', p.parent, ...Array(17).fill('0'), p.start].join(' ')}`;
      throw new Error('Unexpected fixture text read');
    },
    link: (file) => {
      const p = get(file);
      if (file.endsWith('/cwd')) return p.cwd;
      if (file.endsWith('/exe')) return '/usr/bin/node';
      if (/\/fd\/\d+$/.test(file)) return `socket:[${p.inode}]`;
      throw new Error('Unexpected fixture link read');
    },
    directory: (file) =>
      file === '/proc'
        ? [...processes.values()].filter((p) => p.alive).map((p) => String(p.pid))
        : (get(file), ['3']),
    realPath: (file) => file,
    signal: signals,
    now: () => elapsed,
    sleep: async (milliseconds) => {
      elapsed += milliseconds;
    },
    userID: () => 1000,
  };
  return { io, process, processes, add, signals };
};

describe('owned Linux port cleanup with kernel and signal boundaries replaced', () => {
  it('matches the local listening port exactly, for IPv4 and IPv6, without remote or 30000 matches', async () => {
    const { listeningInodes } = await import('../../scripts/maintenance/ownedLinuxPort.ts');
    const rows = [
      tcpRow(3000, '42'),
      tcpRow(30000, '43'),
      tcpRow(5173, '44', 1000, '0A', 3000),
      tcpRow(3000, '45', 1000, '01'),
    ];
    expect(listeningInodes([tcpHeader, ...rows].join('\n'), 3000)).toEqual(['42']);
    expect(
      listeningInodes(
        [
          tcpHeader.replace('rem_address', 'remote_address'),
          tcpRow(3000, '46').replace('0100007F', '00000000000000000000000001000000'),
        ].join('\n'),
        3000,
      ),
    ).toEqual(['46']);
  });
  it('rejects malformed inventory instead of treating it as a free port', async () => {
    const { listeningInodes } = await import('../../scripts/maintenance/ownedLinuxPort.ts');
    expect(() => listeningInodes('not a TCP table', 3000)).toThrow();
    expect(() => listeningInodes(tcpHeader + '\ninvalid row', 3000)).toThrow();
  });
  it.each(['--title', '--env-file', '--unknown-flag', '--eval'])(
    'does not mistake a Node option value for the owned entry with %s',
    async (flag) => {
      const { stopOwnedLinuxPort } = await import('../../scripts/maintenance/ownedLinuxPort.ts');
      const fixture = linuxFixture();
      fixture.process.argv = [
        'node',
        flag,
        path.posix.join(linuxRoot, 'backend/src/index.ts'),
        '/srv/other/index.ts',
      ];
      await expect(stopOwnedLinuxPort(linuxRoot, fixture.io)).rejects.toThrow();
      expect(fixture.signals).not.toHaveBeenCalled();
    },
  );
  it('accepts the actual relative entry using kernel working directory and leaves other ports alone', async () => {
    const { stopOwnedLinuxPort } = await import('../../scripts/maintenance/ownedLinuxPort.ts');
    const fixture = linuxFixture();
    fixture.add({ pid: 732, inode: '43', port: 30000, argv: ['node', '/srv/foreign/index.ts'] });
    fixture.add({
      pid: 733,
      inode: '44',
      port: 5173,
      uid: 0,
      argv: ['node', '/srv/foreign/index.ts'],
    });
    await stopOwnedLinuxPort(linuxRoot, fixture.io);
    expect(fixture.signals.mock.calls).toEqual([[731, 'SIGTERM']]);
    expect(fixture.processes.get(732)?.alive).toBe(true);
    expect(fixture.processes.get(733)?.alive).toBe(true);
  });
  it('validates every listener before signalling any owned one', async () => {
    const { stopOwnedLinuxPort } = await import('../../scripts/maintenance/ownedLinuxPort.ts');
    const fixture = linuxFixture();
    fixture.add({ pid: 732, inode: '43', argv: ['node', '/srv/foreign/index.ts'] });
    await expect(stopOwnedLinuxPort(linuxRoot, fixture.io)).rejects.toThrow();
    expect(fixture.signals).not.toHaveBeenCalled();
  });
  it('refuses another-user listeners and symlinked entry points', async () => {
    const { stopOwnedLinuxPort } = await import('../../scripts/maintenance/ownedLinuxPort.ts');
    const fixture = linuxFixture();
    fixture.process.uid = 0;
    await expect(stopOwnedLinuxPort(linuxRoot, fixture.io)).rejects.toThrow();
    fixture.process.uid = 1000;
    fixture.io.realPath = (file) => (file.endsWith('/index.ts') ? '/srv/foreign/index.ts' : file);
    await expect(stopOwnedLinuxPort(linuxRoot, fixture.io)).rejects.toThrow();
    expect(fixture.signals).not.toHaveBeenCalled();
  });
  it('refuses unavailable descriptor ownership and changed creation identity before the first signal', async () => {
    const { stopOwnedLinuxPort } = await import('../../scripts/maintenance/ownedLinuxPort.ts');
    const blocked = linuxFixture();
    blocked.io.directory = (file) => {
      if (file.endsWith('/fd'))
        throw Object.assign(new Error('Isolated permission refusal'), { code: 'EACCES' });
      return ['731'];
    };
    await expect(stopOwnedLinuxPort(linuxRoot, blocked.io)).rejects.toThrow();
    expect(blocked.signals).not.toHaveBeenCalled();
    const changed = linuxFixture();
    const read = changed.io.text;
    let calls = 0;
    changed.io.text = (file) => {
      if (file.endsWith('/stat') && ++calls === 2) changed.process.start = '99999';
      return read(file);
    };
    await expect(stopOwnedLinuxPort(linuxRoot, changed.io)).rejects.toThrow('identity changed');
    expect(changed.signals).not.toHaveBeenCalled();
  });
  it('stops the owned watch supervisor before its listener child', async () => {
    const { stopOwnedLinuxPort } = await import('../../scripts/maintenance/ownedLinuxPort.ts');
    const fixture = linuxFixture();
    fixture.process.parent = 730;
    fixture.add({
      pid: 730,
      listening: false,
      inode: '99',
      argv: ['node', '--watch', '--import', 'tsx', 'src/index.ts'],
    });
    await stopOwnedLinuxPort(linuxRoot, fixture.io);
    expect(fixture.signals.mock.calls).toEqual([
      [730, 'SIGTERM'],
      [731, 'SIGTERM'],
    ]);
  });
  it('waits for process shutdown even when its listener has already closed', async () => {
    const { stopOwnedLinuxPort } = await import('../../scripts/maintenance/ownedLinuxPort.ts');
    const fixture = linuxFixture();
    fixture.signals.mockImplementation(() => {
      fixture.process.listening = false;
    });
    const sleep = fixture.io.sleep;
    let ticks = 0;
    fixture.io.sleep = async (ms) => {
      await sleep(ms);
      if (++ticks === 3) fixture.process.alive = false;
    };
    await stopOwnedLinuxPort(linuxRoot, fixture.io);
    expect(ticks).toBe(3);
    expect(fixture.signals.mock.calls).toEqual([[731, 'SIGTERM']]);
  });
  it('forces only the unchanged original process after the graceful deadline', async () => {
    const { stopOwnedLinuxPort } = await import('../../scripts/maintenance/ownedLinuxPort.ts');
    const fixture = linuxFixture();
    fixture.signals.mockImplementation((_pid, signal) => {
      if (signal === 'SIGKILL') {
        fixture.process.alive = false;
        fixture.process.listening = false;
      }
    });
    await stopOwnedLinuxPort(linuxRoot, fixture.io);
    expect(fixture.io.now()).toBe(35000);
    expect(fixture.signals.mock.calls).toEqual([
      [731, 'SIGTERM'],
      [731, 'SIGKILL'],
    ]);
  });
  it('never forces a reused PID or a new listener after the graceful deadline', async () => {
    const { stopOwnedLinuxPort } = await import('../../scripts/maintenance/ownedLinuxPort.ts');
    const fixture = linuxFixture();
    fixture.signals.mockImplementation(() => {});
    const sleep = fixture.io.sleep;
    fixture.io.sleep = async (ms) => {
      await sleep(ms);
      if (fixture.io.now() >= 35000) fixture.process.start = '99999';
    };
    await expect(stopOwnedLinuxPort(linuxRoot, fixture.io)).rejects.toThrow('identity changed');
    expect(fixture.signals.mock.calls).toEqual([[731, 'SIGTERM']]);
    const respawn = linuxFixture();
    respawn.signals.mockImplementation(() => {
      respawn.process.alive = false;
      respawn.add({ pid: 740, inode: '45' });
    });
    await expect(stopOwnedLinuxPort(linuxRoot, respawn.io)).rejects.toThrow('new listener');
    expect(respawn.signals.mock.calls).toEqual([[731, 'SIGTERM']]);
  });
  it('returns failure if the unchanged runtime survives force or the signal is denied', async () => {
    const { stopOwnedLinuxPort } = await import('../../scripts/maintenance/ownedLinuxPort.ts');
    const fixture = linuxFixture();
    fixture.signals.mockImplementation(() => {});
    await expect(stopOwnedLinuxPort(linuxRoot, fixture.io)).rejects.toThrow('did not release');
    expect(fixture.io.now()).toBe(40000);
    const denied = linuxFixture();
    denied.signals.mockImplementation(() => {
      throw Object.assign(new Error('Isolated signal refusal'), { code: 'EPERM' });
    });
    await expect(stopOwnedLinuxPort(linuxRoot, denied.io)).rejects.toThrow();
    expect(denied.signals.mock.calls).toEqual([[731, 'SIGTERM']]);
  });
});

const invokeActualCli = async () => {
  const module = await import('../../scripts/maintenance/kill-port.ts');
  // Before repair this file executes eagerly on import. Its native commands are
  // mocked above; after repair exercise the same exported CLI entry explicitly.
  return 'main' in module && typeof module.main === 'function' ? await module.main() : 0;
};

describe.skipIf(process.platform !== 'win32')('owned Windows port cleanup CLI', () => {
  it.each([
    ['exact port', 'TCP 0.0.0.0:3000 0.0.0.0:0 LISTENING 731'],
    ['different local port', 'TCP 0.0.0.0:30000 0.0.0.0:0 LISTENING 732'],
    ['remote endpoint', 'TCP 127.0.0.1:5173 127.0.0.1:3000 LISTENING 733'],
  ])('uses the shared ownership guard instead of native PID killing for %s', async (_name, row) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    commands.execSync.mockImplementation((command) => (command.startsWith('netstat') ? row : ''));
    commands.execFileSync.mockReturnValue('');
    expect(await invokeActualCli()).toBe(0);
    expect(commands.execSync).not.toHaveBeenCalled();
    expect(commands.execFileSync).toHaveBeenCalledOnce();
    const [executable, args, options] = commands.execFileSync.mock.calls[0];
    expect(executable).toBe('powershell.exe');
    expect(args).toContain('-NonInteractive');
    expect(args.at(-1)).toContain('Stop-ErpRuntime');
    expect(args.at(-1)).toContain('Get-ErpRuntimeListeners');
    expect(options).toMatchObject({ cwd: root, stdio: 'inherit', windowsHide: true });
    expect(args.at(-1)).toContain('scripts/windows/runtime-control.ps1');
  });

  it('returns failure without announcing a free port when ownership or stop cannot be verified', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    commands.execSync.mockImplementation(() => {
      throw new Error('Isolated native refusal');
    });
    commands.execFileSync.mockImplementation(() => {
      throw new Error('Isolated native refusal');
    });
    expect(await invokeActualCli()).toBe(1);
    expect(error).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalledWith(expect.stringMatching(/متاح|تم تحرير|success|available/i));
  });
});

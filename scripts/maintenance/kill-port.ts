import { execSync } from 'child_process';

const PORT = 3000;

function killPort(port: number) {
  console.log(`🔍 فحص العمليات التي تستخدم البورت ${port}...`);
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      const lines = output.trim().split('\n');
      const pids = new Set<string>();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const state = parts[3];
          const pid = parts[parts.length - 1];
          if ((state === 'LISTENING' || line.includes('LISTENING')) && pid && pid !== '0') {
            pids.add(pid);
          }
        }
      }

      if (pids.size === 0) {
        console.log(`✅ البورت ${port} متاح وغير مشغول بأي عملية.`);
        return;
      }

      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          console.log(`✅ تم إنهاء العملية PID ${pid} بنجاح وتحرير البورت ${port}.`);
        } catch {
          // ignore
        }
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' });
      console.log(`✅ تم تحرير البورت ${port} بنجاح.`);
    }
  } catch {
    console.log(`✅ البورت ${port} متاح الآن.`);
  }
}

killPort(PORT);

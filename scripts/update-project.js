import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('==================================================');
console.log('         AlAgoouz ERP - Safe Auto-Updater         ');
console.log('==================================================');

const runCommand = (cmd, cwd) => {
  console.log(`\n\x1b[33mRunning: ${cmd}\x1b[0m`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

async function main() {
  try {
    // 1. Take a full system and database backup
    console.log('\n\x1b[36m[1/5] Taking safety backup...\x1b[0m');
    runCommand('node scripts/backup-system.js', rootDir);

    // 2. Pull latest code from Git
    console.log('\n\x1b[36m[2/5] Pulling latest updates from Git...\x1b[0m');
    try {
      runCommand('git pull', rootDir);
    } catch (gitErr) {
      console.warn('\x1b[31mWarning: git pull failed. Continuing update with local files.\x1b[0m');
    }

    // 3. Install dependencies
    console.log('\n\x1b[36m[3/5] Installing new dependencies...\x1b[0m');
    runCommand('npm install', path.join(rootDir, 'backend'));
    runCommand('npm install', path.join(rootDir, 'frontend'));

    // 4. Build Frontend & Run DB Migrations
    console.log('\n\x1b[36m[4/5] Building frontend and updating database...\x1b[0m');
    runCommand('node src/database/setup.js', path.join(rootDir, 'backend'));
    runCommand('npm run build', path.join(rootDir, 'frontend'));

    // 5. Restart the Backend Service
    console.log('\n\x1b[36m[5/5] Restarting the ERP Backend Service...\x1b[0m');
    
    // Find the PID of the process listening on port 3000 (the backend)
    let backendPid = null;
    try {
      const output = execSync('powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess"', { encoding: 'utf8' }).trim();
      if (output && !isNaN(output)) {
        backendPid = parseInt(output, 10);
      }
    } catch (e) {
      // Port might not be active
    }

    if (backendPid) {
      console.log(`Killing old backend process (PID: ${backendPid})...`);
      try {
        execSync(`taskkill /F /PID ${backendPid}`, { stdio: 'inherit' });
      } catch (err) {
        console.warn(`Failed to kill process ${backendPid}: ${err.message}`);
      }
    } else {
      console.log('No running backend process found on port 3000.');
    }

    // Start the Windows Scheduled Task to launch the backend silently
    console.log('Starting the AlAgoouz-ERP-Backend service...');
    execSync('schtasks /run /tn "AlAgoouz-ERP-Backend"', { stdio: 'inherit' });

    console.log('\n==================================================');
    console.log('\x1b[32m       ERP System Updated Successfully!           \x1b[0m');
    console.log('==================================================');
    console.log('The ERP system is running in the background.');
    console.log('Access URL: http://localhost:3000');
    console.log('==================================================\n');

  } catch (error) {
    console.error('\n\x1b[31mUpdate failed with error:\x1b[0m', error.message);
    process.exit(1);
  }
}

main();

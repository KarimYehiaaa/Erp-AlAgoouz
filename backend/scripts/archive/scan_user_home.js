import fs from 'fs';
import path from 'path';

const extensions = ['.sql', '.backup', '.dump', '.tar', '.bak'];
const scanDirs = [
  'C:/Users/Karim Yehia/Desktop',
  'C:/Users/Karim Yehia/Documents',
  'C:/Users/Karim Yehia/Downloads',
  'C:/Users/Karim Yehia/.gemini/antigravity'
];

function scanDir(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        // do not recurse too deep in heavy folders
        if (f !== 'node_modules' && f !== '.git' && f !== 'AppData' && f !== 'Local' && f !== 'Roaming') {
          scanDir(full);
        }
      } else {
        const ext = path.extname(f).toLowerCase();
        if (extensions.includes(ext) || f.toLowerCase().includes('backup')) {
          console.log(`Found: ${full} (${stat.size} bytes)`);
        }
      }
    }
  } catch (err) {
    // ignore
  }
}

console.log('Scanning user folders for DB backups...');
for (const dir of scanDirs) {
  if (fs.existsSync(dir)) {
    console.log(`Scanning: ${dir}`);
    scanDir(dir);
  }
}
console.log('Scan completed.');

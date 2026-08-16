import fs from 'fs';
import path from 'path';

function listDirRecursive(dir: string, depth = 2): any {
  if (depth <= 0 || !fs.existsSync(dir)) return [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.map((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        return { name: e.name, type: 'dir', children: listDirRecursive(full, depth - 1) };
      }
      return { name: e.name, type: 'file' };
    });
  } catch (err: any) {
    return { error: err.message };
  }
}

export default async function handler(req: any, res: any) {
  const rootFiles = listDirRecursive(process.cwd(), 3);
  const taskFiles = listDirRecursive('/var/task', 3);

  res.status(200).json({
    cwd: process.cwd(),
    rootFiles,
    taskFiles,
  });
}

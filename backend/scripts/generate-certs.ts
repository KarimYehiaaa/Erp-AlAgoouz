/**
 * generate-certs.ts — توليد شهادات SSL محلية للتطوير
 * ═══════════════════════════════════════════════════
 * ينشئ شهادة ذاتية التوقيع (localhost) في `backend/certs/` ليتمكن خادم
 * HTTPS المحلي (index.ts) من العمل. الشهادة صالحة 10 سنوات.
 *
 * التشغيل: `node scripts/generate-certs.ts` (من backend)
 */
import selfsigned from 'selfsigned';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certsDir = path.join(__dirname, '../certs');

if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

const keyPath = path.join(certsDir, 'key.pem');
const certPath = path.join(certsDir, 'cert.pem');

console.log('🔄 Generating Local SSL Certificates using selfsigned...');

try {
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = await selfsigned.generate(attrs, {
    keySize: 2048,
    days: 3650, // Valid for 10 years
    algorithm: 'sha256',
  });

  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  console.log('✅ Local SSL Certificates generated and saved successfully!');
} catch (err) {
  console.error('❌ Failed to generate SSL Certificates:', (err as Error).message);
  process.exit(1);
}

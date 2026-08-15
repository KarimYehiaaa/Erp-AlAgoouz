/**
 * حارس أمان إجباري يُشغَّل قبل أي اختبار (عبر setupFiles في vitest.config).
 *
 * اختبارات قاعدة البيانات (inventory, financial-integration, ...) تكتب
 * بيانات فعلية — لذلك يمنع هذا الحارس الاتصال بأي قاعدة **بعيدة**
 * (Supabase/إنتاج) ويسمح فقط بقاعدة محلية معزولة (localhost + قاعدة _test).
 *
 * ماذا تفعل عند الرفض؟ `npm test` يتوقف فورًا برسالة واضحة قبل أي اتصال.
 * للتشغيل الآمن محليًا: `npm run test:local` (قاعدة محلية معزولة).
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);

// نقرأ الإعداد **المحلول** من config (الذي يحمّل .env) — لأن process.env وحده
// لا يحتوي قيم .env ما لم يُحمَّل dotenv صراحةً.
const resolveDbTarget = async (): Promise<{ host: string; connStr: string }> => {
  try {
    const mod = (await import('../src/config/index.ts')) as {
      default?: { db?: { host?: string | null; connectionString?: string | null } };
    };
    const db = mod.default?.db;
    return {
      host: String(db?.host || '').toLowerCase(),
      connStr: String(db?.connectionString || ''),
    };
  } catch {
    // غياب متغيرات DB سيُنهي config بالخطأ — نرجع لـ process.env كاحتياط
    return {
      host: (process.env.DB_HOST || '').toLowerCase(),
      connStr: process.env.DATABASE_URL || '',
    };
  }
};

const { host, connStr } = await resolveDbTarget();

const isRemoteHost = host !== '' && !LOCAL_HOSTS.has(host);
const isRemoteUrl = connStr !== '' && !/localhost|127\.0\.0\.1/.test(connStr);

if (isRemoteHost || isRemoteUrl) {
  throw new Error(
    '⛔ أمان الاختبارات: رفض الاتصال بقاعدة بيانات بعيدة!\n' +
      `  DB_HOST="${host}"  DATABASE_URL="${connStr ? '(معرّفة — يُشتبه أنها بعيدة)' : ''}"\n` +
      '  اختبارات قاعدة البيانات تكتب بيانات ولا يمكن تشغيلها ضد الإنتاج/Supabase.\n' +
      '  للتشغيل بأمان محليًا:  npm run test:local   (قاعدة معزولة: bin_al_ajouz_test)\n' +
      '  في CI تُدار تلقائيًا عبر خدمة postgres المحلية.',
  );
}

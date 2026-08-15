/**
 * index.ts — نقطة دخول خادم بن العجوز ERP
 * ═══════════════════════════════════════════
 * نقطة الدخول الوحيدة — تجمع بين:
 *  - `./app.ts` — بناء تطبيق Express (يُصدَّر default للتشغيل/الاختبارات/Vercel)
 *  - `./server.ts` — منطق التشغيل (هجرات + HTTP/HTTPS + WebSocket + جدولة + إيقاف آمن)
 *
 * عند التشغيل المباشر (`node src/index.ts`) يُبدأ server.ts (يستمع على المنفذ).
 * في بيئة serverless (Vercel عبر `api/index.js`) يُستورد app فقط دون تشغيل.
 */
import app from './app.ts';
import './server.ts';

/**
 * تطبيق Express الجاهز — التصدير الافتراضي.
 * يُستخدم من:
 *  - `api/index.js` و `api/[...slug].js` (Vercel serverless)
 *  - اختبارات الدخان والاختبارات التكاملية
 *  - `node src/index.ts` (تشغيل مباشر — server.ts يبدأ الاستماع عند عدم وجود VERCEL)
 */
export default app;

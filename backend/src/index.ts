/**
 * index.ts — نقطة دخول خادم بن العجوز ERP
 * نقطة الدخول الوحيدة — تجمع بين:
 *  - `./app.ts` — بناء تطبيق Express (يُصدَّر default للتشغيل/الاختبارات/Vercel)
 *  - `./server.ts` — منطق التشغيل (هجرات + HTTP/HTTPS + WebSocket + جدولة + إيقاف آمن)
 *
 * عند التشغيل المباشر يُستخدم `npm run start -w backend` لتحميل Sentry وtsx قبل الخادم.
 * في بيئة serverless (Vercel عبر `api/index.ts`) يُستورد app فقط دون تشغيل.
 */
import app from './app.ts';
import './server.ts';

/**
 * تطبيق Express الجاهز — التصدير الافتراضي.
 * يُستخدم من:
 *  - `api/index.ts` في الجذر وbackend (Vercel serverless)
 *  - اختبارات الدخان والاختبارات التكاملية
 *  - `npm run start -w backend` (تشغيل مباشر — server.ts يبدأ الاستماع عند عدم وجود VERCEL)
 */
export default app;

/**
 * server.ts — تشغيل الخادم (Boot)
 * يفصل منطق التشغيل عن بناء التطبيق (app.ts):
 *  - تشغيل الهجرات ومزامنة الفواتير قبل الاستماع
 *  - خادم HTTP (المنفذ من config) + خادم HTTPS آمن (اختياري — certs)
 *  - تفعيل WebSocket والجدولة التلقائية (نسخ احتياطي + صيانة)
 *  - إيقاف آمن (graceful shutdown) على SIGTERM/SIGINT
 *
 * يُستدعى من index.ts عند التشغيل المباشر فقط (غير Vercel).
 */
import path from 'path';
import fs from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';
import app from './app.ts';
import config from './config/index.ts';
import { closePool } from './database/pool.ts';
import { initAutoBackupScheduler } from './services/autoBackupService.ts';
import { initWebSocket } from './services/websocketService.ts';
import { initAutomationScheduler } from './services/automationSchedulerService.ts';

// نظام الطوابير (BullMQ) يعتمد على Redis — يُحمَّل فقط عند توفر REDIS_URL.
if (!process.env.VERCEL && process.env.REDIS_URL) {
  import('./jobs/queue.ts').catch((err) => {
    console.warn(`[Queue]  فشل تحميل نظام الطوابير: ${err.message}`);
  });
} else if (!process.env.VERCEL) {
  console.log('[Queue] ℹ نظام الطوابير (BullMQ) معطّل — لتفعيله أضف REDIS_URL في .env');
}

// ─── تحديد مجلد العمل (يعمل في ESM وفي العقدة العادية) ───────────────────────
let __dirname = process.cwd();
try {
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    __dirname = path.dirname(fileURLToPath(import.meta.url));
  }
} catch {
  // تجاهل مقصود
}

// ─── التشغيل الفعلي للخادم (غير Vercel — Vercel يستورد app مباشرة) ───────────
if (!process.env.VERCEL) {
  import('../scripts/migrate.ts').then(async ({ runMigrations }) => {
    try {
      await runMigrations();
      const { syncStandaloneInvoicesToWholesaleSales } =
        await import('./services/invoiceService.ts');
      await syncStandaloneInvoicesToWholesaleSales();
    } catch (e) {
      console.error('Failed to run database migrations:', e);
      process.exit(1);
    }

    const server = app.listen(config.port, async () => {
      console.log(`☕ بن العجوز ERP يعمل على البورت الموحد: http://localhost:${config.port}`);
      console.log(`📊 لوحة التحكم: http://localhost:${config.port}`);
      initWebSocket(server);
      initAutomationScheduler();
      initAutoBackupScheduler();
      try {
        const { default: TelegramBotService } = await import('./services/telegramBotService.ts');
        await TelegramBotService.startListening();
      } catch (e: any) {
        console.error('Failed to start Telegram Bot listener:', e.message);
      }
      try {
        const { initDatabaseMaintenanceScheduler } =
          await import('./services/maintenanceService.ts');
        initDatabaseMaintenanceScheduler();
      } catch (e: any) {
        console.error('Failed to start maintenance scheduler:', e.message);
      }
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n [خطأ تشغيل الخادم] البورت ${config.port} مشغول حالياً بعملية أخرى!`);
        console.error(
          ` لإيقاف العملية التي تشغل البورت ${config.port}، يمكنك تنفيذ: npm run kill:port أو استخدام scripts\\windows\\stop-erp.ps1\n`,
        );
        process.exit(1);
      } else {
        console.error(' [خطأ في الخادم]:', err);
        process.exit(1);
      }
    });

    // خادم HTTPS آمن (اختياري) — يعمل فقط إذا وُجدت شهادات في backend/certs
    const keyPath = path.join(__dirname, '../certs/key.pem');
    const certPath = path.join(__dirname, '../certs/cert.pem');
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      try {
        const sslOptions = {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        };
        const httpsServer = https.createServer(sslOptions, app);
        const httpsPort = process.env.HTTPS_PORT || 3443;
        httpsServer.on('error', (err) => {
          // EADDRINUSE يحدث كحدث غير متزامن ولا يلتقطه try/catch — لا نسمح له بإسقاط الخادم كله
          const errCode = (err as Error & { code?: string }).code;
          if (errCode === 'EADDRINUSE') {
            console.warn(` HTTPS port ${httpsPort} مشغول — تخطي خادم HTTPS الآمن`);
          } else {
            console.error(` Failed to start HTTPS Server:`, err.message);
          }
        });
        httpsServer.listen(httpsPort, () => {
          console.log(` Secure HTTPS Server → https://localhost:${httpsPort}`);
          initWebSocket(httpsServer);
        });
      } catch (sslErr) {
        console.error(' Failed to start HTTPS Server:', sslErr.message);
      }
    }
  });
}

/**
 * إيقاف الخادم بشكل آمن: إغلاق Pool قاعدة البيانات ثم الخروج برمز نجاح.
 * @param {string} signal إشارة النظام التي استُقبلت (SIGTERM/SIGINT/uncaughtException)
 * @returns {Promise<void>}
 */
const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`
[Server] استُقبلت إشارة ${signal} — إغلاق الخادم بشكل آمن...`);
  try {
    await closePool();
    console.log('[Server] تم الإغلاق بنجاح ✅');
    process.exit(0);
  } catch (err) {
    console.error('[Server] خطأ أثناء الإغلاق:', (err as Error).message);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[Server] استثناء غير معالج:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Promise مرفوض غير معالج:', reason);
});

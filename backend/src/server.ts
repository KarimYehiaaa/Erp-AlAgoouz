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
import { closePool, query } from './database/pool.ts';
import { assertDatabaseSchemaReady, loadMigrationFiles } from './database/schemaReadiness.ts';
import {
  initAutoBackupScheduler,
  stopAutoBackupScheduler,
  drainAutoBackupScheduler,
} from './services/autoBackupService.ts';
import { initWebSocket } from './services/websocketService.ts';
import {
  initAutomationScheduler,
  stopAutomationScheduler,
  drainAutomationScheduler,
} from './services/automationSchedulerService.ts';
import {
  initDatabaseMaintenanceScheduler,
  stopDatabaseMaintenanceScheduler,
  drainDatabaseMaintenanceScheduler,
} from './services/maintenanceService.ts';
import { initSystemQueue, stopSystemQueue } from './jobs/queue.ts';
import { drainRuntime, RUNTIME_SHUTDOWN_TIMEOUT_MS } from './utils/shutdownRuntime.ts';
import type { Server } from 'node:http';
import type { WebSocketServer } from 'ws';

const servers: Server[] = [];
const webSockets: WebSocketServer[] = [];
let stopping = false;
let shutdownTask: Promise<void> | null = null;
let shutdownExitCode = 0;
let telegramStartup: Promise<void> | null = null;
let stopTelegram: (() => void) | undefined;

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
if (!config.isVercel) {
  import('../scripts/migrate.ts').then(async ({ runMigrations }) => {
    const skipStartupMigrations = process.env.ERP_SKIP_STARTUP_MIGRATIONS === 'true';

    if (skipStartupMigrations && config.nodeEnv !== 'development') {
      console.error(
        'ERP_SKIP_STARTUP_MIGRATIONS is only allowed in development; refusing to start.',
      );
      process.exit(1);
    }

    try {
      if (skipStartupMigrations) {
        console.warn(
          '[Startup] ERP_SKIP_STARTUP_MIGRATIONS=true: skipping schema migrations and invoice synchronization; the connected database must already match this application version.',
        );
        await assertDatabaseSchemaReady(
          query,
          loadMigrationFiles(path.join(__dirname, '../migrations')),
        );
      } else {
        await runMigrations();
        const { syncStandaloneInvoicesToWholesaleSales } =
          await import('./services/invoiceService.ts');
        await syncStandaloneInvoicesToWholesaleSales();
      }
    } catch (e) {
      console.error('Failed to run database migrations:', e);
      process.exit(1);
    }

    if (stopping) return;
    await initSystemQueue();
    if (stopping) return;
    const server = app.listen(config.port, async () => {
      if (stopping) return;
      console.log(`☕ بن العجوز ERP يعمل على البورت الموحد: http://localhost:${config.port}`);
      console.log(`📊 لوحة التحكم: http://localhost:${config.port}`);
      const socketServer = initWebSocket(server);
      if (socketServer) webSockets.push(socketServer);
      initAutomationScheduler();
      initAutoBackupScheduler();
      try {
        const { default: TelegramBotService } = await import('./services/telegramBotService.ts');
        stopTelegram = () => TelegramBotService.stopListening();
        if (!stopping) {
          telegramStartup = TelegramBotService.startListening();
          await telegramStartup;
          if (stopping) stopTelegram();
        }
      } catch (e: any) {
        console.error('Failed to start Telegram Bot listener:', e.message);
      }
      try {
        if (!stopping) initDatabaseMaintenanceScheduler();
      } catch (e: any) {
        console.error('Failed to start maintenance scheduler:', e.message);
      }
    });
    servers.push(server);

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n [خطأ تشغيل الخادم] البورت ${config.port} مشغول حالياً بعملية أخرى!`);
        console.error(
          config.port === 3000
            ? ' لإيقاف عمليات المشروع المملوكة التي تشغل المنفذ 3000، يمكنك تنفيذ: npm run kill:port\n'
            : ` راجع البرنامج الذي يستخدم المنفذ ${config.port} أو إعداد PORT قبل إعادة التشغيل.\n`,
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
        servers.push(httpsServer);
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
          if (stopping) return;
          console.log(` Secure HTTPS Server → https://localhost:${httpsPort}`);
          const socketServer = initWebSocket(httpsServer);
          if (socketServer) webSockets.push(socketServer);
        });
      } catch (sslErr) {
        console.error(' Failed to start HTTPS Server:', sslErr.message);
      }
    }
  });
}

/**
 * إيقاف استقبال الطلبات ثم انتظار الطلبات والمهام قبل إغلاق القاعدة.
 * @param {string} signal إشارة النظام التي استُقبلت (SIGTERM/SIGINT/uncaughtException)
 * @returns {Promise<void>}
 */
const gracefulShutdown = (signal: string, exitCode = 0): Promise<void> => {
  shutdownExitCode = Math.max(shutdownExitCode, exitCode);
  if (shutdownTask) return shutdownTask;
  stopping = true;
  console.log(`
[Server] استُقبلت إشارة ${signal} — إغلاق الخادم بشكل آمن...`);
  const deadline = setTimeout(() => {
    console.error('[Server] انتهت مهلة الإغلاق قبل اكتمال الطلبات والمهام.');
    process.exit(1);
  }, RUNTIME_SHUTDOWN_TIMEOUT_MS);
  deadline.unref();
  shutdownTask = (async () => {
    try {
      await drainRuntime({
        servers,
        webSockets,
        stopBackground: () => {
          stopAutomationScheduler();
          stopAutoBackupScheduler();
          stopTelegram?.();
          stopDatabaseMaintenanceScheduler();
        },
        stopJobs: async () => {
          const results = await Promise.allSettled([
            stopSystemQueue(),
            drainAutoBackupScheduler(),
            drainAutomationScheduler(),
            drainDatabaseMaintenanceScheduler(),
            (async () => {
              if (telegramStartup) await telegramStartup;
              stopTelegram?.();
            })(),
          ]);
          const errors = results.filter((result) => result.status === 'rejected');
          if (errors.length)
            throw new AggregateError(
              errors.map((result) => result.reason),
              'Background shutdown failed.',
            );
        },
        closeDatabase: closePool,
      });
      console.log('[Server] تم الإغلاق بنجاح ✅');
      process.exit(shutdownExitCode);
    } catch (err) {
      console.error('[Server] خطأ أثناء الإغلاق:', (err as Error).message);
      process.exit(1);
    } finally {
      clearTimeout(deadline);
    }
  })();
  return shutdownTask;
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('message', (message) => {
  if (message === 'shutdown') gracefulShutdown('PM2 shutdown');
});

process.on('uncaughtException', (err) => {
  console.error('[Server] استثناء غير معالج:', err);
  gracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Promise مرفوض غير معالج:', reason);
  gracefulShutdown('unhandledRejection', 1);
});

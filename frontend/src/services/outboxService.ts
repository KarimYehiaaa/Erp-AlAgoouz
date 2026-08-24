/**
 * services/outboxService.ts — محرك مزامنة الـ Outbox اللحظي للفرع المحلي
 * ═════════════════════════════════════════════════════════════════════
 * يعالج الفواتير والعمليات المنفذة في وضع Offline بنظام FIFO،
 * مع استخدام Exponential Backoff و Idempotency Keys، وحجر الفواتير
 * التالفة تلقائياً لمنع انسداد طابور المزامنة.
 */
import { localDb, type LocalOfflineSale } from './localDb';
import { executeWithRetry } from '../utils/retryPolicy';
import { sales } from '../api/sales.api';

export class OutboxService {
  private static isSyncing = false;

  /**
   * تشغيل دورة المزامنة لطابور الفواتير والعمليات المعلقة
   */
  public static async processOutbox(): Promise<{
    syncedCount: number;
    failedCount: number;
    remainingCount: number;
    quarantinedCount: number;
  }> {
    const current = await localDb.getOfflineSales();
    const pendingNow = current.filter((s) => s.sync_status !== 'QUARANTINED').length;
    const quarantinedNow = current.length - pendingNow;
    if (this.isSyncing || !navigator.onLine) {
      return {
        syncedCount: 0,
        failedCount: 0,
        remainingCount: pendingNow,
        quarantinedCount: quarantinedNow,
      };
    }

    this.isSyncing = true;
    let syncedCount = 0;
    let failedCount = 0;

    try {
      const items: LocalOfflineSale[] = await localDb.getOfflineSales();

      for (const item of items) {
        // تخطي الفواتير المحجورة لحين المراجعة اليدوية
        if (item.sync_status === 'QUARANTINED') {
          continue;
        }

        const {
          offline_id,
          sale_number,
          created_at,
          sync_status,
          retry_count,
          last_error,
          ...cleanPayload
        } = item;
        void sale_number;
        void created_at;
        void sync_status;
        void retry_count;
        void last_error;

        const idempotencyKey = item.sync_id || offline_id;

        try {
          // تحديث الحالة إلى جاري المزامنة
          await localDb.updateOfflineSale(offline_id, { sync_status: 'SYNCING' });

          // تنفيذ الطلب مع سياسة الإعادة الذكية
          await executeWithRetry(
            async () => {
              return await sales.create(cleanPayload, {
                headers: {
                  'Idempotency-Key': idempotencyKey,
                  'X-Idempotency-Key': idempotencyKey,
                },
              });
            },
            {
              maxRetries: 3,
              baseDelayMs: 600,
              maxDelayMs: 6000,
            },
          );

          // الحذف فور نجاح المزامنة من قاعدة البيانات المحلية
          await localDb.deleteOfflineSale(offline_id);
          syncedCount++;
        } catch (err: any) {
          failedCount++;
          const status = err?.status || err?.response?.status;
          const currentRetries = (item.retry_count || 0) + 1;

          // إذا كان الخطأ Validation أو بيانات تالفة (400 Bad Request)
          if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            console.error(
              `[Outbox] Quarantining corrupted sale ${offline_id} (Status ${status}):`,
              err.message,
            );
            await localDb.updateOfflineSale(offline_id, {
              sync_status: 'QUARANTINED',
              retry_count: currentRetries,
              last_error: err.message || 'خطأ في بنية الفاتورة',
            });
          } else {
            // خطأ شبكة أو سحابة مؤقت
            console.warn(
              `[Outbox] Transient network failure for ${offline_id}, pausing sync cycle:`,
              err.message,
            );
            await localDb.updateOfflineSale(offline_id, {
              sync_status: 'FAILED',
              retry_count: currentRetries,
              last_error: err.message || 'تعذر الاتصال بالخادم السحابي',
            });
            break; // التوقف حتى الدورة القادمة عند استقرار الشبكة
          }
        }
      }
    } catch (e: any) {
      console.error('[Outbox Engine Error]:', e);
    } finally {
      this.isSyncing = false;
    }

    const remaining = await localDb.getOfflineSales();
    const pending = remaining.filter((s) => s.sync_status !== 'QUARANTINED');
    return {
      syncedCount,
      failedCount,
      remainingCount: pending.length,
      quarantinedCount: remaining.length - pending.length,
    };
  }
}

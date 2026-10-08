/**
 * services/outboxService.ts — محرك مزامنة الـ Outbox اللحظي للمحل المحلي
 * يعالج الفواتير والعمليات المنفذة في وضع Offline بنظام FIFO،
 * مع استخدام Exponential Backoff و Idempotency Keys، وحجر الفواتير
 * التالفة تلقائياً لمنع انسداد طابور المزامنة.
 */
import { localDb, type LocalOfflineSale } from './localDb';
import { executeWithRetry } from '../utils/retryPolicy';
import { sales } from '../api/sales.api';
import { getApiCacheScope } from '../api/client';

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
    const cycleContext = getApiCacheScope();
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
        if (getApiCacheScope() !== cycleContext) break;
        // Preserve unknown legacy ownership and other contexts without retries.
        if (item.origin_context !== cycleContext || cycleContext.endsWith('::anonymous')) continue;
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
          origin_context,
          ...cleanPayload
        } = item;
        void sale_number;
        void created_at;
        void sync_status;
        void retry_count;
        void last_error;
        void origin_context;

        const idempotencyKey = item.sync_id || offline_id;

        try {
          // تحديث الحالة إلى جاري المزامنة
          const marked = await localDb.updateOfflineSale(offline_id, { sync_status: 'SYNCING' });
          if (!marked || getApiCacheScope() !== cycleContext) break;

          // تنفيذ الطلب مع سياسة الإعادة الذكية
          await executeWithRetry(
            async () => {
              if (getApiCacheScope() !== cycleContext) {
                throw { status: 409, message: 'تغير سياق الجلسة أثناء المزامنة' };
              }
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
          const removed = await localDb.deleteOfflineSale(offline_id);
          if (removed) syncedCount++;
          if (getApiCacheScope() !== cycleContext) break;
        } catch (err: any) {
          if (getApiCacheScope() !== cycleContext) break;
          failedCount++;
          const status = err?.status || err?.response?.status;
          const currentRetries = (item.retry_count || 0) + 1;
          const errorMessage = err?.response?.data?.message || err?.message || 'خطأ غير معروف';

          // أخطاء التوثيق (401 Unauthorized) — الجلسة منتهية، لا نحجر الفاتورة بل نوقف المزامنة حتى تجديد الدخول
          if (status === 401) {
            console.warn(
              `[Outbox] Session expired (401) while syncing ${offline_id}. Pausing sync.`,
            );
            await localDb.updateOfflineSale(offline_id, {
              sync_status: 'FAILED',
              retry_count: currentRetries,
              last_error: 'انتهت صلاحية الجلسة (يرجى تسجيل الدخول مجدداً)',
            });
            break;
          }

          // أخطاء الصلاحيات (403 Forbidden) أو المعدل (429) أو مهلة الطلب (408) — إيقاف مؤقت دون حجر
          if (status === 403 || status === 408 || status === 429) {
            console.warn(
              `[Outbox] Temporary or permission error (${status}) for ${offline_id}. Pausing sync.`,
            );
            await localDb.updateOfflineSale(offline_id, {
              sync_status: 'FAILED',
              retry_count: currentRetries,
              last_error: errorMessage,
            });
            break;
          }

          // أخطاء التضارب (409 Conflict) — مثل عملية مكررة أو تضارب تزامن
          if (status === 409) {
            console.warn(`[Outbox] Conflict (409) for ${offline_id}:`, errorMessage);
            await localDb.updateOfflineSale(offline_id, {
              sync_status: 'FAILED',
              retry_count: currentRetries,
              last_error: errorMessage,
            });
            break;
          }

          // إذا كان الخطأ Validation حقيقي أو بنية بيانات تالفة (400 Bad Request أو 422 Unprocessable)
          if (status === 400 || status === 422) {
            console.error(
              `[Outbox] Quarantining corrupted sale ${offline_id} (Status ${status}):`,
              errorMessage,
            );
            await localDb.updateOfflineSale(offline_id, {
              sync_status: 'QUARANTINED',
              retry_count: currentRetries,
              last_error: errorMessage || 'خطأ في بنية الفاتورة',
            });
          } else {
            // خطأ شبكة أو خادم سحابي مؤقت (5xx أو انقطاع اتصال)
            console.warn(
              `[Outbox] Transient network/server failure for ${offline_id}, pausing sync cycle:`,
              errorMessage,
            );
            await localDb.updateOfflineSale(offline_id, {
              sync_status: 'FAILED',
              retry_count: currentRetries,
              last_error: errorMessage || 'تعذر الاتصال بالخادم',
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

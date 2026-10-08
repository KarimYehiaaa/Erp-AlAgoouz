<template>
  <div class="pos-sync-monitor-page">
    <div class="sync-card">
      <div class="card-header">
        <div class="header-left">
          <span class="pulse-dot" :class="isOnline ? 'online' : 'offline'"></span>
          <h2>مركز المزامنة والطابور المحلي (Sync Hub)</h2>
        </div>
        <button type="button" class="btn-back" @click="router.push('/sales')">
          <AppIcon name="arrowRight" :size="16" />
          <span>الرجوع لشاشة البيع</span>
        </button>
      </div>

      <!-- Sync Status Banner -->
      <div class="status-summary-box" :class="isOnline ? 'online' : 'offline'">
        <div class="status-icon">
          <AppIcon :name="isOnline ? 'checkCircle' : 'alertTriangle'" :size="28" />
        </div>
        <div class="status-details">
          <h4>
            {{
              isOnline ? 'الاتصال بالخادم المركزي مستقر' : 'وضع غير متصل بالإنترنت (Offline Mode)'
            }}
          </h4>
          <p>
            {{
              isOnline
                ? 'يتم ترحيل الفواتير تلقائياً ومباشرة إلى قاعدة البيانات المركزية.'
                : 'تُحفظ الفواتير محلياً على جهاز الكاشير وسيتم ترحيلها فور عودة الاتصال.'
            }}
          </p>
        </div>
        <button
          v-if="isOnline && pendingQueue.length > 0 && !queueReadError"
          type="button"
          class="btn-sync-now"
          :disabled="syncing"
          @click="triggerBatchSync"
        >
          <span v-if="syncing">جاري المزامنة...</span>
          <span v-else>مزامنة الآن ({{ pendingQueue.length }})</span>
        </button>
        <button
          v-if="failedCount > 0 && isOnline && !queueReadError"
          type="button"
          class="btn-retry-failed"
          :disabled="syncing"
          @click="retryFailedTransactions"
        >
          إعادة فتح الفاشلة ({{ failedCount }})
        </button>
      </div>

      <!-- Pending Transactions Table -->
      <p v-if="queueReadError" role="alert">{{ queueReadError }}</p>
      <button v-if="canExportRecovery" type="button" :disabled="exporting" @click="exportRecovery">
        {{ exporting ? 'جاري حفظ النسخة...' : 'حفظ نسخة للاسترجاع (للمسؤول)' }}
      </button>
      <p v-if="recoveryMessage" role="status">{{ recoveryMessage }}</p>
      <div
        v-if="retention.unknownCount || retention.otherContextCount || retention.unavailable"
        role="status"
      >
        <p v-if="retention.unknownCount">
          يوجد {{ retention.unknownCount }} فاتورة قديمة محفوظة تحتاج مراجعة مصدرها قبل المزامنة.
        </p>
        <p v-if="retention.otherContextCount">
          يوجد {{ retention.otherContextCount }} فاتورة محفوظة لحساب أو سيرفر آخر. تظهر عند العودة
          لسياقها.
        </p>
        <p v-if="retention.unavailable">
          تعذر التأكد من حالة بعض الفواتير المحفوظة. البيانات تحتاج مراجعة.
        </p>
      </div>
      <div class="queue-table-section">
        <h3>الفواتير المعلقة محلياً ({{ pendingQueue.length }})</h3>

        <div v-if="!pendingQueue.length && !queueReadError" class="empty-queue">
          <AppIcon name="checkCircle" :size="36" />
          <p>لا توجد فواتير معلقة ظاهرة للحساب والسيرفر الحاليين.</p>
        </div>

        <div v-else class="table-wrap">
          <table class="pos-table">
            <thead>
              <tr>
                <th>معرّف التزامن (Sync ID)</th>
                <th>التوقيت</th>
                <th>إجمالي الفاتورة</th>
                <th>عدد الأصناف</th>
                <th>الحالة</th>
                <th>آخر خطأ</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in pendingQueue" :key="item.sync_id">
                <td class="code-cell">{{ item.sync_id }}</td>
                <td>{{ item.sale_date || item.created_at }}</td>
                <td>
                  <strong>{{ formatMoney(item.total_amount) }}</strong>
                </td>
                <td>{{ item.items?.length || 0 }} قطع</td>
                <td>
                  <span class="status-tag" :class="item.status?.toLowerCase()">
                    {{ item.status || 'PENDING' }}
                  </span>
                </td>
                <td class="error-cell">{{ item.last_error || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import { api } from '../services/api';
import { formatMoney } from '../utils/currency';
import {
  getBrowserQueueContext,
  getBrowserQueueRetentionSummary,
  getBrowserQueueRecoverySnapshot,
  readBrowserQueue,
  writeBrowserQueue,
} from '../services/browserQueue';
import { ADMIN_ROLES } from '../../../shared/permissions.js';
import { sessionService } from '../services/sessionService';

const router = useRouter();
const isOnline = ref(navigator.onLine);
const pendingQueue = ref<any[]>([]);
const syncing = ref(false);
const retention = ref({ unknownCount: 0, otherContextCount: 0, unavailable: false });
const queueReadError = ref('');
const canExportRecovery = !!window.electronAPI?.exportQueueRecovery || !window.electronAPI;
const exporting = ref(false);
const recoveryMessage = ref('');
const exportRecovery = async () => {
  if (exporting.value) return;
  if (
    !window.confirm(
      'قد تحتوي نسخة الاسترجاع على بيانات عملاء ومبيعات وحسابات أخرى محفوظة على هذا الجهاز. احفظها في مكان آمن. هل تريد المتابعة؟',
    )
  )
    return;
  exporting.value = true;
  recoveryMessage.value = '';
  try {
    if (window.electronAPI?.exportQueueRecovery) {
      const result = await window.electronAPI.exportQueueRecovery();
      if (result?.canceled) return;
      recoveryMessage.value = result?.success
        ? `حُفظت نسخة من ${result.fileCount} ملفات في ${result.directory}. الملفات الأصلية كما هي؛ لم تُرسل فواتير.`
        : result?.error || 'تعذر حفظ نسخة الاسترجاع';
      return;
    }

    const context = getBrowserQueueContext();
    const revision = sessionService.getRevision();
    const profile = await api.get('/auth/profile');
    const user = profile.data?.data?.user;
    if (
      profile.data?.success !== true ||
      !ADMIN_ROLES.includes(user?.role_name) ||
      Number(user?.id) !== Number(sessionService.getUser()?.id) ||
      context !== getBrowserQueueContext() ||
      revision !== sessionService.getRevision()
    ) {
      throw new Error('تصدير ملفات الاسترجاع يتطلب جلسة مسؤول مؤكدة على السيرفر الحالي');
    }
    const snapshot = getBrowserQueueRecoverySnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `alagoouz-pos-queue-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    recoveryMessage.value = `تم تنزيل نسخة من ${snapshot.queues.length} طوابير بصيغتها الخام. لم تُرسل الفواتير ولم تُعدّل الملفات الأصلية.`;
  } catch (error: any) {
    recoveryMessage.value =
      error?.response?.data?.message ||
      error?.message ||
      'تعذر حفظ نسخة الاسترجاع؛ الملفات الأصلية محفوظة.';
  } finally {
    exporting.value = false;
  }
};
const failedCount = computed(
  () => pendingQueue.value.filter((item) => item.status === 'FAILED').length,
);

const loadQueue = async () => {
  queueReadError.value = '';
  pendingQueue.value = [];
  retention.value = { unknownCount: 0, otherContextCount: 0, unavailable: false };
  try {
    if ((window as any).electronAPI) {
      pendingQueue.value = await (window as any).electronAPI.getPendingTransactions();
      const summary = await (window as any).electronAPI.getQueueRetentionSummary?.();
      retention.value = {
        unknownCount: summary?.unknownCount || 0,
        otherContextCount: summary?.otherContextCount || 0,
        unavailable: !summary?.success,
      };
    } else {
      const savedQueue = readBrowserQueue();
      pendingQueue.value = savedQueue.map((sale: any) => ({
        ...sale,
        sale_type: sale.sale_type === 'branch' ? 'retail' : sale.sale_type,
      }));
      const summary = getBrowserQueueRetentionSummary();
      retention.value = {
        unknownCount: summary.unknownCount,
        otherContextCount: summary.otherContextCount,
        unavailable: !summary.success,
      };
    }
  } catch (error: any) {
    queueReadError.value =
      error?.message || 'تعذر قراءة الفواتير المحلية؛ يلزم مراجعة الملفات المحفوظة.';
    retention.value.unavailable = true;
  }
};

const triggerBatchSync = async () => {
  if (!pendingQueue.value.length || syncing.value) return;
  syncing.value = true;
  try {
    if ((window as any).electronAPI) {
      const res = await (window as any).electronAPI.triggerManualSync();
      if (!res?.success && res?.synced === 0)
        throw new Error(res?.message || 'تعذر مزامنة الفواتير');
    } else {
      const context = getBrowserQueueContext();
      const queue = readBrowserQueue(context);
      let itemCount = 0;
      const batch = queue
        .filter((item) => {
          if (!Array.isArray(item.items) || item.items.length > 100) return false;
          if (itemCount + item.items.length > 500) return false;
          itemCount += item.items.length;
          return true;
        })
        .slice(0, 50);
      if (!batch.length) throw new Error('الفواتير المحفوظة تحتاج مراجعة الأصناف قبل المزامنة');
      const res = await api.post('/sales/batch-sync', { sales: batch }, {
        _queueContext: context,
      } as any);
      if (!res.data.success) throw new Error(res.data.message || 'تعذر مزامنة الفواتير');
      if (context !== getBrowserQueueContext())
        throw new Error('تغير الحساب أو السيرفر؛ الفواتير المحلية محفوظة');
      if (!Array.isArray(res.data.results))
        throw new Error('استجابة المزامنة غير مكتملة؛ الفواتير محفوظة');
      const submitted = new Set(batch.map((item) => item.sync_id));
      const completed = new Set<string>();
      const failures = new Map<string, string>();
      for (const result of res.data.results) {
        if (!submitted.delete(result.sync_id)) continue;
        if (result.status === 'SYNCED') completed.add(result.sync_id);
        else if (result.status === 'FAILED')
          failures.set(result.sync_id, result.error || 'تعذر ترحيل الفاتورة');
      }
      const latest = readBrowserQueue(context);
      writeBrowserQueue(
        latest
          .filter((item) => !completed.has(item.sync_id))
          .map((item) =>
            failures.has(item.sync_id)
              ? {
                  ...item,
                  status: 'FAILED',
                  last_error: failures.get(item.sync_id),
                  retry_count: Number(item.retry_count || 0) + 1,
                }
              : item,
          ),
        context,
      );
    }
    alert('تمت معالجة طابور المزامنة. راجع الحالات المتبقية إن وجدت.');
    await loadQueue();
  } catch (err: any) {
    alert('حدث خطأ أثناء المزامنة: ' + err.message);
  } finally {
    syncing.value = false;
  }
};

const retryFailedTransactions = async () => {
  if (!(window as any).electronAPI || syncing.value) return;
  syncing.value = true;
  try {
    for (const item of pendingQueue.value.filter((entry) => entry.status === 'FAILED')) {
      await (window as any).electronAPI.resetTransactionRetry(item.sync_id);
    }
    await loadQueue();
    syncing.value = false;
    await triggerBatchSync();
  } catch (err: any) {
    alert('تعذر إعادة فتح العمليات الفاشلة: ' + err.message);
  } finally {
    syncing.value = false;
  }
};

onMounted(async () => {
  await loadQueue();
});
</script>

<style lang="scss" scoped>
.pos-sync-monitor-page {
  min-height: 100vh;
  background: #1c1917;
  padding: 30px;
  display: flex;
  justify-content: center;
}

.sync-card {
  width: 100%;
  max-width: 900px;
  background: #292524;
  border: 1.5px solid rgba(217, 168, 108, 0.2);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #44403c;
  padding-bottom: 14px;

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;

    .pulse-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;

      &.online {
        background: #22c55e;
        box-shadow: 0 0 10px #22c55e;
      }
      &.offline {
        background: #ef4444;
        box-shadow: 0 0 10px #ef4444;
      }
    }

    h2 {
      font-size: 1.3rem;
      font-weight: 850;
      color: #f5f5f4;
      margin: 0;
    }
  }

  .btn-back {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #44403c;
    color: #f5f5f4;
    border: none;
    padding: 8px 14px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 750;

    &:hover {
      background: #57534e;
    }
  }
}

.status-summary-box {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 10px;

  &.online {
    background: rgba(34, 197, 94, 0.12);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #4ade80;
  }

  &.offline {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
  }

  .status-details {
    flex: 1;

    h4 {
      margin: 0 0 4px;
      font-size: 1.05rem;
      font-weight: 800;
    }

    p {
      margin: 0;
      font-size: 0.85rem;
      color: #d6d3d1;
    }
  }

  .btn-sync-now {
    background: #22c55e;
    color: #ffffff;
    border: none;
    padding: 10px 18px;
    border-radius: 8px;
    font-weight: 850;
    cursor: pointer;

    &:hover {
      background: #16a34a;
    }
  }
}

.queue-table-section {
  display: flex;
  flex-direction: column;
  gap: 12px;

  h3 {
    font-size: 1.1rem;
    font-weight: 800;
    color: #f5f5f4;
    margin: 0;
  }

  .empty-queue {
    padding: 40px;
    text-align: center;
    background: #1c1917;
    border-radius: 10px;
    color: #4ade80;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;

    p {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 750;
      color: #d6d3d1;
    }
  }

  .pos-table {
    width: 100%;
    border-collapse: collapse;
    background: #1c1917;
    border-radius: 10px;
    overflow: hidden;

    th,
    td {
      padding: 12px 14px;
      text-align: right;
      font-size: 0.88rem;
    }

    th {
      background: #292524;
      color: #a8a29e;
      font-weight: 800;
    }

    td {
      border-bottom: 1px solid #332f2e;
      color: #d6d3d1;
    }

    .code-cell {
      font-family: monospace;
      color: #fbbf24;
    }

    .status-tag {
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 800;

      &.pending {
        background: rgba(245, 158, 11, 0.2);
        color: #fbbf24;
      }
      &.synced {
        background: rgba(34, 197, 94, 0.2);
        color: #4ade80;
      }
      &.failed {
        background: rgba(239, 68, 68, 0.2);
        color: #f87171;
      }
    }
  }
}
</style>

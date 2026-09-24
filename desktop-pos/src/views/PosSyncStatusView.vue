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
          <h4>{{ isOnline ? 'الاتصال بالخادم المركزي مستقر' : 'وضع غير متصل بالإنترنت (Offline Mode)' }}</h4>
          <p>{{ isOnline ? 'يتم ترحيل الفواتير تلقائياً ومباشرة إلى قاعدة البيانات المركزية.' : 'تُحفظ الفواتير محلياً على جهاز الكاشير وسيتم ترحيلها فور عودة الاتصال.' }}</p>
        </div>
        <button
          v-if="isOnline && pendingQueue.length > 0"
          type="button"
          class="btn-sync-now"
          :disabled="syncing"
          @click="triggerBatchSync"
        >
          <span v-if="syncing">جاري المزامنة...</span>
          <span v-else>مزامنة الآن ({{ pendingQueue.length }})</span>
        </button>
        <button
          v-if="failedCount > 0 && isOnline"
          type="button"
          class="btn-retry-failed"
          :disabled="syncing"
          @click="retryFailedTransactions"
        >
          إعادة فتح الفاشلة ({{ failedCount }})
        </button>
      </div>

      <!-- Pending Transactions Table -->
      <div class="queue-table-section">
        <h3>الفواتير المعلقة محلياً ({{ pendingQueue.length }})</h3>

        <div v-if="!pendingQueue.length" class="empty-queue">
          <AppIcon name="checkCircle" :size="36" />
          <p>جميع الفواتير والعمليات مرحّلة بنجاح ولا يوجد أي فواتير معلقة!</p>
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
                <td><strong>{{ formatMoney(item.total_amount) }}</strong></td>
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

const router = useRouter();
const isOnline = ref(navigator.onLine);
const pendingQueue = ref<any[]>([]);
const syncing = ref(false);
const failedCount = computed(() => pendingQueue.value.filter((item) => item.status === 'FAILED').length);

const loadQueue = async () => {
  if ((window as any).electronAPI) {
    pendingQueue.value = await (window as any).electronAPI.getPendingTransactions();
  } else {
    const savedQueue = JSON.parse(localStorage.getItem('pos_offline_sales') || '[]');
    pendingQueue.value = savedQueue.map((sale: any) => ({
      ...sale,
      sale_type: sale.sale_type === 'branch' ? 'retail' : sale.sale_type,
    }));
    localStorage.setItem('pos_offline_sales', JSON.stringify(pendingQueue.value));
  }
};

const triggerBatchSync = async () => {
  if (!pendingQueue.value.length || syncing.value) return;
  syncing.value = true;
  try {
    if ((window as any).electronAPI) {
      const res = await (window as any).electronAPI.triggerManualSync();
      if (!res?.success && res?.synced === 0) throw new Error(res?.message || 'تعذر مزامنة الفواتير');
    } else {
      const res = await api.post('/sales/batch-sync', { sales: pendingQueue.value });
      if (!res.data.success) throw new Error(res.data.message || 'تعذر مزامنة الفواتير');
      localStorage.removeItem('pos_offline_sales');
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

    th, td {
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

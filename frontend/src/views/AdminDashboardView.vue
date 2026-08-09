<template>
  <div class="admin-dashboard">
    <!-- Page Header -->
    <div class="admin-header">
      <div class="header-text">
        <h1 class="admin-title">🎛️ مركز التحكم الإداري</h1>
        <p class="admin-subtitle">مراقبة شاملة لصحة النظام والعمليات والأداء المالي</p>
      </div>
      <div class="header-actions">
        <span class="last-update"> آخر تحديث: {{ lastUpdateStr }} </span>
        <button class="btn-refresh" @click="refreshAll" :disabled="loading">
          <span :class="{ spin: loading }">🔄</span>
          {{ loading ? 'جاري التحديث...' : 'تحديث' }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="initialLoading" class="admin-loading">
      <div class="loading-spinner"></div>
      <span>جاري تحميل بيانات لوحة التحكم...</span>
    </div>

    <template v-else>
      <!-- Section 1: System Health -->
      <section class="admin-section">
        <h2 class="section-title">
          <span class="section-icon">🖥️</span>
          صحة النظام
          <span class="status-dot" :class="systemOk ? 'ok' : 'critical'"></span>
        </h2>
        <SystemHealthCard :health="healthData" />
      </section>

      <!-- Section 2: Financial KPIs -->
      <section class="admin-section">
        <h2 class="section-title">
          <span class="section-icon">💰</span>
          المؤشرات المالية والمستهدفات
        </h2>
        <FinancialKPICards :dashboard="dashboardData" :counts="countsData" />
      </section>

      <!-- Section 3: Risk Radar & Critical Warnings -->
      <section class="admin-section">
        <RiskRadar :data="riskRadarData" :loading="loading" />
      </section>

      <!-- Section 4 & 5: Activity Feed + Sessions (side by side) -->
      <div class="admin-columns">
        <section class="admin-section col-main">
          <ActivityFeed :items="activityData" @refresh="loadActivity" />
        </section>

        <section class="admin-section col-side">
          <SessionsManager
            :sessions="sessionsData"
            :failed-logins="failedLoginsData"
            :revoking="revokingId"
            @revoke="handleRevokeSession"
          />
        </section>
      </div>

      <!-- Section 6 & 7: Smart Alerts + Quick Actions -->
      <div class="admin-columns">
        <section class="admin-section col-main">
          <SmartAlerts :alerts="alertsData" />
        </section>

        <section class="admin-section col-side">
          <QuickActions
            @backup="handleBackup"
            @repair-sequences="handleRepairSequences"
            @purge-logs="handlePurgeLogs"
            @broadcast="showBroadcastModal = true"
            @clear-cache="handleClearCache"
          />
        </section>
      </div>

      <!-- Broadcast Modal -->
      <div v-if="showBroadcastModal" class="modal-overlay" @click.self="showBroadcastModal = false">
        <div
          class="card modal-card"
          style="
            width: min(500px, 90vw);
            margin-inline: auto;
            background: var(--bg-elevated, #1e293b);
            color: #fff;
            padding: 24px;
            border-radius: 16px;
          "
        >
          <h3 style="margin-top: 0">📢 إرسال تنبيه عام لجميع المستخدمين</h3>
          <form @submit.prevent="submitBroadcast">
            <div class="form-group" style="margin-bottom: 12px">
              <label>عنوان التنبيه</label>
              <input
                v-model="broadcastForm.title"
                class="field-like"
                placeholder="مثال: تنبيه صيانة، تحديث أسعار..."
                style="
                  width: 100%;
                  padding: 8px 12px;
                  border-radius: 8px;
                  border: 1px solid var(--border);
                  background: var(--bg-input);
                  color: #fff;
                "
              />
            </div>
            <div class="form-group" style="margin-bottom: 12px">
              <label>مستوى التنبيه</label>
              <select
                v-model="broadcastForm.level"
                class="field-like"
                style="
                  width: 100%;
                  padding: 8px 12px;
                  border-radius: 8px;
                  border: 1px solid var(--border);
                  background: var(--bg-input);
                  color: #fff;
                "
              >
                <option value="info">ℹ️ معلومات عادية</option>
                <option value="warning">⚠️ تحذير هام</option>
                <option value="danger">🚨 تنبيه عاجل / طوارئ</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 16px">
              <label>نص التنبيه *</label>
              <textarea
                v-model="broadcastForm.message"
                required
                rows="3"
                class="field-like"
                placeholder="اكتب نص التنبيه الذي سيظهر لجميع مستخدمي النظام..."
                style="
                  width: 100%;
                  padding: 8px 12px;
                  border-radius: 8px;
                  border: 1px solid var(--border);
                  background: var(--bg-input);
                  color: #fff;
                "
              ></textarea>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end">
              <button type="submit" class="btn btn-primary">نشر التنبيه</button>
              <button type="button" class="btn btn-outline" @click="showBroadcastModal = false">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import api from '@/api/index';
import SystemHealthCard from '@/components/admin/SystemHealthCard.vue';
import FinancialKPICards from '@/components/admin/FinancialKPICards.vue';
import ActivityFeed from '@/components/admin/ActivityFeed.vue';
import SessionsManager from '@/components/admin/SessionsManager.vue';
import SmartAlerts from '@/components/admin/SmartAlerts.vue';
import QuickActions from '@/components/admin/QuickActions.vue';
import RiskRadar from '@/components/admin/RiskRadar.vue';

const initialLoading = ref(true);
const loading = ref(false);
const lastUpdate = ref(new Date());
const lastUpdateStr = ref('');

// Data refs
const healthData = ref({});
const dashboardData = ref({});
const countsData = ref({});
const activityData = ref([]);
const sessionsData = ref([]);
const failedLoginsData = ref([]);
const alertsData = ref({});
const riskRadarData = ref({});
const revokingId = ref(null);
const systemOk = ref(true);

// Broadcast Modal
const showBroadcastModal = ref(false);
const broadcastForm = ref({ title: '', message: '', level: 'info' });

// Auto-refresh interval
let refreshInterval = null;

// Update timestamp display
const updateTimeStr = () => {
  lastUpdateStr.value = lastUpdate.value.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

// Load functions
const loadHealth = async () => {
  try {
    const res = await api.get('/admin/health');
    healthData.value = res?.data !== undefined ? res.data : res;
    systemOk.value = true;
  } catch (e) {
    console.error('[Admin] Health error:', e);
    systemOk.value = false;
  }
};

const loadDashboard = async () => {
  try {
    const res = await api.get('/dashboard', { params: { period: 'month' } });
    dashboardData.value = res.data !== undefined ? res.data : res || {};
  } catch (e) {
    console.error('[Admin] Dashboard error:', e);
  }
};

const loadCounts = async () => {
  try {
    const res = await api.get('/admin/counts');
    countsData.value = res.data !== undefined ? res.data : res || {};
  } catch (e) {
    console.error('[Admin] Counts error:', e);
  }
};

const loadRiskRadar = async () => {
  try {
    const res = await api.get('/admin/risk-radar');
    riskRadarData.value = res.data !== undefined ? res.data : res || {};
  } catch (e) {
    console.error('[Admin] Risk radar error:', e);
  }
};

const loadActivity = async () => {
  try {
    const res = await api.get('/admin/activity', { params: { limit: 50 } });
    activityData.value = res.data !== undefined ? res.data : res || [];
  } catch (e) {
    console.error('[Admin] Activity error:', e);
  }
};

const loadSessions = async () => {
  try {
    const res = await api.get('/admin/sessions');
    sessionsData.value = res.data !== undefined ? res.data : res || [];
  } catch (e) {
    console.error('[Admin] Sessions error:', e);
    sessionsData.value = [];
  }
};

const loadFailedLogins = async () => {
  try {
    const res = await api.get('/admin/failed-logins', { params: { hours: 24 } });
    failedLoginsData.value = res.data !== undefined ? res.data : res || [];
  } catch (e) {
    console.error('[Admin] Failed logins error:', e);
    failedLoginsData.value = [];
  }
};

const loadAlerts = async () => {
  try {
    const res = await api.get('/operations/alerts');
    alertsData.value = res.data || {};
  } catch (e) {
    console.error('[Admin] Alerts error:', e);
  }
};

// Refresh all data
const refreshAll = async () => {
  loading.value = true;
  try {
    await Promise.allSettled([
      loadHealth(),
      loadDashboard(),
      loadCounts(),
      loadRiskRadar(),
      loadActivity(),
      loadSessions(),
      loadFailedLogins(),
      loadAlerts(),
    ]);
    lastUpdate.value = new Date();
    updateTimeStr();
  } finally {
    loading.value = false;
  }
};

// Actions
const handleRevokeSession = async (sessionId) => {
  if (!confirm('هل تريد إنهاء هذه الجلسة؟')) return;
  revokingId.value = sessionId;
  try {
    await api.delete(`/admin/sessions/${sessionId}`);
    sessionsData.value = sessionsData.value.filter((s) => s.id !== sessionId);
  } catch (e) {
    alert('فشل إنهاء الجلسة: ' + (e.response?.data?.message || e.message));
  } finally {
    revokingId.value = null;
  }
};

const handleBackup = async () => {
  try {
    const res = await api.get('/admin/backup', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `alagoouz_erp_backup_${new Date().toISOString().slice(0, 10)}.json`,
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    alert('✅ تم تنزيل نسخة احتياطية كاملة لقاعدة البيانات بنجاح');
  } catch (e) {
    alert('❌ فشل تنزيل النسخة الاحتياطية: ' + (e.response?.data?.message || e.message));
  }
};

const handleRepairSequences = async () => {
  try {
    const res = await api.post('/admin/repair-sequences');
    alert(`✅ ${res.data?.message || 'تم إصلاح متسلسلات قاعدة البيانات بنجاح'}`);
  } catch (e) {
    alert('❌ فشل إصلاح المتسلسلات: ' + (e.response?.data?.message || e.message));
  }
};

const handlePurgeLogs = async () => {
  if (!confirm('هل تريد تنظيف سجلات النشاط القادمة من أكثر من 90 يوماً؟')) return;
  try {
    const res = await api.post('/admin/purge-logs', { days: 90 });
    alert(`✅ تم حذف ${res.data?.data?.deletedCount || 0} سجل نشاط قديم`);
    loadActivity();
  } catch (e) {
    alert('❌ فشل تنظيف السجلات: ' + (e.response?.data?.message || e.message));
  }
};

const submitBroadcast = async () => {
  if (!broadcastForm.value.message) return;
  try {
    await api.post('/admin/broadcast', broadcastForm.value);
    alert('✅ تم نشر التنبيه العام لجميع المستخدمين بالنظام بنجاح');
    showBroadcastModal.value = false;
    broadcastForm.value = { title: '', message: '', level: 'info' };
  } catch (e) {
    alert('❌ فشل إرسال التنبيه: ' + (e.response?.data?.message || e.message));
  }
};

const handleClearCache = () => {
  // Clear browser cache and reload dashboard data
  refreshAll();
};

// Lifecycle
onMounted(async () => {
  await refreshAll();
  initialLoading.value = false;

  // Auto-refresh every 60 seconds
  refreshInterval = setInterval(() => {
    loadHealth();
    loadActivity();
    loadCounts();
    lastUpdate.value = new Date();
    updateTimeStr();
  }, 60000);
});

onBeforeUnmount(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});
</script>

<style scoped>
.admin-dashboard {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  direction: rtl;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
  flex-wrap: wrap;
  gap: 16px;
}

.admin-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 900;
  color: var(--text-strong, #fff);
}

.admin-subtitle {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: var(--text-muted, #888);
  font-weight: 500;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.last-update {
  font-size: 0.76rem;
  color: var(--text-muted, #888);
  font-weight: 500;
}

.btn-refresh {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  background: var(--card-bg, rgba(255, 255, 255, 0.04));
  color: var(--text, #ccc);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  color: #3b82f6;
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: wait;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spin {
  display: inline-block;
  animation: spin 1s linear infinite;
}

/* Loading State */
.admin-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 80px 20px;
  color: var(--text-muted, #888);
  font-size: 0.95rem;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border, rgba(255, 255, 255, 0.1));
  border-top-color: var(--accent, #c77a2f);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Sections */
.admin-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-strong, #fff);
}

.section-icon {
  font-size: 1.15rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}

.status-dot.ok {
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
  animation: pulse-green 2s ease-in-out infinite;
}

.status-dot.critical {
  background: #ef4444;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
  animation: pulse-red 1s ease-in-out infinite;
}

@keyframes pulse-green {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes pulse-red {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

/* Two Column Layout */
.admin-columns {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 20px;
  margin-bottom: 24px;
}

.admin-columns .admin-section {
  margin-bottom: 0;
}

@media (max-width: 1024px) {
  .admin-columns {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .admin-dashboard {
    padding: 16px;
  }

  .admin-header {
    flex-direction: column;
  }

  .admin-title {
    font-size: 1.2rem;
  }
}
</style>

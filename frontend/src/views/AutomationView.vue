<template>
  <div class="automations-page">
    <!-- ═══════════════════ Header الرئيسي ═══════════════════ -->
    <div class="page-header card">
      <div class="header-title">
        <span class="header-icon">⚡</span>
        <div>
          <h2>مركز الأتمتة والتنبيهات الذكية</h2>
          <p>
            إدارة المهام المجدولة، تقارير الإغلاق اليومي، والتنبيهات الأمنية وتنبيهات المخزون
            التلقائية عبر تليجرام
          </p>
        </div>
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="isLoading"
          @click="fetchAutomations"
        >
          <AppIcon name="refresh" :size="16" />
          <span>تحديث الحالة</span>
        </button>

        <button type="button" class="btn btn-primary" @click="showTelegramModal = true">
          <AppIcon name="settings" :size="16" />
          <span>إعدادات بوت تليجرام 📲</span>
        </button>
      </div>
    </div>

    <!-- رسائل التنبيه والنجاح -->
    <transition name="fade">
      <div v-if="feedbackMessage" :class="`feedback-alert ${feedbackType}`">
        <span class="alert-icon">{{ feedbackType === 'success' ? '✅' : '⚠️' }}</span>
        <span>{{ feedbackMessage }}</span>
      </div>
    </transition>

    <!-- ═══════════════════ شريط الإحصائيات (Stats Bento) ═══════════════════ -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon bg-primary-soft">⚡</div>
        <div class="stat-info">
          <span class="stat-label">المهام المجدولة النشطة</span>
          <h3 class="stat-value">
            {{ activeCount }} <small>/ {{ automationsList.length }}</small>
          </h3>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-success-soft">🤖</div>
        <div class="stat-info">
          <span class="stat-label">حالة بوت تليجرام</span>
          <h3 class="stat-value text-success">
            <span class="status-dot online"></span>
            <span>{{ isTelegramConfigured ? 'مفعل ومتصل' : 'بحاجة للضبط' }}</span>
          </h3>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-accent-soft">📊</div>
        <div class="stat-info">
          <span class="stat-label">التقرير اليومي القادم</span>
          <h3 class="stat-value text-primary">11:30 م <small>تلقائياً</small></h3>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-warning-soft">📜</div>
        <div class="stat-info">
          <span class="stat-label">إجمالي العمليات المسجلة</span>
          <h3 class="stat-value">{{ logsList.length }} <small>سجل</small></h3>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ شبكة سيناريوهات الأتمتة (Scenarios Grid) ═══════════════════ -->
    <div class="section-card card">
      <div class="section-header">
        <div class="flex items-center gap-2">
          <AppIcon name="cpu" :size="20" />
          <h3 class="text-lg font-black text-strong">سيناريوهات الأتمتة والإنذارات المتاحة</h3>
        </div>
        <span class="text-xs text-muted font-bold"
          >يتم تشغيل السيناريوهات تلقائياً عند وقوع الحدث أو حسب الموعد المجدول</span
        >
      </div>

      <div v-if="isLoading" class="loading-state">
        <span class="spinner"></span>
        <span>جاري تحميل إعدادات الأتمتة...</span>
      </div>

      <div v-else class="automations-grid">
        <div
          v-for="item in automationsList"
          :key="item.id"
          class="automation-box"
          :class="{ 'is-disabled': !item.is_enabled }"
        >
          <div class="box-head">
            <div class="flex items-center gap-3">
              <div class="scenario-icon">
                {{ getScenarioEmoji(item.key) }}
              </div>
              <div>
                <h4 class="scenario-title">{{ item.name_ar }}</h4>
                <div class="flex items-center gap-2 mt-1">
                  <span :class="`category-pill ${item.category}`">
                    {{ getCategoryLabel(item.category) }}
                  </span>
                  <span class="trigger-type-tag">
                    {{ item.trigger_type === 'cron' ? '⏰ مجدول دورياً' : '⚡ حدث فوري لحظي' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- مفتاح التشغيل والإيقاف -->
            <div class="toggle-switch-wrap" @click.stop="toggleAutomation(item)">
              <div class="toggle-track" :class="{ 'is-on': item.is_enabled }">
                <div class="toggle-knob"></div>
              </div>
              <span class="toggle-status-text">{{ item.is_enabled ? 'مفعل' : 'معطل' }}</span>
            </div>
          </div>

          <p class="scenario-desc">{{ item.description_ar }}</p>

          <!-- شريط الإعدادات السريعة والمواعيد -->
          <div class="scenario-meta-row">
            <div v-if="item.trigger_type === 'cron'" class="cron-info-badge">
              <AppIcon name="clock" :size="14" />
              <span
                >الموعد المجدول: <b>{{ formatCronHuman(item.cron_expression) }}</b></span
              >
            </div>
            <div v-else class="cron-info-badge event">
              <AppIcon name="shield" :size="14" />
              <span>حماية فورية على مدار 24 ساعة</span>
            </div>

            <div class="channels-icons">
              <span
                class="channel-badge"
                :class="{ active: item.channels?.telegram }"
                title="إشعار عبر تليجرام"
              >
                📲 تليجرام
              </span>
              <span
                class="channel-badge"
                :class="{ active: item.channels?.in_app }"
                title="إشعار داخلي في النظام"
              >
                🔔 داخلي
              </span>
            </div>
          </div>

          <!-- أزرار الإجراءات السريعة والتشغيل التجريبي -->
          <div class="box-actions">
            <div class="last-run-time">
              <span v-if="item.last_run_at">
                آخر تشغيل: {{ formatRelativeTime(item.last_run_at) }}
                <span
                  :class="`status-tag ${item.last_status === 'success' ? 'success' : 'failed'}`"
                >
                  {{ item.last_status === 'success' ? 'نجح ✅' : 'فشل ❌' }}
                </span>
              </span>
              <span v-else class="text-muted text-xs">لم يتم التشغيل بعد</span>
            </div>

            <button
              type="button"
              class="btn btn-xs btn-primary-soft btn-trigger-test"
              :disabled="triggeringId === item.id"
              @click="triggerTestRun(item)"
            >
              <AppIcon name="play" :size="12" />
              <span>{{
                triggeringId === item.id ? 'جاري التشغيل...' : '⚡ تشغيل تجريبي الآن'
              }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ سجل عمليات الأتمتة (Live Logs) ═══════════════════ -->
    <div class="section-card card">
      <div class="section-header">
        <div class="flex items-center gap-2">
          <AppIcon name="invoices" :size="20" />
          <h3 class="text-lg font-black text-strong">
            سجل عمليات وتشغيل الأتمتة (Automation Logs)
          </h3>
        </div>
        <button type="button" class="btn btn-xs btn-outline" @click="fetchLogs">
          <AppIcon name="refresh" :size="12" /> تحديث السجل
        </button>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 160px">الوقت والتاريخ</th>
              <th style="width: 220px">الأتمتة والحدث</th>
              <th style="width: 100px">الحالة</th>
              <th>ملخص الرسالة والنتيجة</th>
              <th style="width: 90px; text-align: center">معاينة</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!logsList.length">
              <td colspan="5" class="text-center py-6 text-muted">
                لا توجد سجلات تشغيل بعد. جرب الضغط على "⚡ تشغيل تجريبي الآن" لأي أتمتة.
              </td>
            </tr>
            <tr v-for="log in logsList" :key="log.id">
              <td class="text-xs font-bold text-muted">
                {{ formatDateTime(log.created_at) }}
              </td>
              <td>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-extrabold text-strong">{{
                    log.automation_name || log.event_name
                  }}</span>
                </div>
              </td>
              <td>
                <span :class="`badge-status ${log.status}`">
                  {{ log.status === 'success' ? 'نجحت ✅' : 'فشلت ❌' }}
                </span>
              </td>
              <td>
                <div class="log-title-text">{{ log.title }}</div>
              </td>
              <td style="text-align: center">
                <button
                  type="button"
                  class="btn btn-xs btn-outline"
                  title="عرض الرسالة كاملة"
                  @click="openMessageModal(log)"
                >
                  👁️ عرض
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ═══════════════════ مودال إعدادات بوت تليجرام ═══════════════════ -->
    <div v-if="showTelegramModal" class="modal-overlay" @click.self="showTelegramModal = false">
      <div class="modal-box tg-modal">
        <div class="modal-header">
          <div class="flex items-center gap-2">
            <span class="text-xl">📲</span>
            <h3 class="font-black text-lg">إعدادات وقناة بوت تليجرام</h3>
          </div>
          <button type="button" class="btn-close" @click="showTelegramModal = false">✕</button>
        </div>

        <div class="modal-body">
          <div class="alert-box-info mb-4">
            <p class="text-xs">
              💡 يمكنك إنشاء بوت تليجرام مجاني خاص بـ <b>"بن العجوز"</b> في دقيقة واحدة عبر مراسلة
              <b>@BotFather</b> على تليجرام، ثم الحصول على الـ <b>Bot Token</b> والـ <b>Chat ID</b>
              الخاص بك أو بمجموعة الإدارة.
            </p>
          </div>

          <div class="form-group mb-3">
            <label class="form-label font-bold">Bot Token (رمز توكن البوت):</label>
            <input
              v-model="telegramForm.botToken"
              type="text"
              placeholder="مثال: 123456789:ABCdefGHIjklMNO..."
              class="form-input font-mono text-xs"
            />
          </div>

          <div class="form-group mb-4">
            <label class="form-label font-bold">Chat ID (معرف الشات أو المجموعة):</label>
            <input
              v-model="telegramForm.chatId"
              type="text"
              placeholder="مثال: 987654321 أو -1001234567890..."
              class="form-input font-mono text-xs"
            />
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              class="btn btn-outline flex-1"
              :disabled="isTestingTelegram"
              @click="handleTestTelegram"
            >
              <span>{{
                isTestingTelegram ? 'جاري الإرسال...' : '🚀 إرسال رسالة تجريبية الآن'
              }}</span>
            </button>
            <button type="button" class="btn btn-primary flex-1" @click="saveTelegramConfig">
              <span>💾 حفظ الإعدادات</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ مودال معاينة نص الرسالة ═══════════════════ -->
    <div v-if="selectedLog" class="modal-overlay" @click.self="selectedLog = null">
      <div class="modal-box message-modal">
        <div class="modal-header">
          <div class="flex items-center gap-2">
            <span class="text-xl">📩</span>
            <h3 class="font-black text-base">{{ selectedLog.title }}</h3>
          </div>
          <button type="button" class="btn-close" @click="selectedLog = null">✕</button>
        </div>

        <div class="modal-body">
          <div class="rendered-message-box custom-scrollbar" v-html="selectedLog.message"></div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="selectedLog = null">إغلاق</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { automations as automationsApi } from '@/api';
import AppIcon from '@/components/AppIcon.vue';

const automationsList = ref<any[]>([]);
const logsList = ref<any[]>([]);
const isLoading = ref(false);
const triggeringId = ref<number | null>(null);

const feedbackMessage = ref('');
const feedbackType = ref<'success' | 'error'>('success');

const showTelegramModal = ref(false);
const isTestingTelegram = ref(false);
const selectedLog = ref<any | null>(null);

const telegramForm = ref({
  botToken: '',
  chatId: '',
});

const isTelegramConfigured = computed(() => {
  return (
    Boolean(telegramForm.value.botToken && telegramForm.value.chatId) ||
    automationsList.value.some((a) => a.config?.bot_token && a.config?.chat_id)
  );
});

const activeCount = computed(() => {
  return automationsList.value.filter((a) => a.is_enabled).length;
});

onMounted(async () => {
  await fetchAutomations();
  await fetchLogs();
});

const showFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
  feedbackMessage.value = msg;
  feedbackType.value = type;
  setTimeout(() => {
    feedbackMessage.value = '';
  }, 4000);
};

const fetchAutomations = async () => {
  try {
    isLoading.value = true;
    const res = await automationsApi.list();
    if (res.data?.data?.automations) {
      automationsList.value = res.data.data.automations;
      // استخراج إعدادات تليجرام إن وجدت
      const firstWithTg = automationsList.value.find((a) => a.config?.bot_token);
      if (firstWithTg) {
        telegramForm.value.botToken = firstWithTg.config.bot_token;
        telegramForm.value.chatId = firstWithTg.config.chat_id;
      }
    }
  } catch (err: any) {
    showFeedback(err?.response?.data?.message || 'تعذر تحميل إعدادات الأتمتة', 'error');
  } finally {
    isLoading.value = false;
  }
};

const fetchLogs = async () => {
  try {
    const res = await automationsApi.getLogs({ limit: 30 });
    if (res.data?.data?.logs) {
      logsList.value = res.data.data.logs;
    }
  } catch {
    // Silent
  }
};

const toggleAutomation = async (item: any) => {
  const nextState = !item.is_enabled;
  item.is_enabled = nextState;
  try {
    await automationsApi.update(item.id, { is_enabled: nextState });
    showFeedback(`تم ${nextState ? 'تفعيل' : 'إيقاف'} أتمتة "${item.name_ar}" بنجاح!`, 'success');
  } catch {
    item.is_enabled = !nextState; // Revert
    showFeedback('تعذر تحديث حالة الأتمتة', 'error');
  }
};

const triggerTestRun = async (item: any) => {
  try {
    triggeringId.value = item.id;
    showFeedback(`جاري تشغيل "${item.name_ar}" تجريبياً...`);
    const res = await automationsApi.trigger(item.id);
    if (res.data?.success) {
      showFeedback(`تم تشغيل "${item.name_ar}" بنجاح! 🎉`, 'success');
      item.last_run_at = new Date().toISOString();
      item.last_status = 'success';
      await fetchLogs();
    } else {
      showFeedback(res.data?.message || 'فشل تشغيل الأتمتة', 'error');
    }
  } catch (err: any) {
    showFeedback(err?.response?.data?.message || 'حدث خطأ أثناء التشغيل', 'error');
  } finally {
    triggeringId.value = null;
  }
};

const handleTestTelegram = async () => {
  try {
    isTestingTelegram.value = true;
    const res = await automationsApi.testTelegram({
      botToken: telegramForm.value.botToken,
      chatId: telegramForm.value.chatId,
    });
    if (res.data?.success) {
      showFeedback('تم إرسال رسالة الاختبار بنجاح إلى شات تليجرام! 📲', 'success');
    } else {
      showFeedback(res.data?.message || 'فشل إرسال رسالة الاختبار', 'error');
    }
  } catch (err: any) {
    showFeedback(err?.response?.data?.message || 'فشل الاتصال ببوت تليجرام', 'error');
  } finally {
    isTestingTelegram.value = false;
  }
};

const saveTelegramConfig = async () => {
  try {
    for (const auto of automationsList.value) {
      const cfg = { ...(auto.config || {}) };
      cfg.bot_token = telegramForm.value.botToken;
      cfg.chat_id = telegramForm.value.chatId;
      await automationsApi.update(auto.id, { config: cfg });
    }
    showFeedback('تم حفظ إعدادات بوت تليجرام لجميع الأتمتة بنجاح! 🎉');
    showTelegramModal.value = false;
  } catch {
    showFeedback('حدث خطأ أثناء حفظ الإعدادات', 'error');
  }
};

const openMessageModal = (log: any) => {
  selectedLog.value = log;
};

const getScenarioEmoji = (key: string) => {
  const map: Record<string, string> = {
    daily_sales_report: '📊',
    low_stock_alert: '🚨',
    void_invoice_alert: '🛡️',
    large_discount_alert: '💸',
    daily_backup_reminder: '💾',
  };
  return map[key] || '⚡';
};

const getCategoryLabel = (cat: string) => {
  const map: Record<string, string> = {
    sales: 'مبيعات وأرباح',
    inventory: 'مخزون وخامات',
    security: 'أمان ورقابة',
    system: 'صيانة وسيرفر',
  };
  return map[cat] || 'عام';
};

const formatCronHuman = (cronExpr?: string) => {
  if (!cronExpr) return 'غير محدد';
  if (cronExpr.includes('23 * * *') || cronExpr.includes('30 23')) return 'يومياً الساعة 11:30 م';
  if (cronExpr.includes('10,18')) return 'مرتين يومياً (10 ص و 6 م)';
  if (cronExpr.includes('0 3 * * *')) return 'يومياً الساعة 3:00 فجراً';
  return cronExpr;
};

const formatDateTime = (dtStr?: string) => {
  if (!dtStr) return '-';
  const d = new Date(dtStr);
  return d.toLocaleString('ar-EG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRelativeTime = (dtStr?: string) => {
  if (!dtStr) return '';
  const diffSec = Math.floor((Date.now() - new Date(dtStr).getTime()) / 1000);
  if (diffSec < 60) return 'الآن';
  if (diffSec < 3600) return `منذ ${Math.floor(diffSec / 60)} دقيقة`;
  if (diffSec < 86400) return `منذ ${Math.floor(diffSec / 3600)} ساعة`;
  return `منذ ${Math.floor(diffSec / 86400)} يوم`;
};
</script>

<style scoped>
.automations-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: calc(100vh - var(--navbar-height) - 40px);
}

/* الترويسة */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.header-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.header-icon {
  font-size: 2rem;
  line-height: 1;
}

.header-title h2 {
  font-size: 1.35rem;
  font-weight: 900;
  color: var(--text-strong);
  margin: 0;
}

.header-title p {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 2px 0 0 0;
}

.header-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

/* شريط الإحصائيات */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  box-shadow: none;
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
}

.bg-primary-soft {
  background: #fef3c7;
  color: #92400e;
}

.bg-success-soft {
  background: #dcfce7;
  color: #166534;
}

.bg-accent-soft {
  background: #e0e7ff;
  color: #3730a3;
}

.bg-warning-soft {
  background: #fef9c3;
  color: #854d0e;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 900;
  color: var(--text-strong);
  margin: 2px 0 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-value small {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot.online {
  background: var(--success);
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
}

/* الكروت والأقسام */
.section-card {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  box-shadow: none !important;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--space-3);
}

/* شبكة الأتمتة */
.automations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: var(--space-3);
}

.automation-box {
  background: var(--surface-1);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-3);
  transition: all 0.2s ease;
  box-shadow: none;
}

.automation-box:hover {
  border-color: var(--primary);
  background: var(--surface-2);
}

.automation-box.is-disabled {
  opacity: 0.65;
  background: var(--surface-2);
}

.box-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-2);
}

.scenario-icon {
  font-size: 1.8rem;
  line-height: 1;
}

.scenario-title {
  font-size: 0.98rem;
  font-weight: 900;
  color: var(--text-strong);
  margin: 0;
}

.category-pill {
  font-size: 0.7rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--radius-xs);
}

.category-pill.sales {
  background: #dcfce7;
  color: #166534;
}

.category-pill.inventory {
  background: #fef3c7;
  color: #92400e;
}

.category-pill.security {
  background: #fee2e2;
  color: #991b1b;
}

.category-pill.system {
  background: #e0e7ff;
  color: #3730a3;
}

.trigger-type-tag {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
}

/* مفتاح التبديل */
.toggle-switch-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.toggle-track {
  width: 40px;
  height: 22px;
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  position: relative;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.toggle-track.is-on {
  background: var(--primary);
  border-color: var(--primary);
}

.toggle-knob {
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  right: 3px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-track.is-on .toggle-knob {
  transform: translateX(-18px);
}

.toggle-status-text {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--text-muted);
}

.scenario-desc {
  font-size: 0.82rem;
  color: var(--text-muted);
  line-height: 1.45;
  margin: 0;
}

.scenario-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  padding: 6px 10px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border);
}

.cron-info-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-strong);
}

.channels-icons {
  display: flex;
  gap: 4px;
}

.channel-badge {
  font-size: 0.68rem;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-3);
  color: var(--text-muted);
}

.channel-badge.active {
  background: #dcfce7;
  color: #166534;
}

.box-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--border);
  padding-top: var(--space-2);
}

.last-run-time {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-muted);
}

.status-tag {
  font-size: 0.68rem;
  font-weight: 800;
  padding: 1px 4px;
  border-radius: var(--radius-xs);
}

.status-tag.success {
  color: var(--success);
}

.status-tag.failed {
  color: var(--danger);
}

.btn-trigger-test {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: var(--radius-xs);
}

/* جدول السجلات */
.table-responsive {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.data-table th,
.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: right;
}

.data-table th {
  background: var(--surface-2);
  font-weight: 800;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.badge-status {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--radius-xs);
}

.badge-status.success {
  background: #dcfce7;
  color: #166534;
}

.badge-status.failed {
  background: #fee2e2;
  color: #991b1b;
}

.log-title-text {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-strong);
}

/* المودالات */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-box {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-strong);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.tg-modal {
  width: 520px;
  max-width: 95vw;
}

.message-modal {
  width: 600px;
  max-width: 95vw;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.modal-body {
  padding: var(--space-4);
}

.alert-box-info {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
}

.rendered-message-box {
  background: #1e1b18;
  color: #f5f5f5;
  padding: 16px;
  border-radius: var(--radius-sm);
  font-family: var(--font-ui), sans-serif;
  font-size: 0.9rem;
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 380px;
  overflow-y: auto;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}

.feedback-alert {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  font-weight: 700;
}

.feedback-alert.success {
  background: #dcfce7;
  color: var(--success);
  border: 1px solid #bbf7d0;
}

.feedback-alert.error {
  background: #fee2e2;
  color: var(--danger);
  border: 1px solid #fecaca;
}
</style>

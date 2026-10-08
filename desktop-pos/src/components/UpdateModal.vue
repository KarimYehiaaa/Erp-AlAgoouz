<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
    <div class="card modal-content update-modal" dir="rtl">
      <!-- Modal Header -->
      <div class="modal-header-row">
        <div class="header-title">
          <div class="icon-bubble" :class="statusBubbleClass">
            <AppIcon
              :name="statusIconName"
              :size="22"
              :class="{ 'spin-anim': isChecking || isDownloading }"
            />
          </div>
          <div>
            <h3>تحديثات برنامج الكاشير</h3>
            <p class="header-sub">التحديث التلقائي الفوري دون الحاجة لإعادة التثبيت اليدوي</p>
          </div>
        </div>
        <button
          type="button"
          class="close-modal-btn"
          @click="emit('close')"
          title="إغلاق النافذة (Esc)"
        >
          <AppIcon name="close" :size="16" />
        </button>
      </div>

      <!-- Version & Status Overview Card -->
      <div class="update-card-status">
        <div class="version-row">
          <div class="version-col">
            <span class="v-label">الإصدار المثبت حالياً</span>
            <span class="v-value current-v">v{{ appVersion }}</span>
          </div>

          <div class="version-divider">
            <AppIcon name="arrowLeft" :size="16" />
          </div>

          <div class="version-col">
            <span class="v-label">أحدث إصدار متاح</span>
            <span class="v-value target-v" :class="{ highlight: hasTargetVersion }">
              {{ hasTargetVersion ? `v${updateState.version}` : '—' }}
            </span>
          </div>
        </div>

        <!-- Live Status Pill -->
        <div class="status-indicator-box" :class="statusBoxClass">
          <div class="status-msg-row">
            <span class="status-dot"></span>
            <strong class="status-title">{{ statusTitle }}</strong>
          </div>
          <p class="status-desc">{{ statusDescription }}</p>

          <!-- Download Progress Bar (Shows when downloading) -->
          <div v-if="isDownloading" class="progress-container">
            <div class="progress-bar-track">
              <div class="progress-bar-fill" :style="{ width: `${downloadPercent}%` }"></div>
            </div>
            <div class="progress-text-row">
              <span>جاري التحميل في الخلفية...</span>
              <strong>{{ downloadPercent }}%</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="modal-actions-row">
        <!-- Ready to install (Downloaded) -->
        <template v-if="isDownloaded">
          <button type="button" class="btn-action btn-install" @click="handleInstallNow">
            <AppIcon name="download" :size="18" />
            <span>تحديث وتثبيت الآن (إعادة التشغيل الفورية)</span>
          </button>
          <button type="button" class="btn-action btn-dismiss" @click="emit('close')">
            التثبيت لاحقاً عند إغلاق البرنامج
          </button>
        </template>

        <!-- Downloading -->
        <template v-else-if="isDownloading">
          <button type="button" class="btn-action btn-disabled" disabled>
            <AppIcon name="refreshCw" :size="16" class="spin-anim" />
            <span>جاري التنزيل ({{ downloadPercent }}%)...</span>
          </button>
          <button type="button" class="btn-action btn-secondary" @click="emit('close')">
            متابعة العمل في الخلفية
          </button>
        </template>

        <!-- Checking -->
        <template v-else-if="isChecking">
          <button type="button" class="btn-action btn-disabled" disabled>
            <AppIcon name="refreshCw" :size="16" class="spin-anim" />
            <span>جاري فحص الخادم بحثاً عن تحديثات...</span>
          </button>
          <button type="button" class="btn-action btn-secondary" @click="emit('close')">
            إلغاء
          </button>
        </template>

        <!-- Idle / Current / Error -->
        <template v-else>
          <button type="button" class="btn-action btn-check" @click="handleCheckUpdates">
            <AppIcon name="refreshCw" :size="16" />
            <span>فحص التحديثات الآن</span>
          </button>
          <button type="button" class="btn-action btn-secondary" @click="emit('close')">
            إغلاق
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue';
import AppIcon from './AppIcon.vue';
import { useAppUpdater } from '../composables/useAppUpdater';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const {
  updateState,
  appVersion,
  isAvailable,
  isDownloading,
  isDownloaded,
  isChecking,
  isCurrent,
  isError,
  downloadPercent,
  checkForUpdates,
  installUpdate,
} = useAppUpdater();

const hasTargetVersion = computed(() => {
  return !!updateState.value.version;
});

const statusIconName = computed(() => {
  if (isDownloaded.value) return 'check';
  if (isDownloading.value) return 'download';
  if (isChecking.value) return 'refreshCw';
  if (isError.value) return 'alertTriangle';
  if (isCurrent.value) return 'check';
  return 'refreshCw';
});

const statusBubbleClass = computed(() => {
  if (isDownloaded.value) return 'bubble-ready';
  if (isDownloading.value) return 'bubble-downloading';
  if (isChecking.value) return 'bubble-checking';
  if (isError.value) return 'bubble-error';
  if (isCurrent.value) return 'bubble-current';
  return 'bubble-idle';
});

const statusBoxClass = computed(() => {
  if (isDownloaded.value) return 'box-ready';
  if (isDownloading.value) return 'box-downloading';
  if (isChecking.value) return 'box-checking';
  if (isError.value) return 'box-error';
  if (isCurrent.value) return 'box-current';
  return 'box-idle';
});

const statusTitle = computed(() => {
  if (isDownloaded.value) return 'التحديث جاهز للتطبيق الفوري';
  if (isDownloading.value) return 'يتم تنزيل الإصدار الجديد الآن';
  if (isAvailable.value) return 'يوجد تحديث جديد متاح';
  if (isChecking.value) return 'جاري التحقق من التحديثات...';
  if (isError.value) return 'تعذر فحص التحديثات';
  if (isCurrent.value) return 'أنت تعمل بأحدث إصدار رسمي';
  return 'التحقق من التحديثات التلقائية';
});

const statusDescription = computed(() => {
  if (isDownloaded.value) {
    return `تم تنزيل حزمة التحديث للإصدار v${updateState.value.version} بنجاح. عند الضغط على الزر سيتم إغلاق البرنامج وتطبيق التحديث وإعادة فتحه في ثوانٍ معدودة.`;
  }
  if (isDownloading.value) {
    return 'يجري تحميل ملفات التحديث في الخلفية دون تعطيل عمل نقطة البيع. يمكنك متابعة إصدار الفواتير بشكل طبيعي.';
  }
  if (isAvailable.value) {
    return `تم رصد الإصدار v${updateState.value.version}. يبدأ التنزيل تلقائياً في الخلفية.`;
  }
  if (isChecking.value) {
    return 'جاري الاتصال بسجل إصدارات بن العجوز ERP لمقارنة رقم الإصدار الحالي...';
  }
  if (isError.value) {
    return (
      updateState.value.message ||
      'حدث خطأ أثناء محاولة الاتصال بخادم التحديثات. تأكد من اتصال الإنترنت ثم أعد المحاولة.'
    );
  }
  if (isCurrent.value) {
    return (
      updateState.value.message ||
      'جهاز نقطة البيع محدث بالكامل ولا يتطلب أي تثبيت إضافي في الوقت الحالي.'
    );
  }
  return 'يمكنك فحص الخادم يدوياً للتأكد من وجود ميزات أو تحسينات جديدة للبرنامج.';
});

const handleCheckUpdates = async () => {
  await checkForUpdates();
};

const handleInstallNow = async () => {
  await installUpdate();
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (props.isOpen && e.key === 'Escape') {
    emit('close');
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<style lang="scss" scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(6px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.update-modal {
  width: 100%;
  max-width: 520px;
  background: #1c130c;
  border: 1px solid #78350f;
  border-radius: 18px;
  padding: 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85);
  color: #fffaf2;
  position: relative;
}

.modal-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;

  h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: #fef3c7;
  }

  .header-sub {
    margin: 2px 0 0 0;
    font-size: 0.78rem;
    color: #a8a29e;
  }
}

.icon-bubble {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.3s ease;

  &.bubble-ready {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  &.bubble-downloading {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  &.bubble-checking {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  &.bubble-error {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  &.bubble-current,
  &.bubble-idle {
    background: rgba(217, 119, 6, 0.12);
    color: #f59e0b;
    border: 1px solid rgba(217, 119, 6, 0.25);
  }
}

.close-modal-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #a8a29e;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
  }
}

.update-card-status {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 20px;
}

.version-row {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  margin-bottom: 14px;
}

.version-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;

  .v-label {
    font-size: 0.74rem;
    color: #a8a29e;
  }

  .v-value {
    font-family: monospace;
    font-size: 1rem;
    font-weight: 700;
    color: #e5e7eb;

    &.highlight {
      color: #34d399;
    }
  }
}

.version-divider {
  color: #78716c;
}

.status-indicator-box {
  border-radius: 10px;
  padding: 12px 14px;
  transition: all 0.3s ease;

  .status-msg-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-title {
      font-size: 0.9rem;
      font-weight: 600;
    }
  }

  .status-desc {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  &.box-ready {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #d1fae5;

    .status-dot {
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }

    .status-title {
      color: #34d399;
    }
  }

  &.box-downloading {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #fef3c7;

    .status-dot {
      background: #f59e0b;
      box-shadow: 0 0 8px #f59e0b;
    }

    .status-title {
      color: #fbbf24;
    }
  }

  &.box-checking {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: #dbeafe;

    .status-dot {
      background: #3b82f6;
      box-shadow: 0 0 8px #3b82f6;
    }

    .status-title {
      color: #60a5fa;
    }
  }

  &.box-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fee2e2;

    .status-dot {
      background: #ef4444;
      box-shadow: 0 0 8px #ef4444;
    }

    .status-title {
      color: #f87171;
    }
  }

  &.box-current,
  &.box-idle {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #e5e7eb;

    .status-dot {
      background: #10b981;
    }

    .status-title {
      color: #f3f4f6;
    }
  }
}

.progress-container {
  margin-top: 12px;

  .progress-bar-track {
    width: 100%;
    height: 8px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid rgba(245, 158, 11, 0.2);
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #f59e0b, #10b981);
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .progress-text-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.74rem;
    color: #a8a29e;
    margin-top: 4px;
  }
}

.modal-actions-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-action {
  width: 100%;
  padding: 12px 18px;
  border-radius: 10px;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
  border: none;

  &.btn-install {
    background: linear-gradient(135deg, #10b981, #059669);
    color: #ffffff;
    box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);

    &:hover {
      background: linear-gradient(135deg, #059669, #047857);
      box-shadow: 0 6px 20px rgba(16, 185, 129, 0.5);
    }
  }

  &.btn-check {
    background: linear-gradient(135deg, #d97706, #b45309);
    color: #ffffff;

    &:hover {
      background: linear-gradient(135deg, #b45309, #92400e);
    }
  }

  &.btn-secondary {
    background: rgba(255, 255, 255, 0.06);
    color: #d6d3d1;
    border: 1px solid rgba(255, 255, 255, 0.12);

    &:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
  }

  &.btn-dismiss {
    background: transparent;
    color: #a8a29e;
    font-size: 0.8rem;
    font-weight: normal;

    &:hover {
      color: #e5e7eb;
    }
  }

  &.btn-disabled {
    background: rgba(255, 255, 255, 0.05);
    color: #78716c;
    border: 1px solid rgba(255, 255, 255, 0.08);
    cursor: not-allowed;
  }
}

.spin-anim {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>

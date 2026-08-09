<template>
  <div v-if="hasError" class="error-boundary card">
    <div class="error-boundary-content">
      <div class="error-icon">⚠️</div>
      <h3>حدث خطأ غير متوقع في هذه الشاشة</h3>
      <p class="error-msg">
        {{ errorMessage || 'عفواً، واجه التطبيق خطأ غير متوقع أثناء معالجة البيانات.' }}
      </p>
      <div class="error-actions">
        <button type="button" class="btn btn-primary" @click="resetError">
          🔄 إعادة محاولة الشاشة
        </button>
        <button type="button" class="btn btn-outline" @click="reloadPage">
          🌐 تحديث الصفحة بالكامل
        </button>
      </div>
    </div>
  </div>
  <slot v-else />
</template>

<script setup>
import { ref, onErrorCaptured } from 'vue';

const hasError = ref(false);
const errorMessage = ref('');

onErrorCaptured((err, _instance, info) => {
  console.error('[ErrorBoundary caught error]:', err, info);
  hasError.value = true;
  errorMessage.value = err?.message || 'حدث خطأ في عرض الشاشة';
  // Prevent error from propagating further up
  return false;
});

const resetError = () => {
  hasError.value = false;
  errorMessage.value = '';
};

const reloadPage = () => {
  window.location.reload();
};
</script>

<style lang="scss" scoped>
.error-boundary {
  padding: 40px 20px;
  text-align: center;
  margin: 20px auto;
  max-width: 560px;
  background: var(--bg-elevated, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
}

.error-boundary-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.error-icon {
  font-size: 3rem;
}

h3 {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text, #1e293b);
  margin: 0;
}

.error-msg {
  font-size: 0.9rem;
  color: var(--text-muted, #64748b);
  margin: 0;
  max-width: 400px;
  line-height: 1.5;
}

.error-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
</style>

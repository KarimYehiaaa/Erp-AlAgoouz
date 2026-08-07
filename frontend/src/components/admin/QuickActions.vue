<template>
  <div class="quick-actions">
    <h3 class="qa-title">⚡ إجراءات سريعة</h3>
    <div class="qa-grid">
      <button
        v-for="action in actions"
        :key="action.key"
        class="qa-btn"
        :class="action.colorClass"
        @click="handleAction(action)"
        :disabled="loading === action.key"
      >
        <span class="qa-icon">{{ action.icon }}</span>
        <span class="qa-label">{{ loading === action.key ? 'جاري...' : action.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const emit = defineEmits(['backup', 'clearCache', 'exportReport']);
const router = useRouter();
const loading = ref(null);

const actions = [
  { key: 'backup', icon: '💾', label: 'نسخة احتياطية', colorClass: 'action-blue' },
  { key: 'clearCache', icon: '🔄', label: 'تنظيف الكاش', colorClass: 'action-purple' },
  { key: 'exportPL', icon: '📊', label: 'تقرير الأرباح', colorClass: 'action-green' },
  { key: 'addUser', icon: '👤', label: 'إضافة مستخدم', colorClass: 'action-teal' },
  { key: 'settings', icon: '⚙️', label: 'الإعدادات', colorClass: 'action-orange' },
  { key: 'operations', icon: '🔧', label: 'مركز التشغيل', colorClass: 'action-indigo' },
];

const handleAction = async (action) => {
  if (loading.value) return;

  switch (action.key) {
    case 'backup':
      loading.value = 'backup';
      emit('backup');
      setTimeout(() => { loading.value = null; }, 3000);
      break;
    case 'clearCache':
      loading.value = 'clearCache';
      emit('clearCache');
      setTimeout(() => { loading.value = null; }, 1500);
      break;
    case 'exportPL':
      router.push('/reports');
      break;
    case 'addUser':
      router.push('/users');
      break;
    case 'settings':
      router.push('/settings');
      break;
    case 'operations':
      router.push('/operations');
      break;
  }
};
</script>

<style scoped>
.quick-actions {
  border-radius: 16px;
  background: var(--card-bg, rgba(255,255,255,0.04));
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  padding: 18px 20px;
}

.qa-title {
  margin: 0 0 14px;
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-strong, #fff);
}

.qa-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.qa-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 10px;
  border-radius: 14px;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  background: transparent;
  cursor: pointer;
  transition: all 0.25s ease;
}

.qa-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.15);
}

.qa-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.qa-icon {
  font-size: 1.5rem;
}

.qa-label {
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--text, #ccc);
}

.action-blue:hover { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.3); }
.action-purple:hover { background: rgba(139,92,246,0.1); border-color: rgba(139,92,246,0.3); }
.action-green:hover { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); }
.action-teal:hover { background: rgba(20,184,166,0.1); border-color: rgba(20,184,166,0.3); }
.action-orange:hover { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.3); }
.action-indigo:hover { background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.3); }

@media (max-width: 640px) {
  .qa-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>

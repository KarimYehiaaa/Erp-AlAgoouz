<template>
  <div class="activity-feed">
    <div class="feed-header">
      <h3 class="feed-title">📡 النشاط الحي</h3>
      <div class="feed-actions">
        <select v-model="filterModule" class="feed-filter">
          <option value="">الكل</option>
          <option value="auth">تسجيل دخول</option>
          <option value="sales">مبيعات</option>
          <option value="inventory">مخزون</option>
          <option value="products">منتجات</option>
          <option value="purchases">مشتريات</option>
          <option value="expenses">مصروفات</option>
          <option value="hr">موارد بشرية</option>
          <option value="backup">نسخ احتياطي</option>
        </select>
        <button class="feed-refresh" @click="$emit('refresh')" title="تحديث">
          🔄
        </button>
      </div>
    </div>

    <div v-if="!filteredItems.length" class="feed-empty">
      <span>لا يوجد نشاط حالياً</span>
    </div>

    <TransitionGroup v-else name="feed" tag="div" class="feed-list">
      <div
        v-for="item in filteredItems"
        :key="item.id"
        class="feed-item"
        :class="moduleClass(item.module)"
      >
        <div class="feed-dot" :class="moduleClass(item.module)"></div>
        <div class="feed-content">
          <div class="feed-top">
            <span class="feed-user">{{ item.full_name || item.username || 'النظام' }}</span>
            <span class="feed-module-badge" :class="moduleClass(item.module)">{{ moduleLabel(item.module) }}</span>
          </div>
          <div class="feed-action">{{ item.action_ar }}</div>
          <div class="feed-meta">
            <span class="feed-time">{{ formatTime(item.created_at) }}</span>
            <span v-if="item.ip_address" class="feed-ip">{{ item.ip_address }}</span>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  items: { type: Array, default: () => [] },
});

defineEmits(['refresh']);

const filterModule = ref('');

const filteredItems = computed(() => {
  if (!filterModule.value) return props.items;
  return props.items.filter((i) => i.module === filterModule.value);
});

const moduleLabels = {
  auth: 'تسجيل دخول',
  sales: 'مبيعات',
  inventory: 'مخزون',
  products: 'منتجات',
  purchases: 'مشتريات',
  expenses: 'مصروفات',
  hr: 'موارد بشرية',
  backup: 'نسخ احتياطي',
  users: 'مستخدمين',
  admin: 'إدارة',
  invoices: 'فواتير',
  customers: 'عملاء',
  suppliers: 'موردين',
  settings: 'إعدادات',
};

const moduleLabel = (mod) => moduleLabels[mod] || mod || '—';

const moduleClass = (mod) => {
  const map = {
    auth: 'mod-auth',
    sales: 'mod-sales',
    inventory: 'mod-inventory',
    products: 'mod-products',
    purchases: 'mod-purchases',
    expenses: 'mod-expenses',
    hr: 'mod-hr',
    backup: 'mod-backup',
    users: 'mod-users',
    admin: 'mod-admin',
  };
  return map[mod] || 'mod-default';
};

const formatTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  return d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
</script>

<style scoped>
.activity-feed {
  border-radius: 16px;
  background: var(--card-bg, rgba(255,255,255,0.04));
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  overflow: hidden;
}

.feed-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
}

.feed-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-strong, #fff);
}

.feed-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.feed-filter {
  background: var(--input-bg, rgba(255,255,255,0.06));
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  color: var(--text, #ccc);
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.feed-refresh {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: background 0.2s;
}

.feed-refresh:hover {
  background: var(--border, rgba(255,255,255,0.08));
}

.feed-empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted, #888);
  font-size: 0.9rem;
}

.feed-list {
  max-height: 460px;
  overflow-y: auto;
}

.feed-item {
  display: flex;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.04));
  transition: background 0.2s ease;
}

.feed-item:hover {
  background: rgba(255,255,255,0.02);
}

.feed-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}

.feed-dot.mod-auth { background: #3b82f6; }
.feed-dot.mod-sales { background: #10b981; }
.feed-dot.mod-inventory { background: #8b5cf6; }
.feed-dot.mod-products { background: #f59e0b; }
.feed-dot.mod-purchases { background: #06b6d4; }
.feed-dot.mod-expenses { background: #ef4444; }
.feed-dot.mod-hr { background: #ec4899; }
.feed-dot.mod-backup { background: #6366f1; }
.feed-dot.mod-users { background: #14b8a6; }
.feed-dot.mod-admin { background: #f97316; }
.feed-dot.mod-default { background: #6b7280; }

.feed-content {
  flex: 1;
  min-width: 0;
}

.feed-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 3px;
}

.feed-user {
  font-weight: 800;
  font-size: 0.84rem;
  color: var(--text-strong, #fff);
}

.feed-module-badge {
  font-size: 0.66rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
}

.feed-module-badge.mod-auth { background: rgba(59,130,246,0.12); color: #3b82f6; }
.feed-module-badge.mod-sales { background: rgba(16,185,129,0.12); color: #10b981; }
.feed-module-badge.mod-inventory { background: rgba(139,92,246,0.12); color: #8b5cf6; }
.feed-module-badge.mod-products { background: rgba(245,158,11,0.12); color: #f59e0b; }
.feed-module-badge.mod-purchases { background: rgba(6,182,212,0.12); color: #06b6d4; }
.feed-module-badge.mod-expenses { background: rgba(239,68,68,0.12); color: #ef4444; }
.feed-module-badge.mod-hr { background: rgba(236,72,153,0.12); color: #ec4899; }
.feed-module-badge.mod-backup { background: rgba(99,102,241,0.12); color: #6366f1; }
.feed-module-badge.mod-users { background: rgba(20,184,166,0.12); color: #14b8a6; }
.feed-module-badge.mod-admin { background: rgba(249,115,22,0.12); color: #f97316; }
.feed-module-badge.mod-default { background: rgba(107,114,128,0.12); color: #6b7280; }

.feed-action {
  font-size: 0.82rem;
  color: var(--text, #ccc);
  line-height: 1.4;
}

.feed-meta {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.feed-time, .feed-ip {
  font-size: 0.7rem;
  color: var(--text-muted, #666);
  font-weight: 500;
}

.feed-ip {
  font-family: monospace;
}

/* Transition animations */
.feed-enter-active {
  transition: all 0.3s ease;
}

.feed-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
</style>

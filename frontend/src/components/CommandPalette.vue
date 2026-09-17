<template>
  <div v-if="isOpen" class="command-palette-overlay" @click.self="close">
    <div
      class="command-palette-box card"
      role="dialog"
      aria-modal="true"
      aria-label="لوحة الأوامر الموحدة"
    >
      <!-- Search Input Section -->
      <div class="search-section">
        <span class="search-icon"><AppIcon name="search" :size="18" /></span>
        <input
          ref="searchInput"
          v-model="query"
          type="text"
          placeholder="ابحث عن صفحة، أنشئ سجلاً، أو نفّذ أمراً... (Esc للإغلاق)"
          class="palette-input"
          @keydown.down.prevent="moveDown"
          @keydown.up.prevent="moveUp"
          @keydown.enter.prevent="selectItem"
          @keydown.esc="close"
        />
        <span v-if="query" class="clear-btn" @click="query = ''">✕</span>
      </div>

      <!-- Category Filter Pills -->
      <div class="category-pills">
        <button
          type="button"
          class="pill-btn"
          :class="{ active: selectedCategory === 'all' }"
          @click="selectedCategory = 'all'"
        >
          الكل ({{ filteredItems.length }})
        </button>
        <button
          type="button"
          class="pill-btn"
          :class="{ active: selectedCategory === 'nav' }"
          @click="selectedCategory = 'nav'"
        >
          التنقل
        </button>
        <button
          type="button"
          class="pill-btn"
          :class="{ active: selectedCategory === 'action' }"
          @click="selectedCategory = 'action'"
        >
          إجراءات وإنشاء
        </button>
      </div>

      <!-- Results List with Semantic Grouping -->
      <div v-if="filteredItems.length" class="results-list" role="listbox">
        <div
          v-for="(item, idx) in filteredItems"
          :key="item.id"
          class="result-item"
          :class="{ active: idx === activeIndex }"
          @click="executeItem(item)"
          @mouseenter="activeIndex = idx"
          role="option"
          :aria-selected="idx === activeIndex"
        >
          <span class="item-icon">
            <AppIcon :name="item.icon" :size="16" />
          </span>
          <div class="item-details">
            <div class="item-title">
              {{ item.title }}
              <span class="category-tag" :class="item.category">
                {{ item.category === 'action' ? 'إجراء' : 'تنقل' }}
              </span>
            </div>
            <div class="item-desc">{{ item.desc }}</div>
          </div>
          <span v-if="idx === activeIndex" class="enter-badge">↵ تنفيذ</span>
        </div>
      </div>

      <div v-else class="empty-results">
        <AppIcon name="search" :size="32" class="empty-icon" />
        <p>لا توجد نتائج مطابقة لـ "{{ query }}"</p>
      </div>

      <!-- Footer Info -->
      <div class="palette-footer">
        <div class="footer-shortcuts">
          <span><kbd class="mini-kbd">↑</kbd> <kbd class="mini-kbd">↓</kbd> للتنقل</span>
          <span><kbd class="mini-kbd">↵</kbd> للاختيار</span>
          <span><kbd class="mini-kbd">Esc</kbd> للإغلاق</span>
        </div>
        <span class="shortcut-tip">لوحة الأوامر الموحدة 2.0</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const isOpen = ref(false);
const query = ref('');
const activeIndex = ref(0);
const selectedCategory = ref<'all' | 'nav' | 'action'>('all');
const searchInput = ref<HTMLInputElement | null>(null);

const rawItems = [
  // Navigation
  {
    id: 'nav_dash',
    category: 'nav',
    title: 'لوحة التحكم الرئيسية',
    desc: 'المؤشرات والنبض التنفيذي والتقارير الحية',
    icon: 'dashboard',
    action: () => router.push('/'),
  },
  {
    id: 'nav_pos',
    category: 'nav',
    title: 'شاشة المبيعات (POS)',
    desc: 'البيع المباشر والفوترة اللحظية في نقطة البيع',
    icon: 'shop',
    perm: 'pos.view',
    action: () => router.push('/branch-sales'),
  },
  {
    id: 'nav_sales',
    category: 'nav',
    title: 'المبيعات وسجل الفواتير',
    desc: 'إدارة الفواتير والمدفوعات والمبيعات اليومية',
    icon: 'sales',
    perm: 'sales.view',
    action: () => router.push('/sales'),
  },
  {
    id: 'nav_customers',
    category: 'nav',
    title: 'العملاء وحسابات الديون',
    desc: 'سجل العملاء، كشوف الحسابات، وتسديد المديونيات',
    icon: 'customers',
    action: () => router.push('/customers'),
  },
  {
    id: 'nav_inventory',
    category: 'nav',
    title: 'المخزون والمستودعات',
    desc: 'الأرصدة، التوزيع بين الفروع، والتسويات الجردية',
    icon: 'inventory',
    perm: 'inventory.view',
    action: () => router.push('/inventory'),
  },
  {
    id: 'nav_products',
    category: 'nav',
    title: 'دليل المنتجات والأسعار',
    desc: 'إدارة قوائم الأصناف والباركود والتكاليف',
    icon: 'products',
    perm: 'products.view',
    action: () => router.push('/products'),
  },
  {
    id: 'nav_purchases',
    category: 'nav',
    title: 'المشتريات والموردين والمصروفات',
    desc: 'فواتير التوريد، حسابات الموردين، والمصروفات',
    icon: 'purchases',
    perm: ['inventory.view', 'expenses.view'],
    action: () => router.push('/purchases'),
  },
  {
    id: 'nav_reports',
    category: 'nav',
    title: 'التقارير والتحليلات والذكاء',
    desc: 'تقارير الأرباح، التنبؤ بالطلب، والتحليل المالي',
    icon: 'reports',
    perm: 'reports.view',
    action: () => router.push('/reports'),
  },
  {
    id: 'nav_automation',
    category: 'nav',
    title: 'محرك الأتمتة والرسم البياني',
    desc: 'سير العمليات وقواعد التنبيه الآلية',
    icon: 'bot',
    perm: 'settings.view',
    action: () => router.push('/automation'),
  },
  {
    id: 'nav_settings',
    category: 'nav',
    title: 'إدارة المنشأة والإعدادات',
    desc: 'بيانات المنشأة، الضرائب، والمستخدمين',
    icon: 'settings',
    perm: 'settings.view',
    action: () => router.push('/settings'),
  },

  // Actions & Quick Creation
  {
    id: 'act_new_invoice',
    category: 'action',
    title: 'إنشاء فاتورة مبيعات جديدة',
    desc: 'فتح نموذج تحرير فاتورة مبيعات عميل',
    icon: 'receipt',
    perm: 'invoices.view',
    action: () => router.push('/invoices/create'),
  },
  {
    id: 'act_new_quote',
    category: 'action',
    title: 'إنشاء عرض أسعار',
    desc: 'إصدار عرض سعر مبدئي قابل للتحويل لفاتورة',
    icon: 'receipt',
    perm: 'invoices.view',
    action: () => router.push('/invoices/quotes'),
  },
  {
    id: 'act_new_product',
    category: 'action',
    title: 'إضافة منتج جديد للكتالوج',
    desc: 'فتح نافذة إضافة صنف جديد للمخزون والبيع',
    icon: 'plus',
    perm: 'products.view',
    action: () => router.push('/products'),
  },
  {
    id: 'act_new_expense',
    category: 'action',
    title: 'تسجيل مصروف تشغيلي',
    desc: 'قيد مصروف نثري أو تشغيلي في حركة المالية',
    icon: 'coins',
    perm: 'expenses.view',
    action: () => router.push('/expenses'),
  },
  {
    id: 'act_backup',
    category: 'action',
    title: 'النسخ الاحتياطي للنظام',
    desc: 'الذهاب إلى قسم النسخ الاحتياطي وحفظ البيانات',
    icon: 'save',
    perm: 'settings.view',
    action: () => router.push('/settings?tab=backup'),
  },
];

const availableItems = computed(() => {
  return rawItems.filter((item: any) => {
    if (!item.perm) return true;
    if (Array.isArray(item.perm)) {
      return item.perm.some((p: any) => authStore.hasPermission(p));
    }
    return authStore.hasPermission(item.perm);
  });
});

const filteredItems = computed(() => {
  const q = query.value.trim().toLowerCase();
  let list = availableItems.value;

  if (selectedCategory.value !== 'all') {
    list = list.filter((item: any) => item.category === selectedCategory.value);
  }

  if (!q) return list;
  return list.filter(
    (item: any) => item.title.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q),
  );
});

function moveDown() {
  if (activeIndex.value < filteredItems.value.length - 1) {
    activeIndex.value++;
  } else {
    activeIndex.value = 0;
  }
}

function moveUp() {
  if (activeIndex.value > 0) {
    activeIndex.value--;
  } else {
    activeIndex.value = filteredItems.value.length - 1;
  }
}

function selectItem() {
  const item = filteredItems.value[activeIndex.value];
  if (item) {
    executeItem(item);
  }
}

function executeItem(item: any) {
  close();
  if (typeof item.action === 'function') {
    item.action();
  }
}

function open() {
  isOpen.value = true;
  query.value = '';
  activeIndex.value = 0;
  nextTick(() => {
    searchInput.value?.focus();
  });
}

function close() {
  isOpen.value = false;
}

const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (isOpen.value) {
      close();
    } else {
      open();
    }
  }
};

watch(query, () => {
  activeIndex.value = 0;
});

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('open-command-palette', open);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('open-command-palette', open);
});
</script>

<style lang="scss" scoped>
.command-palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: clamp(60px, 12vh, 120px);
}

.command-palette-box {
  width: 100%;
  max-width: 620px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: paletteScale 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes paletteScale {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(-8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.search-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.search-icon {
  color: var(--color-primary);
  display: flex;
  align-items: center;
}

.palette-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--color-text-strong);
  font-size: 1rem;
  font-weight: 600;
  outline: none;

  &::placeholder {
    color: var(--color-text-subtle);
    font-weight: 400;
  }
}

.clear-btn {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
}

.category-pills {
  display: flex;
  gap: 6px;
  padding: 8px 18px;
  background: var(--color-bg-subtle);
  border-bottom: 1px solid var(--color-border-subtle);
}

.pill-btn {
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  background: transparent;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    color: var(--color-text);
  }

  &.active {
    background: var(--color-surface);
    border-color: var(--color-border);
    color: var(--color-primary);
    font-weight: 700;
  }
}

.results-list {
  max-height: 380px;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);

  &:hover,
  &.active {
    background: var(--color-bg-subtle);
  }

  &.active {
    .item-title {
      color: var(--color-primary);
    }
  }
}

.item-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
  display: grid;
  place-items: center;
  flex-shrink: 0;

  .active & {
    background: var(--color-primary-soft);
    color: var(--color-primary);
  }
}

.item-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--color-text-strong);
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-tag {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--radius-xs);

  &.nav {
    background: var(--color-bg-subtle);
    color: var(--color-text-muted);
  }
  &.action {
    background: var(--color-primary-soft);
    color: var(--color-primary);
  }
}

.item-desc {
  font-size: 0.76rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.enter-badge {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  padding: 3px 8px;
  border-radius: var(--radius-xs);
}

.empty-results {
  padding: 48px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--color-text-muted);
  font-size: 0.88rem;
}

.palette-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  background: var(--color-bg-subtle);
  border-top: 1px solid var(--color-border);
  font-size: 0.74rem;
  color: var(--color-text-muted);
}

.footer-shortcuts {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mini-kbd {
  font-family: var(--font-family-mono);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xs);
  padding: 1px 5px;
  font-size: 0.7rem;
}
</style>

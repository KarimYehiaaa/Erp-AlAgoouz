<template>
  <div v-if="isOpen" class="command-palette-overlay" @click.self="close">
    <div class="command-palette-box card">
      <div class="search-section">
        <span class="search-icon">🔍</span>
        <input
          ref="searchInput"
          v-model="query"
          type="text"
          placeholder="ابحث عن صفحة أو قم بتنفيذ أمر... (اضغط Esc للإغلاق)"
          class="palette-input"
          @keydown.down.prevent="moveDown"
          @keydown.up.prevent="moveUp"
          @keydown.enter.prevent="selectItem"
          @keydown.esc="close"
        />
      </div>

      <div v-if="filteredItems.length" class="results-list">
        <div
          v-for="(item, idx) in filteredItems"
          :key="item.id"
          class="result-item"
          :class="{ active: idx === activeIndex }"
          @click="executeItem(item)"
          @mouseenter="activeIndex = idx"
        >
          <span class="item-icon">
            <AppIcon :name="item.icon" :size="16" />
          </span>
          <div class="item-details">
            <div class="item-title">{{ item.title }}</div>
            <div class="item-desc">{{ item.desc }}</div>
          </div>
          <span v-if="idx === activeIndex" class="enter-badge">↵ Enter</span>
        </div>
      </div>
      <div v-else class="empty-results">
        لا توجد نتائج مطابقة لـ "{{ query }}"
      </div>

      <div class="palette-footer">
        <span>استخدم الأسهم ⇅ للتنقل، و Enter للتنفيذ.</span>
        <span class="shortcut-tip">Ctrl + K</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';

const router = useRouter();
const appStore = useAppStore();

const isOpen = ref(false);
const query = ref('');
const activeIndex = ref(0);
const searchInput = ref(null);

const allItems = [
  { id: 'dash', title: 'لوحة التحكم', desc: 'الذهاب إلى الرئيسية والتقارير العامة', icon: 'dashboard', action: () => router.push('/') },
  { id: 'prod', title: 'المنتجات والأسعار', desc: 'الذهاب إلى إدارة المنتجات والباركود', icon: 'products', action: () => router.push('/products') },
  { id: 'sales', title: 'فواتير المبيعات', desc: 'الذهاب إلى قسم المبيعات والمبيعات اليومية', icon: 'sales', action: () => router.push('/sales') },
  { id: 'cust', title: 'العملاء والديون', desc: 'الذهاب إلى إدارة العملاء وسجل المعاملات والديون', icon: 'customers', action: () => router.push('/customers') },
  { id: 'inv', title: 'الفواتير والمبيعات المبسطة', desc: 'استعراض فواتير العملاء وسدادها', icon: 'invoices', action: () => router.push('/invoices') },
  { id: 'recipes', title: 'الوصفات وخطوط الإنتاج', desc: 'إدارة مكونات المنتجات والإنتاج الفعلي للمحمص', icon: 'recipes', action: () => router.push('/recipes') },
  { id: 'inv_stock', title: 'المخزون والتحويلات', desc: 'استعراض حالة المخزن والتحويلات والهوالك', icon: 'inventory', action: () => router.push('/inventory') },
  { id: 'costs', title: 'حساب التكاليف والربحية', desc: 'تحليل تكاليف المنتجات ومحاكاة الربح للوصفات', icon: 'costs', action: () => router.push('/costs') },
  { id: 'exp', title: 'المصروفات', desc: 'تسجيل المصاريف النثرية والتشغيلية للمحل', icon: 'expenses', action: () => router.push('/expenses') },
  { id: 'hr', title: 'الموظفين والمرتبات', desc: 'تسجيل حضور الموظفين والسلف والمسيرات', icon: 'users', action: () => router.push('/hr') },
  { id: 'settings', title: 'الإعدادات العامة', desc: 'تعديل بيانات الشركة، الثيمات، والنسخ الاحتياطي', icon: 'settings', action: () => router.push('/settings') },
  { id: 'theme_toggle', title: 'تبديل المظهر الداكن/المضيء', desc: 'تغيير وضع ألوان الشاشة فوراً', icon: 'moon', action: () => appStore.toggleColorMode() },
  { id: 'backup_create', title: 'نسخة احتياطية سريعة', desc: 'الذهاب لقسم النسخ الاحتياطي بالإعدادات للنسخ', icon: 'save', action: () => router.push('/settings?tab=backup') },
];

const filteredItems = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return allItems;
  return allItems.filter(
    item =>
      item.title.toLowerCase().includes(q) ||
      item.desc.toLowerCase().includes(q)
  );
});

watch(query, () => {
  activeIndex.value = 0;
});

const open = () => {
  isOpen.value = true;
  query.value = '';
  activeIndex.value = 0;
  nextTick(() => {
    searchInput.value?.focus();
  });
};

const close = () => {
  isOpen.value = false;
};

const moveDown = () => {
  if (activeIndex.value < filteredItems.value.length - 1) {
    activeIndex.value++;
  }
};

const moveUp = () => {
  if (activeIndex.value > 0) {
    activeIndex.value--;
  }
};

const selectItem = () => {
  const item = filteredItems.value[activeIndex.value];
  if (item) {
    executeItem(item);
  }
};

const executeItem = (item) => {
  item.action();
  close();
};

const handleKeyDown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (isOpen.value) close();
    else open();
  }
};

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
  background: rgba(15, 23, 42, 0.48);
  backdrop-filter: blur(8px);
  z-index: 10000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
}

.command-palette-box {
  width: min(640px, 94vw);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  max-height: 70vh;
  overflow: hidden;
  animation: slideDown 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes slideDown {
  from { transform: translateY(-16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.search-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);

  .search-icon {
    font-size: 1.25rem;
    color: var(--text-muted);
  }

  .palette-input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text-strong);
    font-size: 1.05rem;
    outline: none;

    &::placeholder {
      color: var(--text-muted);
    }
  }
}

.results-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;

  .item-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-xs);
    background: color-mix(in srgb, var(--primary) 8%, var(--bg-elevated));
    color: var(--primary);
  }

  .item-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;

    .item-title {
      font-weight: 800;
      color: var(--text-strong);
      font-size: 0.95rem;
    }

    .item-desc {
      color: var(--text-muted);
      font-size: 0.78rem;
    }
  }

  .enter-badge {
    font-size: 0.7rem;
    padding: 3px 6px;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary-dark);
    border-radius: var(--radius-xs);
    font-family: monospace;
    font-weight: bold;
  }

  &.active {
    background: color-mix(in srgb, var(--primary) 10%, var(--bg-elevated));
    .item-icon {
      background: var(--primary);
      color: #ffffff;
    }
  }
}

.empty-results {
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.palette-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: color-mix(in srgb, var(--bg-soft) 40%, transparent);
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.78rem;

  .shortcut-tip {
    font-size: 0.72rem;
    padding: 2px 6px;
    background: var(--border-strong);
    color: var(--text-strong);
    border-radius: 4px;
    font-family: monospace;
  }
}
</style>

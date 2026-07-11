<template>
  <header class="navbar">
    <div class="navbar-start">
      <button
        class="icon-btn"
        type="button"
        :title="appStore.sidebarOpen ? 'إخفاء القائمة' : 'إظهار القائمة'"
        @click="appStore.toggleSidebar"
      >
        <AppIcon name="menu" />
      </button>

      <div class="page-info">
        <h1 class="page-title">{{ pageTitle }}</h1>
        <p class="page-sub">{{ pageSub }}</p>
      </div>
    </div>

    <div class="navbar-end">
      <div class="search-wrap" @click.prevent="triggerCommandPalette" style="cursor: pointer;">
        <AppIcon class="search-icon" name="search" />
        <input
          type="text"
          placeholder="بحث سريع أو تنقل... (Ctrl+K)"
          class="search-input"
          readonly
          style="cursor: pointer;"
        />
      </div>

      <div class="theme-switcher" ref="themeMenuRoot">
        <button
          class="icon-btn"
          type="button"
          @click.stop="themeMenuOpen = !themeMenuOpen"
          :title="`نمط الواجهة: ${currentPreset?.name || appStore.stylePreset}`"
        >
          <AppIcon :name="currentPreset?.icon || 'theme'" />
        </button>
        <transition name="fade">
          <div v-if="themeMenuOpen" class="theme-menu">
            <div class="theme-menu-head">
              <strong>نمط الواجهة</strong>
              <button type="button" class="theme-mode-toggle" @click="appStore.toggleColorMode($event)">
                <AppIcon :name="appStore.colorMode === 'light' ? 'moon' : 'sun'" />
                <span>{{ appStore.colorMode === 'light' ? 'داكن' : 'فاتح' }}</span>
              </button>
            </div>
            <button
              v-for="item in STYLE_PRESETS"
              :key="item.id"
              type="button"
              class="theme-option"
              :class="{ active: appStore.stylePreset === item.id }"
              @click="selectPreset(item.id)"
            >
              <span class="theme-swatch" :style="{ background: presetSwatch(item.id) }"></span>
              <span class="theme-meta">
                <strong>{{ item.name }}</strong>
                <small>{{ item.desc }}</small>
              </span>
              <AppIcon v-if="appStore.stylePreset === item.id" name="check" class="theme-check" />
            </button>
          </div>
        </transition>
      </div>

      <!-- مؤشر حالة الاتصال بالإنترنت والمزامنة الخلفية -->
      <div 
        class="network-status" 
        :class="{ online: appStore.isOnline, offline: !appStore.isOnline }"
        :title="appStore.isOnline ? 'النظام متصل بالإنترنت' : 'النظام يعمل دون اتصال (أوفلاين)'"
      >
        <span class="pulse-indicator"></span>
        <span class="status-text">{{ appStore.isOnline ? 'متصل' : 'أوفلاين' }}</span>
        <span v-if="appStore.pendingSyncCount > 0" class="sync-badge" title="مبيعات معلقة بانتظار المزامنة">
          {{ appStore.pendingSyncCount }} معلقة
        </span>
      </div>

      <!-- Privacy Toggle (Eye icon) -->
      <button
        class="icon-btn"
        type="button"
        @click="appStore.togglePrivacyMode"
        :title="appStore.privacyMode ? 'إظهار المبالغ (وضع الخصوصية مفعل)' : 'طمس المبالغ (تفعيل وضع الخصوصية)'"
        :class="{ active: appStore.privacyMode }"
      >
        <AppIcon :name="appStore.privacyMode ? 'eyeOff' : 'eye'" />
      </button>

      <!-- Data Density Toggle -->
      <button
        class="icon-btn"
        type="button"
        @click="appStore.toggleDataDensity"
        :title="appStore.dataDensity === 'compact' ? 'كثافة البيانات: كثيفة (تبديل للمريح)' : 'كثافة البيانات: مريحة (تبديل للمكثف)'"
        :class="{ active: appStore.dataDensity === 'compact' }"
      >
        <AppIcon :name="appStore.dataDensity === 'compact' ? 'maximize' : 'minimize'" />
      </button>


      <button
        class="icon-btn notification-btn"
        type="button"
        @click="appStore.toggleNotificationDrawer"
        title="تنبيهات التشغيل"
        style="position: relative;"
      >
        <AppIcon name="warning" />
        <span v-if="appStore.notifications.length" class="notification-badge">{{ appStore.notifications.length }}</span>
      </button>

      <div class="user-chip">
        <div class="user-avatar">{{ userInitial }}</div>
        <div class="user-meta">
          <strong>{{ displayUserName }}</strong>
          <span>{{ authStore.user?.role_name_ar || 'مستخدم' }}</span>
        </div>
        <button class="logout-btn" type="button" @click="handleLogout" title="تسجيل الخروج">
          <AppIcon name="logout" />
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import { useAppStore, STYLE_PRESETS, STYLE_SWATCHES } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { products as productsApi, customers as customersApi, sales as salesApi, operations as operationsApi } from '@/api';
import { localDb } from '@/services/localDb';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();
const search = ref('');
const searchFocused = ref(false);
const searchLoading = ref(false);
const remoteResults = ref([]);
const themeMenuOpen = ref(false);
const themeMenuRoot = ref(null);
let searchTimer = null;
const triggerCommandPalette = () => {
  window.dispatchEvent(new CustomEvent('open-command-palette'));
};

const presetSwatches = STYLE_SWATCHES;

const titles = {
  Dashboard: ['لوحة التحكم', 'مؤشرات التشغيل والتحصيل والمخزون'],
  BranchSales: ['شاشة المبيعات', 'إدخال مبيعات الفرع وخصم المخزون'],
  Sales: ['المبيعات', 'سجل المبيعات اليومية'],
  Products: ['المنتجات', 'إدارة المنتجات والأسعار'],
  Purchases: ['المشتريات', 'فواتير الموردين وحركة الشراء'],
  Inventory: ['المخزون', 'الأرصدة والتحويلات والتنبيهات'],
  Costs: ['التكاليف', 'تحليل أسعار المنتجات وهوامش الربح'],
  Recipes: ['الوصفات', 'مكونات المنتجات وخصم المخزون'],
  Customers: ['العملاء', 'الأرصدة والمدفوعات والتعاملات'],
  Invoices: ['الفواتير', 'الفواتير والمدفوعات'],
  InvoiceCreate: ['فاتورة جديدة', 'إنشاء فاتورة عميل'],
  QuotationCreate: ['عرض سعر', 'إنشاء عرض سعر للعميل'],
  InvoiceDetail: ['عرض الفاتورة', 'تفاصيل الفاتورة والطباعة'],
  Expenses: ['المصروفات', 'تتبع المصروفات والتصنيفات'],
  Suppliers: ['الموردين', 'إدارة الموردين والمشتريات'],
  Reports: ['التقارير', 'تحليلات مالية وتشغيلية'],
  Users: ['المستخدمين', 'الصلاحيات وإدارة الوصول'],
  Settings: ['الإعدادات', 'إعدادات النظام والواجهة'],
};

const pageResults = [
  { type: 'page', badge: 'صفحة', title: 'لوحة التحكم', subtitle: 'مؤشرات التشغيل', to: '/' },
  { type: 'page', badge: 'صفحة', title: 'شاشة المبيعات', subtitle: 'إدخال مبيعات الفرع', to: '/branch-sales' },
  { type: 'page', badge: 'صفحة', title: 'المبيعات', subtitle: 'سجل المبيعات', to: '/sales' },
  { type: 'page', badge: 'صفحة', title: 'المنتجات', subtitle: 'إدارة المنتجات', to: '/products' },
  { type: 'page', badge: 'صفحة', title: 'المشتريات', subtitle: 'فواتير الموردين', to: '/purchases' },
  { type: 'page', badge: 'صفحة', title: 'المخزون', subtitle: 'أرصدة وحركة المخزون', to: '/inventory' },
  { type: 'page', badge: 'صفحة', title: 'التكاليف', subtitle: 'تحليل الأسعار والأرباح', to: '/costs' },
  { type: 'page', badge: 'صفحة', title: 'الوصفات', subtitle: 'مكونات المنتجات', to: '/recipes' },
  { type: 'page', badge: 'صفحة', title: 'العملاء', subtitle: 'بيانات ومديونيات العملاء', to: '/customers' },
  { type: 'page', badge: 'صفحة', title: 'الفواتير', subtitle: 'الفواتير والمدفوعات', to: '/invoices' },
  { type: 'page', badge: 'صفحة', title: 'المصروفات', subtitle: 'تتبع المصروفات', to: '/expenses' },
  { type: 'page', badge: 'صفحة', title: 'الموردين', subtitle: 'إدارة الموردين', to: '/suppliers' },
  { type: 'page', badge: 'صفحة', title: 'التقارير', subtitle: 'تحليلات النظام', to: '/reports' },
  { type: 'page', badge: 'صفحة', title: 'الإعدادات', subtitle: 'إعدادات النظام', to: '/settings' },
];

const pageTitle = computed(() => titles[route.name]?.[0] || 'بن العجوز');
const pageSub = computed(() => titles[route.name]?.[1] || 'نظام إدارة متكامل');
const displayUserName = computed(() => authStore.user?.full_name || authStore.user?.username || 'مستخدم');
const normalizedSearch = computed(() => search.value.trim().toLowerCase());
const localResults = computed(() => {
  const q = normalizedSearch.value;
  if (!q) return [];
  return pageResults.filter((item) => `${item.title} ${item.subtitle}`.toLowerCase().includes(q)).slice(0, 5);
});
const searchResults = computed(() => [...localResults.value, ...remoteResults.value].slice(0, 8));
const showSearchResults = computed(() => searchFocused.value && normalizedSearch.value.length >= 2);
const userInitial = computed(() => (displayUserName.value || 'م').charAt(0));
const currentPreset = computed(() => STYLE_PRESETS.find((item) => item.id === appStore.stylePreset) || STYLE_PRESETS[0]);

const presetSwatch = (id) => presetSwatches[id] || 'linear-gradient(135deg, var(--primary), var(--accent))';
const selectPreset = (id) => {
  appStore.setStylePreset(id);
  themeMenuOpen.value = false;
};

const handleLogout = () => {
  authStore.logout();
  router.push('/login');
};

const clearSearch = () => {
  search.value = '';
  remoteResults.value = [];
  searchFocused.value = false;
};

const openSearchResult = (item) => {
  router.push(item.to);
  clearSearch();
};

const openFirstResult = () => {
  if (searchResults.value[0]) openSearchResult(searchResults.value[0]);
};

watch(search, (value) => {
  clearTimeout(searchTimer);
  const q = value.trim();
  remoteResults.value = [];
  if (q.length < 2) {
    searchLoading.value = false;
    return;
  }

  searchLoading.value = true;
  searchTimer = setTimeout(async () => {
    try {
      const [productsRes, customersRes] = await Promise.allSettled([
        productsApi.list({ search: q, limit: 4 }),
        customersApi.list({ search: q, limit: 4 }),
      ]);

      const products = productsRes.status === 'fulfilled' ? (productsRes.value.data || []) : [];
      const customers = customersRes.status === 'fulfilled' ? (customersRes.value.data || []) : [];
      remoteResults.value = [
        ...products.map((p) => ({
          type: 'product',
          badge: 'منتج',
          id: p.id,
          title: p.name_ar || p.sku,
          subtitle: [p.sku, p.category_name].filter(Boolean).join(' - ') || 'فتح المنتجات',
          to: '/products',
        })),
        ...customers.map((c) => ({
          type: 'customer',
          badge: 'عميل',
          id: c.id,
          title: c.name_ar || c.code,
          subtitle: [c.code, c.phone].filter(Boolean).join(' - ') || 'فتح العملاء',
          to: '/customers',
        })),
      ];
    } finally {
      searchLoading.value = false;
    }
  }, 250);
});

const handleDocumentClick = (event) => {
  if (themeMenuRoot.value && !themeMenuRoot.value.contains(event.target)) {
    themeMenuOpen.value = false;
  }
};

// ─── Network & Sync Logic ───
const syncOfflineSales = async () => {
  if (!navigator.onLine) return;
  try {
    const offlineSales = await localDb.getOfflineSales();
    appStore.pendingSyncCount = offlineSales.length;
    if (!offlineSales.length) return;

    console.log(`Starting sync of ${offlineSales.length} offline sales...`);
    for (const sale of offlineSales) {
      const { offline_id, sale_number, created_at, ...cleanSale } = sale;
      try {
        await salesApi.create(cleanSale);
        await localDb.deleteOfflineSale(offline_id);
      } catch (err) {
        console.error(`Failed to sync offline sale ${offline_id}:`, err);
        break; // Stop syncing to maintain correct chronological order
      }
    }

    const remaining = await localDb.getOfflineSales();
    appStore.pendingSyncCount = remaining.length;
    
    appStore.triggerDataRefresh();
  } catch (err) {
    console.error('Error during background sync:', err);
  }
};

const updateOnlineStatus = () => {
  appStore.isOnline = navigator.onLine;
  if (navigator.onLine) {
    syncOfflineSales();
  }
};

let alertsInterval = null;
const loadAlertsBackground = async () => {
  if (!navigator.onLine) return;
  try {
    const res = await operationsApi.alerts();
    appStore.notifications = res.data?.alerts || res.alerts || [];
  } catch (e) {
    console.warn('Failed to load background alerts:', e);
  }
};

let syncInterval = null;

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  
  // Listen to network changes
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  
  // Initial check and sync
  updateOnlineStatus();
  localDb.getOfflineSales().then((sales) => {
    appStore.pendingSyncCount = sales.length;
    if (navigator.onLine && sales.length > 0) {
      syncOfflineSales();
    }
  });

  // Set up periodic sync
  syncInterval = setInterval(() => {
    if (navigator.onLine) {
      syncOfflineSales();
    }
  }, 30000);

  // Background alerts fetch
  loadAlertsBackground();
  alertsInterval = setInterval(loadAlertsBackground, 60000);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  window.removeEventListener('online', updateOnlineStatus);
  window.removeEventListener('offline', updateOnlineStatus);
  if (syncInterval) {
    clearInterval(syncInterval);
  }
  if (alertsInterval) {
    clearInterval(alertsInterval);
  }
});
</script>

<style lang="scss" scoped>
.navbar {
  position: fixed;
  top: 12px;
  left: 16px;
  right: calc(var(--sidebar-current-width, var(--sidebar-width)) + 16px);
  height: 56px;
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: right var(--transition);
}

.navbar-start,
.navbar-end {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.page-info { min-width: 0; line-height: 1.2; }

.page-title {
  color: var(--text-strong);
  font-size: 1rem;
  font-weight: 900;
}

.page-sub {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 0.73rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(40vw, 420px);
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;

  &:hover {
    border-color: var(--primary);
    color: var(--primary-dark);
  }
}

.notification-btn {
  position: relative;
  
  .notification-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    background: var(--danger);
    color: #fff;
    font-size: 0.65rem;
    font-weight: 900;
    border-radius: 999px;
    border: 1.5px solid var(--bg-elevated);
    box-shadow: 0 0 6px var(--danger);
    display: flex;
    align-items: center;
    justify-content: center;
  }
}


.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  right: 10px;
  color: var(--text-muted);
  pointer-events: none;
}

.search-input {
  width: min(270px, 28vw);
  min-height: 38px;
  padding: 8px 36px 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text);

  &:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent);
  }
}

.search-results,
.theme-menu {
  position: absolute;
  top: calc(100% + 10px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
  z-index: 150;
}

.search-results {
  right: 0;
  width: min(390px, 76vw);
  max-height: 340px;
  overflow-y: auto;
  padding: 8px;
}

.search-result {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  align-items: center;
  padding: 9px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  text-align: right;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--primary) 8%, transparent);
  }

  .result-type {
    grid-row: 1 / 3;
    padding: 3px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary-dark);
    font-size: 0.68rem;
    font-weight: 900;
  }

  .result-main {
    font-size: 0.86rem;
    font-weight: 900;
  }

  small {
    color: var(--text-muted);
    font-size: 0.72rem;
  }
}

.search-empty {
  padding: 12px;
  color: var(--text-muted);
  font-size: 0.82rem;
  text-align: center;
}

.theme-switcher { position: relative; }

.theme-menu {
  left: 0;
  width: min(320px, 82vw);
  padding: 10px;
}

.theme-menu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.theme-mode-toggle,
.theme-option {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
}

.theme-mode-toggle {
  padding: 6px 9px;
  font-size: 0.78rem;
  font-weight: 800;
}

.theme-option {
  width: 100%;
  padding: 9px;
  margin-top: 6px;
  text-align: right;

  &.active {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 7%, var(--bg-elevated));
  }
}

.theme-swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.theme-meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;

  strong { color: var(--text-strong); font-size: 0.84rem; }
  small { color: var(--text-muted); font-size: 0.72rem; }
}

.theme-check { color: var(--success); }

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 4px 8px 4px 4px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-elevated);
}

.user-avatar {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-weight: 900;
}

.user-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.15;

  strong { color: var(--text-strong); font-size: 0.78rem; }
  span { color: var(--text-muted); font-size: 0.68rem; }
}

.logout-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
  }
}

@media (max-width: 992px) {
  .navbar { right: 16px; }
}

@media (max-width: 760px) {
  .page-sub,
  .user-meta { display: none; }
  .search-input { width: min(190px, 42vw); }
  .network-status .status-text { display: none; }
}

.network-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  font-size: 0.78rem;
  font-weight: 700;
  transition: all 0.3s ease;

  &.online {
    color: var(--success);
    border-color: color-mix(in srgb, var(--success) 30%, var(--border));
    background: color-mix(in srgb, var(--success) 6%, var(--bg-elevated));
    .pulse-indicator {
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
    }
  }

  &.offline {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 30%, var(--border));
    background: color-mix(in srgb, var(--danger) 6%, var(--bg-elevated));
    .pulse-indicator {
      background: var(--danger);
      box-shadow: 0 0 8px var(--danger);
    }
  }
}

.pulse-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  position: relative;
  display: inline-block;

  &::after {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    border-radius: 50%;
    background: inherit;
    animation: status-pulse 1.8s infinite ease-in-out;
  }
}

@keyframes status-pulse {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(2.5); opacity: 0; }
}

.sync-badge {
  background: var(--warning);
  color: #000;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 900;
  box-shadow: 0 0 6px var(--warning);
  animation: sync-badge-pulse 1.5s infinite alternate;
}

@keyframes sync-badge-pulse {
  0% { transform: scale(1); }
  100% { transform: scale(1.05); }
}
</style>

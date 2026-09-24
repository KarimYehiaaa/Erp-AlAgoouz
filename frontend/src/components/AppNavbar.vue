<template>
  <header class="navbar" role="banner">
    <!-- Navbar Start: Menu Toggle & Workspace Switcher -->
    <div class="navbar-start">
      <button
        class="icon-btn sidebar-toggle-btn"
        type="button"
        :title="sidebarToggleLabel"
        :aria-label="sidebarToggleLabel"
        @click="appStore.toggleSidebar"
      >
        <AppIcon name="menu" :size="18" />
      </button>

      <!-- Contextual Workspace Switcher -->
      <div class="workspace-switcher" ref="workspaceMenuRef">
        <button
          type="button"
          class="workspace-chip"
          @click="workspaceMenuOpen = !workspaceMenuOpen"
          :title="`نطاق العمل الحالي: ${appStore.activeWorkspace}`"
          aria-haspopup="true"
          :aria-expanded="workspaceMenuOpen"
        >
          <span class="workspace-icon"><AppIcon name="warehouse" :size="15" /></span>
          <div class="workspace-meta">
            <span class="workspace-tenant">{{ companyName }}</span>
            <strong class="workspace-location">{{ appStore.activeWorkspace }}</strong>
          </div>
          <span class="chevron-indicator"><AppIcon name="arrowDown" :size="12" /></span>
        </button>

        <transition name="dropdown-fade">
          <div v-if="workspaceMenuOpen" class="workspace-dropdown card" role="menu">
            <div class="dropdown-header">اختيار موقع التشغيل</div>
            <button
              v-for="ws in availableWorkspaces"
              :key="ws.id"
              type="button"
              class="dropdown-item"
              :class="{ active: appStore.activeWorkspace === ws.name }"
              @click="selectWorkspace(ws.name)"
              role="menuitem"
            >
              <AppIcon :name="ws.icon" :size="16" />
              <span>{{ ws.name }}</span>
              <span v-if="appStore.activeWorkspace === ws.name" class="check-mark">✓</span>
            </button>
          </div>
        </transition>
      </div>

      <!-- Page Title & Subtitle -->
      <div class="page-info">
        <h1 class="page-title">{{ pageTitle }}</h1>
        <p class="page-sub">{{ pageSub }}</p>
      </div>
    </div>

    <!-- Navbar End: Command Center, Quick Create, Action Center & Preferences -->
    <div class="navbar-end">
      <!-- Universal Command Center Trigger (Ctrl + K) -->
      <div
        class="search-wrap"
        role="button"
        tabindex="0"
        @click.prevent="triggerCommandPalette"
        @keydown.enter.prevent="triggerCommandPalette"
        title="فتح مركز الأوامر والبحث الشامل (Ctrl+K)"
      >
        <AppIcon class="search-icon" name="search" :size="15" />
        <span class="search-label">بحث سريع أو أمر...</span>
        <kbd class="command-kbd">Ctrl K</kbd>
      </div>

      <!-- Quick Create (+) Menu -->
      <div class="quick-create-wrap" ref="quickCreateRef">
        <button
          type="button"
          class="btn btn-primary btn-sm quick-create-btn"
          @click="quickCreateOpen = !quickCreateOpen"
          :aria-expanded="quickCreateOpen"
          title="إنشاء جديد سريع"
        >
          <AppIcon name="plus" :size="14" />
          <span class="btn-label">جديد</span>
        </button>

        <transition name="dropdown-fade">
          <div v-if="quickCreateOpen" class="quick-create-dropdown card" role="menu">
            <div class="dropdown-header">إجراءات الإنشاء السريعة</div>
            <button
              v-if="authStore.hasPermission('invoices.view')"
              type="button"
              class="dropdown-item"
              @click="navigateAndClose('/invoices/create')"
              role="menuitem"
            >
              <AppIcon name="receipt" :size="16" />
              <span>فاتورة مبيعات جديدة</span>
            </button>
            <button
              v-if="authStore.hasPermission('pos.view')"
              type="button"
              class="dropdown-item"
              @click="navigateAndClose('/pos')"
              role="menuitem"
            >
              <AppIcon name="shop" :size="16" />
              <span>عملية بيع سريعة (POS)</span>
            </button>
            <button
              v-if="authStore.hasPermission('products.view')"
              type="button"
              class="dropdown-item"
              @click="navigateAndClose('/products')"
              role="menuitem"
            >
              <AppIcon name="products" :size="16" />
              <span>إضافة منتج جديد</span>
            </button>
            <button
              v-if="authStore.hasPermission('inventory.view')"
              type="button"
              class="dropdown-item"
              @click="navigateAndClose('/purchases')"
              role="menuitem"
            >
              <AppIcon name="purchases" :size="16" />
              <span>تسجيل أمر شراء أو مصروف</span>
            </button>
          </div>
        </transition>
      </div>

      <!-- Shortcuts HUD (?) -->
      <button
        class="icon-btn shortcuts-btn"
        type="button"
        @click="triggerShortcutsHUD"
        title="دليل الاختصارات والمساعدة (?)"
        aria-label="دليل الاختصارات"
      >
        <AppIcon name="keyboard" :size="16" />
      </button>

      <!-- Action Center / Operational Alerts Drawer -->
      <button
        class="icon-btn notification-btn"
        type="button"
        @click="appStore.toggleNotificationDrawer"
        title="مركز الإجراءات والتنبيهات التشغيلية"
        aria-label="مركز التنبيهات"
      >
        <AppIcon name="bell" :size="16" />
        <span v-if="appStore.notifications.length" class="notification-badge">{{
          appStore.notifications.length
        }}</span>
      </button>

      <!-- Consolidated Enterprise Preferences Menu -->
      <div class="preferences-wrap" ref="preferencesRef">
        <button
          class="icon-btn"
          type="button"
          @click="preferencesOpen = !preferencesOpen"
          title="تفضيلات العرض والمظهر"
          aria-label="تفضيلات العرض"
          :class="{ active: preferencesOpen }"
        >
          <AppIcon name="sliders" :size="16" />
        </button>

        <transition name="dropdown-fade">
          <div v-if="preferencesOpen" class="preferences-dropdown card" role="menu">
            <div class="dropdown-header">تفضيلات الواجهة</div>

            <!-- Dark Mode -->
            <button
              type="button"
              class="pref-item"
              @click="appStore.toggleDarkMode"
              role="menuitem"
            >
              <div class="pref-meta">
                <AppIcon :name="appStore.darkMode ? 'sun' : 'moon'" :size="16" />
                <span>الوضع الداكن</span>
              </div>
              <span class="pref-state">{{ appStore.darkMode ? 'مفعل' : 'معطل' }}</span>
            </button>

            <!-- Data Density -->
            <button
              type="button"
              class="pref-item"
              @click="appStore.toggleDataDensity"
              role="menuitem"
            >
              <div class="pref-meta">
                <AppIcon
                  :name="appStore.dataDensity === 'compact' ? 'maximize' : 'minimize'"
                  :size="16"
                />
                <span>كثافة البيانات</span>
              </div>
              <span class="pref-state">{{
                appStore.dataDensity === 'compact' ? 'مكثفة' : 'مريحة'
              }}</span>
            </button>

            <!-- Privacy Mode -->
            <button
              type="button"
              class="pref-item"
              @click="appStore.togglePrivacyMode"
              role="menuitem"
            >
              <div class="pref-meta">
                <AppIcon :name="appStore.privacyMode ? 'eyeOff' : 'eye'" :size="16" />
                <span>طمس الأرقام (الخصوصية)</span>
              </div>
              <span class="pref-state">{{ appStore.privacyMode ? 'مفعل' : 'معطل' }}</span>
            </button>

            <!-- Cashier Focus Mode -->
            <button
              type="button"
              class="pref-item"
              @click="appStore.toggleFocusMode"
              role="menuitem"
            >
              <div class="pref-meta">
                <AppIcon name="monitor" :size="16" />
                <span>وضع التركيز الكامل (F4)</span>
              </div>
              <span class="pref-state">{{ appStore.focusMode ? 'مفعل' : 'معطل' }}</span>
            </button>
          </div>
        </transition>
      </div>

      <!-- Network & Sync Status -->
      <div
        class="network-status"
        :class="{ online: appStore.isOnline, offline: !appStore.isOnline }"
        :title="appStore.isOnline ? 'النظام متصل بالإنترنت' : 'النظام يعمل دون اتصال (أوفلاين)'"
      >
        <span class="pulse-indicator"></span>
        <span class="status-text">{{ appStore.isOnline ? 'متصل' : 'أوفلاين' }}</span>
        <span
          v-if="appStore.pendingSyncCount > 0"
          class="sync-badge"
          title="معاملات معلقة بانتظار المزامنة"
        >
          {{ appStore.pendingSyncCount }} معلقة
        </span>
      </div>

      <!-- User Chip & Profile Menu -->
      <div class="user-chip">
        <div class="user-avatar">{{ userInitial }}</div>
        <div class="user-meta">
          <strong>{{ displayUserName }}</strong>
          <span>{{ authStore.user?.role_name_ar || 'مستخدم' }}</span>
        </div>
        <button
          class="logout-btn"
          type="button"
          @click="handleLogout"
          title="تسجيل الخروج"
          aria-label="تسجيل الخروج"
        >
          <AppIcon name="logout" :size="16" />
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { brandingState } from '@/design-system/themes/themeEngine';
import { operations as operationsApi } from '@/api';
import { localDb } from '@/services/localDb';
import { OutboxService } from '@/services/outboxService';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();

const workspaceMenuOpen = ref(false);
const quickCreateOpen = ref(false);
const preferencesOpen = ref(false);

const workspaceMenuRef = ref<HTMLElement | null>(null);
const quickCreateRef = ref<HTMLElement | null>(null);
const preferencesRef = ref<HTMLElement | null>(null);

const companyName = computed(() => brandingState.companyName || 'منظومة الإدارة');

const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200);
const isMobile = computed(() => windowWidth.value <= 992);

const handleWindowResize = () => {
  windowWidth.value = window.innerWidth;
};

const sidebarToggleLabel = computed(() => {
  if (isMobile.value) {
    return appStore.sidebarOpen ? 'إغلاق القائمة' : 'إظهار القائمة';
  }
  return appStore.sidebarPinned ? 'تصغير الشريط الجانبي' : 'توسيع الشريط الجانبي';
});

const availableWorkspaces = [
  { id: 'store', name: 'المحل الرئيسي', icon: 'shop' },
  { id: 'main-warehouse', name: 'المخزن الرئيسي', icon: 'warehouse' },
  { id: 'all-warehouses', name: 'كل المخازن', icon: 'inventory' },
];

function selectWorkspace(name: string) {
  appStore.setWorkspace(name);
  workspaceMenuOpen.value = false;
  appStore.triggerDataRefresh();
}

function navigateAndClose(path: string) {
  quickCreateOpen.value = false;
  router.push(path);
}

const triggerCommandPalette = () => {
  window.dispatchEvent(new CustomEvent('open-command-palette'));
};

const triggerShortcutsHUD = () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
};

const titles = {
  Dashboard: ['لوحة التحكم', 'مؤشرات التشغيل والتحصيل والمخزون'],
  POS: ['شاشة المبيعات', 'نقطة البيع المباشرة والفوترة السريعة'],
  Sales: ['المبيعات والعملاء', 'سجل المبيعات والحسابات والديون'],
  Products: ['المنتجات والإنتاج', 'دليل المنتجات والأسعار وحساب التكاليف'],
  Purchases: ['المشتريات والمالية', 'فواتير الموردين وحركة المصروفات'],
  Inventory: ['المخزون والمستودعات', 'الأرصدة وحركات التحويل والتسويات'],
  Costs: ['التكاليف والربحية', 'تحليل تكاليف الأصناف ومحاكاة الربح'],
  Recipes: ['الوصفات والتصنيع', 'مكونات المنتجات وخصم المخزون التلقائي'],
  Customers: ['العملاء', 'إدارة سجلات العملاء والديون والمدفوعات'],
  Invoices: ['الفواتير', 'فواتير المبيعات وعروض الأسعار'],
  InvoiceCreate: ['فاتورة جديدة', 'إنشاء فاتورة مبيعات'],
  QuotationCreate: ['عرض أسعار', 'إنشاء عرض أسعار للعميل'],
  InvoiceDetail: ['عرض الفاتورة', 'تفاصيل الفاتورة والطباعة'],
  Expenses: ['المصروفات', 'تسجيل ومتابعة المصروفات التشغيلية'],
  Suppliers: ['الموردين', 'إدارة الموردين وأوامر الشراء'],
  Reports: ['التقارير والتحليلات', 'التحليلات التشغيلية والمالية والذكاء التنبؤي'],
  Users: ['المستخدمين', 'الصلاحيات وإدارة الوصول'],
  Settings: ['إدارة المنشأة', 'إعدادات النظام والواجهة وبيانات المنشأة'],
};

const pageTitle = computed(
  () => titles[String(route.name) as keyof typeof titles]?.[0] || companyName.value,
);
const pageSub = computed(
  () => titles[String(route.name) as keyof typeof titles]?.[1] || 'منظومة إدارة متكاملة',
);

const displayUserName = computed(
  () => authStore.user?.full_name || authStore.user?.username || 'مستخدم',
);
const userInitial = computed(() => (displayUserName.value || 'م').charAt(0));

const handleLogout = () => {
  authStore.logout();
  router.push('/login');
};

const handleOutsideClick = (e: MouseEvent) => {
  const target = e.target as Node;
  if (workspaceMenuRef.value && !workspaceMenuRef.value.contains(target)) {
    workspaceMenuOpen.value = false;
  }
  if (quickCreateRef.value && !quickCreateRef.value.contains(target)) {
    quickCreateOpen.value = false;
  }
  if (preferencesRef.value && !preferencesRef.value.contains(target)) {
    preferencesOpen.value = false;
  }
};

// ─── Network & Sync Logic ───
const syncOfflineSales = async () => {
  if (!navigator.onLine) return;
  try {
    const result = await OutboxService.processOutbox();
    appStore.pendingSyncCount = result.remainingCount;
    if (result.syncedCount > 0) {
      appStore.triggerDataRefresh();
    }
  } catch (err: any) {
    console.error('Error during background outbox sync:', err);
  }
};

const updateOnlineStatus = () => {
  appStore.isOnline = navigator.onLine;
  if (navigator.onLine) {
    syncOfflineSales();
  }
};

let alertsInterval: ReturnType<typeof setInterval> | null = null;
const loadAlertsBackground = async () => {
  if (!navigator.onLine) return;
  try {
    const res = await operationsApi.alerts();
    appStore.notifications = res.data?.alerts || [];
  } catch (e: any) {
    console.warn('Failed to load background alerts:', e);
  }
};

let syncInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  document.addEventListener('click', handleOutsideClick);
  window.addEventListener('resize', handleWindowResize);
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  updateOnlineStatus();
  localDb.getOfflineSales().then((sales: any) => {
    appStore.pendingSyncCount = sales.filter((s: any) => s.sync_status !== 'QUARANTINED').length;
    if (navigator.onLine && appStore.pendingSyncCount > 0) {
      syncOfflineSales();
    }
  });

  syncInterval = setInterval(() => {
    if (navigator.onLine && !document.hidden) {
      syncOfflineSales();
    }
  }, 30000);

  loadAlertsBackground();
  alertsInterval = setInterval(() => {
    if (!document.hidden) loadAlertsBackground();
  }, 60000);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick);
  window.removeEventListener('resize', handleWindowResize);
  window.removeEventListener('online', updateOnlineStatus);
  window.removeEventListener('offline', updateOnlineStatus);
  if (syncInterval) clearInterval(syncInterval);
  if (alertsInterval) clearInterval(alertsInterval);
});
</script>

<style lang="scss" scoped>
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: var(--sidebar-current-width, 260px);
  height: var(--navbar-height, 64px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-subtle);
  transition: right var(--transition);
}

.navbar-start {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex-shrink: 0;
}

.sidebar-toggle-btn {
  display: inline-flex;
  flex-shrink: 0;
}

@media (max-width: 992px) {
  .navbar {
    right: 0 !important;
  }
}

/* ── Workspace Context Switcher ── */
.workspace-switcher {
  position: relative;
}

.workspace-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  color: var(--color-text);
  cursor: pointer;
  transition:
    background-color var(--motion-hover),
    border-color var(--motion-hover),
    box-shadow var(--motion-hover),
    transform var(--motion-press);

  &:hover {
    background: var(--color-surface);
    border-color: var(--color-primary-border);
    box-shadow: var(--shadow-xs);
  }

  &:active {
    transform: translateY(1px);
  }
}

.workspace-icon {
  color: var(--color-primary);
  display: flex;
  align-items: center;
}

.workspace-meta {
  display: flex;
  flex-direction: column;
  text-align: right;
  line-height: 1.2;
}

.workspace-tenant {
  font-size: 0.68rem;
  color: var(--color-text-muted);
}

.workspace-location {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-text-strong);
}

.chevron-indicator {
  color: var(--color-text-muted);
}

.workspace-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 220px;
  padding: 6px;
  z-index: 1000;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-md);
}

.dropdown-header {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-text-muted);
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border-subtle);
  margin-bottom: 4px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 0.84rem;
  border-radius: var(--radius-xs);
  cursor: pointer;
  text-align: right;
  transition: background var(--transition);

  &:hover {
    background: var(--color-bg-subtle);
  }

  &.active {
    background: var(--color-primary-soft);
    color: var(--color-primary);
    font-weight: 700;
  }
}

.check-mark {
  margin-inline-start: auto;
  font-size: 0.8rem;
}

/* ── Page Info ── */
.page-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.page-title {
  font-size: 0.96rem;
  font-weight: 800;
  color: var(--color-text-strong);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.page-sub {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1100px) {
  .page-info {
    display: none;
  }
}

/* ── Navbar End ── */
.navbar-end {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-shrink: 1;
}

/* ── Command Search Trigger (Hero Command Center) ── */
.search-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 240px;
  max-width: 260px;
  min-width: 140px;
  flex-shrink: 1;
  height: 38px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    border-color var(--motion-hover),
    background-color var(--motion-hover),
    box-shadow var(--motion-hover),
    color var(--motion-hover);
  user-select: none;

  .search-icon {
    color: var(--color-text-muted);
    transition:
      color var(--motion-hover),
      transform var(--motion-hover);
  }

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-text-strong);
    background: var(--color-surface);
    box-shadow: 0 0 0 3px var(--color-primary-halo);

    .search-icon {
      color: var(--color-primary);
      transform: scale(1.1);
    }
  }

  &:focus-visible {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--focus-ring);
  }
}

.search-label {
  flex: 1;
  font-size: 0.84rem;
  font-weight: 500;
}

.command-kbd {
  font-family: var(--font-family-mono);
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 7px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-xs);
  color: var(--color-text-muted);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

@media (max-width: 1100px) {
  .search-wrap {
    min-width: 140px;
    width: auto;
    .command-kbd {
      display: none;
    }
  }
}

@media (max-width: 992px) {
  .search-wrap {
    min-width: 140px;
  }
}

@media (max-width: 768px) {
  .search-wrap {
    min-width: 38px;
    width: 38px;
    padding: 0;
    justify-content: center;
  }
  .search-label,
  .command-kbd {
    display: none;
  }
}

/* ── Quick Create ── */
.quick-create-wrap {
  position: relative;
}

.quick-create-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  font-weight: 700;
  box-shadow: var(--shadow-xs);
  transition:
    background-color var(--motion-hover),
    transform var(--motion-press),
    box-shadow var(--motion-hover);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 24%, transparent);
  }

  &:active {
    transform: translateY(1px);
    box-shadow: var(--shadow-xs);
  }
}

.quick-create-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 210px;
  padding: 6px;
  z-index: 1000;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-md);
}

/* ── Notification / Action Center ── */
.notification-btn {
  position: relative;
}

.notification-badge {
  position: absolute;
  top: -4px;
  left: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--color-danger);
  color: #ffffff;
  font-size: 0.68rem;
  font-weight: 800;
  display: grid;
  place-items: center;
  animation: badgePulseDanger 2.5s ease-in-out infinite;
}

@keyframes badgePulseDanger {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(239, 68, 68, 0);
  }
}

/* ── Preferences Dropdown ── */
.preferences-wrap {
  position: relative;
}

.preferences-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 240px;
  padding: 8px;
  z-index: 1000;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-md);
}

.pref-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 0.82rem;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: background var(--transition);

  &:hover {
    background: var(--color-bg-subtle);
  }
}

.pref-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pref-state {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}

/* ── Network Indicator ── */
.network-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: var(--radius-pill);
  background: var(--color-bg-subtle);
  font-size: 0.74rem;
  font-weight: 600;

  &.online .pulse-indicator {
    background: var(--color-success);
  }
  &.offline .pulse-indicator {
    background: var(--color-danger);
  }
}

.pulse-indicator {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.sync-badge {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-warning);
}

@media (max-width: 900px) {
  .network-status {
    display: none;
  }
}

/* ── User Chip ── */
.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 10px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-xs);
  background: var(--color-primary);
  color: #ffffff;
  display: grid;
  place-items: center;
  font-size: 0.8rem;
  font-weight: 800;
}

.user-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.1;

  strong {
    font-size: 0.8rem;
    color: var(--color-text-strong);
  }
  span {
    font-size: 0.68rem;
    color: var(--color-text-muted);
  }
}

.logout-btn {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-xs);
  display: flex;
  align-items: center;
  transition: color var(--transition);

  &:hover {
    color: var(--color-danger);
  }
}

@media (max-width: 768px) {
  .shortcuts-btn {
    display: none;
  }
}

@media (max-width: 600px) {
  .user-meta {
    display: none;
  }
  .quick-create-btn {
    padding: 0 10px;
    .btn-label {
      display: none;
    }
  }
}

@media (max-width: 480px) {
  .navbar {
    padding: 0 10px;
  }
  .navbar-start {
    gap: 8px;
  }
  .navbar-end {
    gap: 6px;
  }
  .workspace-tenant {
    display: none;
  }
}

/* Dropdown Animation */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition:
    opacity var(--motion-dropdown),
    transform var(--motion-dropdown);
}
.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
</style>

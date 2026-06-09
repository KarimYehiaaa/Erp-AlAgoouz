<template>
  <aside class="sidebar" :class="{ 'is-collapsed': !appStore.sidebarOpen }">
    <router-link to="/" class="sidebar-brand" title="الذهاب إلى لوحة التحكم">
      <AppLogo size="sm" class="brand-logo" />
      <transition name="brand-fade">
        <div v-if="appStore.sidebarOpen" class="brand-text">
          <span class="brand-name">بن العجوز</span>
          <span class="brand-sub">ERP تشغيل ومخزون ومالية</span>
        </div>
      </transition>
    </router-link>

    <nav class="sidebar-nav" aria-label="أقسام النظام">
      <section v-for="group in menuGroups" :key="group.label" class="nav-group">
        <p v-if="appStore.sidebarOpen" class="group-label">{{ group.label }}</p>
        <router-link
          v-for="item in group.items"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          active-class="active"
          :title="!appStore.sidebarOpen ? item.label : ''"
        >
          <span class="nav-icon"><AppIcon :name="item.icon" /></span>
          <transition name="label-fade">
            <span v-if="appStore.sidebarOpen" class="nav-label">{{ item.label }}</span>
          </transition>
        </router-link>
      </section>
    </nav>

    <button
      class="collapse-btn"
      type="button"
      @click="appStore.toggleSidebar"
      :title="appStore.sidebarOpen ? 'طي القائمة' : 'توسيع القائمة'"
    >
      <AppIcon :name="appStore.sidebarOpen ? 'arrowRight' : 'arrowLeft'" />
      <span v-if="appStore.sidebarOpen">طي القائمة</span>
    </button>
  </aside>
</template>

<script setup>
import AppLogo from '@/components/AppLogo.vue';
import AppIcon from '@/components/AppIcon.vue';
import { useAppStore } from '@/stores/app';

const appStore = useAppStore();

const menuGroups = [
  {
    label: 'المركز',
    items: [
      { to: '/', label: 'لوحة التحكم', icon: 'dashboard' },
      { to: '/reports', label: 'التقارير', icon: 'reports' },
    ],
  },
  {
    label: 'التشغيل',
    items: [
      { to: '/branch-sales', label: 'شاشة المبيعات', icon: 'shop' },
      { to: '/sales', label: 'المبيعات', icon: 'sales' },
      { to: '/customers', label: 'العملاء', icon: 'customers' },
      { to: '/invoices', label: 'الفواتير', icon: 'invoices' },
    ],
  },
  {
    label: 'المخزون والإنتاج',
    items: [
      { to: '/products', label: 'المنتجات', icon: 'products' },
      { to: '/inventory', label: 'المخزون', icon: 'inventory' },
      { to: '/recipes', label: 'الوصفات', icon: 'recipes' },
      { to: '/costs', label: 'التكاليف', icon: 'costs' },
    ],
  },
  {
    label: 'المالية والموردين',
    items: [
      { to: '/purchases', label: 'المشتريات', icon: 'purchases' },
      { to: '/expenses', label: 'المصروفات', icon: 'expenses' },
      { to: '/suppliers', label: 'الموردين', icon: 'suppliers' },
    ],
  },
  {
    label: 'الإدارة',
    items: [
      { to: '/users', label: 'المستخدمين', icon: 'users' },
      { to: '/settings', label: 'الإعدادات', icon: 'settings' },
    ],
  },
];
</script>

<style lang="scss" scoped>
.sidebar {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: var(--sidebar-width);
  height: 100vh;
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--sidebar-text);
  background: var(--sidebar-bg);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: -8px 0 28px rgba(15, 23, 42, 0.16);
  transition: width var(--transition), transform var(--transition);

  &.is-collapsed {
    width: var(--sidebar-collapsed);

    .sidebar-brand { justify-content: center; padding-inline: 10px; }
    .nav-group { padding-inline: 8px; }
    .nav-item { justify-content: center; padding-inline: 0; }
    .collapse-btn { justify-content: center; }
  }
}

.sidebar-brand {
  min-height: 76px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.brand-logo { flex-shrink: 0; background: #fff; }

.brand-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.brand-name {
  color: #fff;
  font-size: 1rem;
  font-weight: 900;
  line-height: 1.2;
}

.brand-sub {
  color: var(--sidebar-muted);
  font-size: 0.72rem;
  white-space: nowrap;
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
}

.nav-group {
  padding: 0 12px 10px;
}

.group-label {
  padding: 10px 8px 6px;
  color: var(--sidebar-muted);
  font-size: 0.72rem;
  font-weight: 900;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 9px 10px;
  border-radius: var(--radius-md);
  color: var(--sidebar-text);
  overflow: hidden;
  white-space: nowrap;
  transition: background var(--transition), color var(--transition), transform var(--transition);

  &:hover {
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
  }

  &.active {
    background: var(--sidebar-surface);
    color: #fff;
    box-shadow: inset -3px 0 0 var(--accent);
  }
}

.nav-icon {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: currentColor;
  background: rgba(255, 255, 255, 0.07);
  flex-shrink: 0;
}

.nav-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.9rem;
  font-weight: 700;
}

.collapse-btn {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: var(--sidebar-muted);
  cursor: pointer;
  font-weight: 800;

  &:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }
}

.brand-fade-enter-active,
.brand-fade-leave-active,
.label-fade-enter-active,
.label-fade-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.brand-fade-enter-from,
.brand-fade-leave-to,
.label-fade-enter-from,
.label-fade-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

@media (max-width: 992px) {
  .sidebar {
    width: min(84vw, 300px) !important;
    transform: translateX(100%);
  }

  .sidebar:not(.is-collapsed) {
    transform: translateX(0);
  }
}
</style>

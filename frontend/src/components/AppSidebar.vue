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
import { computed } from 'vue';
import AppLogo from '@/components/AppLogo.vue';
import AppIcon from '@/components/AppIcon.vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';

const appStore = useAppStore();
const authStore = useAuthStore();

const rawMenuGroups = [
  {
    label: 'المركز',
    items: [
      { to: '/', label: 'لوحة التحكم', icon: 'dashboard', perm: null },
      { to: '/copilot', label: 'المساعد الذكي', icon: 'copilot', perm: 'dashboard.view' },
      { to: '/reports', label: 'التقارير', icon: 'reports', perm: 'reports.view' },
      { to: '/operations', label: 'مركز التشغيل', icon: 'operations', perm: 'reports.view' },
      { to: '/forecasting', label: 'التنبؤ بالطلب', icon: 'trendingUp', perm: 'reports.view' },
    ],
  },
  {
    label: 'التشغيل',
    items: [
      { to: '/branch-sales', label: 'شاشة الكاشير (POS)', icon: 'shop', perm: null },
      { to: '/sales', label: 'سجل المبيعات والتسويات', icon: 'sales', perm: null },
      { to: '/customers', label: 'العملاء', icon: 'customers', perm: 'customers.manage' },
      { to: '/invoices', label: 'الفواتير', icon: 'invoices', perm: 'invoices.manage' },
    ],
  },
  {
    label: 'المخزون والإنتاج',
    items: [
      { to: '/products', label: 'المنتجات', icon: 'products', perm: 'products.manage' },
      { to: '/inventory', label: 'المخزون', icon: 'inventory', perm: 'inventory.manage' },
      {
        to: '/stocktakes',
        label: 'جرد المخازن والتسويات',
        icon: 'stocktake',
        perm: 'inventory.manage',
      },
      { to: '/recipes', label: 'الوصفات', icon: 'recipes', perm: 'products.manage' },
      { to: '/costs', label: 'التكاليف', icon: 'costs', perm: 'products.manage' },
    ],
  },
  {
    label: 'المالية والموردين',
    items: [
      {
        to: '/purchases',
        label: 'المشتريات والمصروفات',
        icon: 'purchases',
        perm: ['inventory.manage', 'expenses.manage'],
      },
      { to: '/suppliers', label: 'الموردين', icon: 'suppliers', perm: 'suppliers.manage' },
    ],
  },
  {
    label: 'الإدارة',
    items: [
      { to: '/hr', label: 'الموظفين والرواتب', icon: 'hr', perm: 'hr.manage' },
      { to: '/users', label: 'المستخدمين', icon: 'users', perm: 'users.manage' },
      { to: '/settings', label: 'الإعدادات', icon: 'settings', perm: 'settings.manage' },
      { to: '/admin-dashboard', label: 'مركز التحكم', icon: 'gauge', perm: 'users.manage' },
    ],
  },
];

const menuGroups = computed(() => {
  return rawMenuGroups
    .map((group) => {
      const filteredItems = group.items.filter((item) => {
        if (!item.perm) return true;
        if (Array.isArray(item.perm)) {
          return item.perm.some((p) => authStore.hasPermission(p));
        }
        return authStore.hasPermission(item.perm);
      });
      return { ...group, items: filteredItems };
    })
    .filter((group) => group.items.length > 0);
});
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
  transition:
    width var(--transition),
    transform var(--transition);

  &.is-collapsed {
    width: var(--sidebar-collapsed);

    .sidebar-brand {
      justify-content: center;
      padding-inline: 10px;
    }
    .nav-group {
      padding-inline: 8px;
    }
    .nav-item {
      justify-content: center;
      padding-inline: 0;
    }
    .collapse-btn {
      justify-content: center;
    }
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

.brand-logo {
  flex-shrink: 0;
  position: relative;
  animation: logoBreath 5.5s ease-in-out infinite;
}

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
  isolation: isolate;
  transition:
    background var(--transition),
    color var(--transition),
    transform var(--transition),
    box-shadow var(--transition);

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0;
    z-index: -1;
    background: radial-gradient(
      circle at center,
      color-mix(in srgb, var(--accent) 30%, transparent),
      transparent 75%
    );
    transform: scale(0.6);
    transition:
      opacity 280ms cubic-bezier(0.4, 0, 0.2, 1),
      transform 280ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    transform: translateX(-3px);

    &::after {
      opacity: 1;
      transform: scale(1.2);
    }
  }

  &.active {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--accent) 7%, transparent) 0%,
      var(--sidebar-surface) 100%
    );
    color: #fff;
    box-shadow:
      inset -3.5px 0 0 var(--accent),
      0 8px 24px rgba(0, 0, 0, 0.25),
      0 0 12px color-mix(in srgb, var(--accent) 15%, transparent);

    .nav-icon {
      color: #fff;
      background: linear-gradient(145deg, var(--accent), rgba(255, 255, 255, 0.15));
      box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 42%, transparent);
    }
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
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.brand-fade-enter-from,
.brand-fade-leave-to,
.label-fade-enter-from,
.label-fade-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

@keyframes logoBreath {
  0%,
  100% {
    transform: translateY(0) rotateZ(0deg);
  }
  50% {
    transform: translateY(-2px) rotateZ(-1deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .brand-logo {
    animation: none;
  }
  .nav-item,
  .nav-item::after {
    transition: none;
  }
  .nav-item:hover {
    transform: none;
  }
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

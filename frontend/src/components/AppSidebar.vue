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

<script setup lang="ts">
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
      { to: '/automation', label: 'محرك الأتمتة والوكلاء', icon: 'bot', perm: 'automation.view' },
      { to: '/reports', label: 'التقارير', icon: 'reports', perm: 'reports.view' },
      { to: '/operations', label: 'مركز التشغيل', icon: 'operations', perm: 'reports.view' },
      { to: '/forecasting', label: 'التنبؤ بالطلب', icon: 'trendingUp', perm: 'reports.view' },
    ],
  },
  {
    label: 'التشغيل والبيع',
    items: [
      { to: '/branch-sales', label: 'شاشة الكاشير (POS)', icon: 'shop', perm: 'pos.view' },
      { to: '/sales', label: 'المبيعات', icon: 'sales', perm: 'sales.view' },
      { to: '/invoices', label: 'الفواتير', icon: 'invoices', perm: 'invoices.view' },
      { to: '/customers', label: 'العملاء والمديونيات', icon: 'customers', perm: 'customers.view' },
    ],
  },
  {
    label: 'المخزون والإنتاج',
    items: [
      { to: '/products', label: 'المنتجات', icon: 'products', perm: 'products.view' },
      { to: '/menu-builder', label: 'تصميم المنيو', icon: 'quotes', perm: 'products.view' },
      { to: '/inventory', label: 'المخزون', icon: 'inventory', perm: 'inventory.view' },
      {
        to: '/stocktakes',
        label: 'جرد المخازن والتسويات',
        icon: 'stocktake',
        perm: 'inventory.view',
      },
      { to: '/recipes', label: 'الوصفات', icon: 'recipes', perm: 'recipes.view' },
      { to: '/costs', label: 'التكاليف', icon: 'costs', perm: 'recipes.view' },
    ],
  },
  {
    label: 'المالية والموردين',
    items: [
      {
        to: '/purchases',
        label: 'المشتريات والمصروفات',
        icon: 'purchases',
        perm: ['inventory.view', 'expenses.view'],
      },
      { to: '/suppliers', label: 'الموردين', icon: 'suppliers', perm: 'suppliers.view' },
      { to: '/partners', label: 'جاري ومسحوبات الشركاء', icon: 'money', perm: 'reports.view' },
    ],
  },
  {
    label: 'الإدارة',
    items: [
      { to: '/hr', label: 'الموظفين والرواتب', icon: 'hr', perm: 'hr.view' },
      { to: '/users', label: 'المستخدمين', icon: 'users', perm: 'users.view' },
      { to: '/settings', label: 'الإعدادات', icon: 'settings', perm: 'settings.view' },
      { to: '/admin-dashboard', label: 'مركز التحكم', icon: 'gauge', perm: 'users.view' },
    ],
  },
];

const menuGroups = computed(() => {
  return rawMenuGroups
    .map((group: any) => {
      const filteredItems = group.items.filter((item: any) => {
        if (!item.perm) return true;
        if (Array.isArray(item.perm)) {
          return item.perm.some((p: any) => authStore.hasPermission(p));
        }
        return authStore.hasPermission(item.perm);
      });
      return { ...group, items: filteredItems };
    })
    .filter((group: any) => group.items.length > 0);
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
  color: #f5e6d0;
  font-size: 1.05rem;
  font-weight: 800;
  line-height: 1.2;
}

.brand-sub {
  color: var(--accent);
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
  color: rgba(245, 230, 208, 0.55);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.3px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 9px 10px;
  border-radius: var(--radius-md);
  color: rgba(253, 248, 243, 0.82);
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
    background: radial-gradient(circle at center, rgba(200, 149, 110, 0.25), transparent 75%);
    transform: scale(0.6);
    transition:
      opacity 280ms cubic-bezier(0.4, 0, 0.2, 1),
      transform 280ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  &:hover {
    background: rgba(255, 255, 255, 0.09);
    color: #fff;
    transform: translateX(-3px);

    &::after {
      opacity: 1;
      transform: scale(1.2);
    }
  }

  &.active {
    background: linear-gradient(135deg, rgba(200, 149, 110, 0.22) 0%, rgba(61, 34, 20, 0.85) 100%);
    color: #fff;
    box-shadow:
      inset -3.5px 0 0 var(--accent),
      0 6px 20px rgba(0, 0, 0, 0.25),
      0 0 12px rgba(200, 149, 110, 0.15);

    .nav-icon {
      color: #fff;
      background: linear-gradient(145deg, var(--accent), var(--accent-dark));
      box-shadow: 0 0 14px rgba(200, 149, 110, 0.4);
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

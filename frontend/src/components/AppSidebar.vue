<template>
  <aside
    class="sidebar"
    :class="{
      'is-expanded': isExpanded,
      'is-collapsed': !isExpanded,
    }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <router-link
      to="/"
      class="sidebar-brand"
      title="الذهاب إلى لوحة التحكم"
      @click="handleItemClick"
    >
      <AppLogo size="sm" class="brand-logo" />
      <transition name="brand-fade">
        <div v-if="isExpanded" class="brand-text">
          <span class="brand-name">بن العجوز</span>
          <span class="brand-sub">ERP تشغيل ومخزون ومالية</span>
        </div>
      </transition>
    </router-link>

    <nav class="sidebar-nav" aria-label="أقسام النظام">
      <section v-for="group in menuGroups" :key="group.label" class="nav-group">
        <p v-if="isExpanded" class="group-label">{{ group.label }}</p>
        <router-link
          v-for="item in group.items"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          active-class="active"
          :title="!isExpanded ? item.label : ''"
          @click="handleItemClick"
        >
          <span class="nav-icon"><AppIcon :name="item.icon" /></span>
          <transition name="label-fade">
            <span v-if="isExpanded" class="nav-label">{{ item.label }}</span>
          </transition>
        </router-link>
      </section>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import AppLogo from '@/components/AppLogo.vue';
import AppIcon from '@/components/AppIcon.vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';

const appStore = useAppStore();
const authStore = useAuthStore();

const isHovered = ref(false);
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200);

function updateWindowWidth() {
  windowWidth.value = window.innerWidth;
}

onMounted(() => {
  window.addEventListener('resize', updateWindowWidth);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateWindowWidth);
});

const isMobile = computed(() => windowWidth.value <= 992);

const isExpanded = computed(() => {
  if (isMobile.value) {
    return appStore.sidebarOpen;
  }
  return isHovered.value;
});

function handleMouseEnter() {
  if (!isMobile.value) {
    isHovered.value = true;
  }
}

function handleMouseLeave() {
  if (!isMobile.value) {
    isHovered.value = false;
  }
}

function handleItemClick() {
  isHovered.value = false;
  if (isMobile.value && appStore.sidebarOpen) {
    appStore.sidebarOpen = false;
  }
}

const rawMenuGroups = [
  {
    label: 'الرئيسية',
    items: [
      { to: '/', label: 'لوحة التحكم', icon: 'dashboard', perm: null },
      { to: '/branch-sales', label: 'الكاشير المباشر (POS)', icon: 'shop', perm: 'pos.view' },
    ],
  },
  {
    label: 'مراكز العمليات',
    items: [
      { to: '/sales', label: 'المبيعات والعملاء', icon: 'sales', perm: 'sales.view' },
      { to: '/inventory', label: 'المخزون والمستودعات', icon: 'inventory', perm: 'inventory.view' },
      {
        to: '/products',
        label: 'المنتجات والإنتاج والوصفات',
        icon: 'products',
        perm: 'products.view',
      },
      {
        to: '/purchases',
        label: 'المالية والمشتريات والموردين',
        icon: 'purchases',
        perm: ['inventory.view', 'expenses.view', 'suppliers.view', 'reports.view'],
      },
      {
        to: '/reports',
        label: 'التقارير والتحليلات والذكاء',
        icon: 'reports',
        perm: 'reports.view',
      },
      {
        to: '/settings',
        label: 'إدارة النظام والموظفين',
        icon: 'settings',
        perm: 'settings.view',
      },
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
  width: var(--sidebar-collapsed, 68px);
  height: 100vh;
  z-index: 150;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  color: var(--sidebar-text);
  background: var(--sidebar-bg);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: -4px 0 20px rgba(15, 23, 42, 0.12);
  transition:
    width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.28s;
  will-change: width, transform;

  &.is-expanded {
    width: var(--sidebar-width, 280px);
    box-shadow: -14px 0 38px rgba(0, 0, 0, 0.35);
    z-index: 250;
  }

  &.is-collapsed {
    .sidebar-brand {
      justify-content: center;
      padding-inline: 8px;
    }
    .nav-group {
      padding-inline: 8px;
    }
    .nav-item {
      justify-content: center;
      padding-inline: 0;
    }
  }
}

.sidebar-brand {
  min-height: 72px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  text-decoration: none;
  flex-shrink: 0;
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
  text-decoration: none;
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
    z-index: 250;
    box-shadow: -14px 0 38px rgba(0, 0, 0, 0.45);

    &.is-expanded {
      transform: translateX(0);
    }
  }
}
</style>

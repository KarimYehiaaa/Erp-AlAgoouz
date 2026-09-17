<template>
  <aside
    class="sidebar"
    :class="{
      'is-expanded': isExpanded,
      'is-collapsed': !isExpanded,
      'is-pinned': appStore.sidebarPinned,
    }"
    aria-label="شريط التنقل الرئيسي"
  >
    <!-- Brand Header with Pin/Unpin Toggle -->
    <div class="sidebar-header">
      <router-link
        to="/"
        class="sidebar-brand"
        title="الذهاب إلى لوحة التحكم"
        @click="handleItemClick"
      >
        <AppLogo size="sm" class="brand-logo" />
        <transition name="brand-fade">
          <div v-if="isExpanded" class="brand-text">
            <div class="brand-name-wrap">
              <span class="brand-name">{{ companyName }}</span>
              <span class="brand-live-dot" title="النظام متصل ونشط"></span>
            </div>
            <span class="brand-sub">{{ tagline }}</span>
          </div>
        </transition>
      </router-link>

      <!-- Desktop Pin / Collapse toggle -->
      <button
        v-if="!isMobile && isExpanded"
        type="button"
        class="pin-toggle-btn"
        :class="{ active: appStore.sidebarPinned }"
        title="تصغير الشريط الجانبي"
        aria-label="تصغير الشريط الجانبي"
        @click.stop="appStore.toggleSidebarPinned"
      >
        <AppIcon name="arrowRight" :size="14" />
      </button>

      <!-- Desktop Expand toggle when collapsed -->
      <button
        v-if="!isMobile && !isExpanded"
        type="button"
        class="pin-toggle-btn collapsed-expand-btn"
        title="توسيع وتثبيت الشريط الجانبي"
        aria-label="توسيع وتثبيت الشريط الجانبي"
        @click.stop="appStore.toggleSidebarPinned"
      >
        <AppIcon name="arrowLeft" :size="14" />
      </button>

      <!-- Mobile Close Button -->
      <button
        v-if="isMobile && isExpanded"
        type="button"
        class="mobile-close-btn"
        title="إغلاق القائمة"
        aria-label="إغلاق القائمة"
        @click.stop="handleCloseMobile"
      >
        <AppIcon name="close" :size="16" />
      </button>
    </div>

    <!-- Navigation List with Semantic Hierarchy -->
    <nav class="sidebar-nav" aria-label="أقسام النظام">
      <section v-for="group in menuGroups" :key="group.label" class="nav-group">
        <p v-if="isExpanded" class="group-label">{{ group.label }}</p>
        <div v-else class="group-divider" aria-hidden="true"></div>

        <router-link
          v-for="item in group.items"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          active-class="active"
          :title="!isExpanded ? item.label : ''"
          :data-tooltip="item.label"
          @click="handleItemClick"
        >
          <span class="active-rail" aria-hidden="true"></span>
          <span class="nav-icon"><AppIcon :name="item.icon" :size="18" /></span>
          <transition name="label-fade">
            <span v-if="isExpanded" class="nav-label">{{ item.label }}</span>
          </transition>
          <span v-if="item.badge && isExpanded" class="nav-badge">{{ item.badge }}</span>
        </router-link>
      </section>
    </nav>

    <!-- Sidebar Bottom User Profile Area -->
    <div class="sidebar-user-area">
      <div
        v-if="!isExpanded"
        class="user-avatar-mini"
        :title="`${userName} (اضغط للتوسيع)`"
        @click="!isMobile && appStore.toggleSidebarPinned()"
      >
        {{ userInitial }}
      </div>
      <div v-else class="user-profile-expanded">
        <div class="user-avatar">{{ userInitial }}</div>
        <div class="user-info">
          <span class="user-name">{{ userName }}</span>
          <span class="user-role">{{ roleName }}</span>
        </div>
        <button
          v-if="!appStore.sidebarPinned && !isMobile"
          type="button"
          class="expand-rail-btn"
          title="تثبيت الشريط الجانبي"
          @click="appStore.toggleSidebarPinned"
        >
          <AppIcon name="maximize" :size="14" />
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import AppLogo from '@/components/AppLogo.vue';
import AppIcon from '@/components/AppIcon.vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { brandingState } from '@/design-system/themes/themeEngine';

const appStore = useAppStore();
const authStore = useAuthStore();

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
  return appStore.sidebarPinned;
});

function handleItemClick() {
  if (isMobile.value && appStore.sidebarOpen) {
    appStore.sidebarOpen = false;
  }
}

function handleCloseMobile() {
  appStore.sidebarOpen = false;
}

const companyName = computed(() => brandingState.companyName || 'منظومة الإدارة');
const tagline = computed(() => brandingState.tagline || 'نظام التشغيل المؤسسي');

const userName = computed(() => authStore.user?.username || 'مستخدم');
const userInitial = computed(() => (userName.value ? userName.value.charAt(0).toUpperCase() : 'U'));
const roleName = computed(() => authStore.user?.role_name_ar || 'مسؤول النظام');

const rawMenuGroups = [
  {
    label: 'نظرة عامة',
    items: [
      { to: '/', label: 'لوحة التحكم', icon: 'dashboard', perm: null },
      { to: '/branch-sales', label: 'شاشة المبيعات (POS)', icon: 'shop', perm: 'pos.view' },
    ],
  },
  {
    label: 'العمليات التشغيلية',
    items: [
      { to: '/sales', label: 'المبيعات والعملاء', icon: 'sales', perm: 'sales.view' },
      { to: '/inventory', label: 'المخزون والمستودعات', icon: 'inventory', perm: 'inventory.view' },
      {
        to: '/products',
        label: 'المنتجات والإنتاج والتكاليف',
        icon: 'products',
        perm: 'products.view',
      },
    ],
  },
  {
    label: 'المالية والمشتريات',
    items: [
      {
        to: '/purchases',
        label: 'المشتريات والمصروفات والشركاء',
        icon: 'purchases',
        perm: ['inventory.view', 'expenses.view', 'suppliers.view', 'reports.view'],
      },
    ],
  },
  {
    label: 'الذكاء والتقارير',
    items: [
      {
        to: '/reports',
        label: 'التقارير والتحليلات والذكاء',
        icon: 'reports',
        perm: 'reports.view',
      },
    ],
  },
  {
    label: 'الإدارة والنظام',
    items: [
      {
        to: '/settings',
        label: 'إدارة المنشأة والإعدادات',
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
  left: auto;
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
  background: linear-gradient(
    180deg,
    var(--sidebar-bg) 0%,
    color-mix(in srgb, var(--sidebar-surface) 65%, var(--sidebar-bg)) 100%
  );
  border-left: 1px solid var(--sidebar-border);
  border-right: none;
  box-shadow: -4px 0 28px rgba(2, 6, 23, 0.28);
  transition: width var(--transition);
  will-change: width;

  &.is-expanded {
    width: var(--sidebar-width, 260px);
    box-shadow: -8px 0 32px rgba(2, 6, 23, 0.35);
  }

  &.is-collapsed {
    .sidebar-header {
      justify-content: center;
      padding: 14px 6px;
      gap: 6px;
    }
    .nav-group {
      padding: 0 6px;
      align-items: center;
    }
    .nav-item {
      justify-content: center;
      width: 44px;
      height: 44px;
      padding: 0;
      margin: 2px auto;
      border-radius: var(--radius-md);
      position: relative;

      &:hover {
        transform: scale(1.08);
        background: rgba(255, 255, 255, 0.1);
      }

      .active-rail {
        left: 0;
        right: auto;
        top: 8px;
        bottom: 8px;
      }

      &.active {
        background: var(--color-primary);
        color: #ffffff;
        box-shadow: 0 0 16px var(--color-primary-glow);

        .nav-icon {
          color: #ffffff;
          transform: scale(1.08);
        }
      }

      /* RTL Tooltip: pops out to the LEFT into available viewport */
      &::after {
        content: attr(data-tooltip);
        position: absolute;
        right: calc(100% + 12px);
        top: 50%;
        transform: translateY(-50%);
        padding: 6px 12px;
        border-radius: var(--radius-sm);
        background: var(--color-surface-overlay, #0f172a);
        color: #ffffff;
        font-size: 0.78rem;
        font-weight: 700;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        transition:
          opacity 0.15s ease,
          transform 0.15s ease;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.1);
        z-index: 1000;
      }

      &:hover::after {
        opacity: 1;
        visibility: visible;
        transform: translateY(-50%) translateX(-4px);
      }
    }

    .group-divider {
      width: 20px;
      height: 2px;
      background: var(--sidebar-border);
      margin: 8px auto;
      border-radius: 2px;
    }
  }
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  min-height: 64px;
  border-bottom: 1px solid var(--sidebar-border);
  background: rgba(255, 255, 255, 0.02);
  gap: 8px;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: inherit;
  min-width: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.brand-name-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.brand-name {
  font-size: 0.96rem;
  font-weight: 800;
  white-space: nowrap;
  color: #ffffff;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  overflow: hidden;
}

.brand-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 8px var(--color-success);
  animation: beaconPulse 2.5s infinite;
  flex-shrink: 0;
}

@keyframes beaconPulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.85);
  }
}

.brand-sub {
  font-size: 0.7rem;
  color: var(--sidebar-muted);
  white-space: nowrap;
  font-weight: 500;
}

.pin-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: var(--sidebar-muted);
  cursor: pointer;
  transition: all var(--transition);

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.16);
  }
}

.sidebar-nav {
  flex: 1;
  padding: 14px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 12px;
}

.group-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sidebar-muted);
  padding: 10px 12px 4px;
  margin: 0;
  opacity: 0.9;

  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: color-mix(in srgb, var(--sidebar-border) 60%, transparent);
  }
}

.group-divider {
  height: 1px;
  background: var(--sidebar-border);
  margin: 8px 6px;
  opacity: 0.7;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: var(--radius-md);
  color: var(--sidebar-muted);
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 600;
  border: 1px solid transparent;
  transition:
    background-color var(--motion-hover),
    color var(--motion-hover),
    transform var(--motion-hover),
    border-color var(--motion-hover);
  position: relative;
  overflow: hidden;

  .active-rail {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 0;
    right: auto;
    width: 4px;
    border-radius: 0 4px 4px 0;
    background: var(--color-primary);
    opacity: 0;
    transform: scaleY(0.3);
    transition:
      opacity var(--motion-hover),
      transform var(--motion-hover);
    box-shadow: 0 0 10px var(--color-primary-glow);
  }

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    transform: translateX(-3px);
    border-color: rgba(255, 255, 255, 0.05);

    .nav-icon {
      color: var(--color-primary);
      transform: scale(1.1);
    }
  }

  &.active {
    background: linear-gradient(270deg, rgba(29, 78, 216, 0.28) 0%, rgba(29, 78, 216, 0.12) 100%);
    color: #ffffff;
    font-weight: 700;
    border-color: rgba(59, 130, 246, 0.35);
    box-shadow: inset 0 0 12px rgba(29, 78, 216, 0.15);

    .active-rail {
      opacity: 1;
      transform: scaleY(1);
    }

    .nav-icon {
      color: #ffffff;
      transform: none;
      filter: drop-shadow(0 0 6px var(--color-primary-glow));
    }
  }
}

.nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  transition:
    color var(--motion-hover),
    transform var(--motion-hover);
}

.nav-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: #ffffff;
  animation: badgeFadeIn var(--motion-dropdown) cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes badgeFadeIn {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* ── Bottom User Profile ── */
.sidebar-user-area {
  padding: 12px 14px;
  border-top: 1px solid var(--sidebar-border);
  background: rgba(0, 0, 0, 0.2);
}

.user-avatar-mini {
  width: 38px;
  height: 38px;
  margin: 0 auto;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #ffffff;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 0.9rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.user-profile-expanded {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #ffffff;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 0.88rem;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.user-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 0.84rem;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: 0.72rem;
  color: var(--sidebar-muted);
  white-space: nowrap;
}

.expand-rail-btn {
  background: transparent;
  border: none;
  color: var(--sidebar-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-xs);

  &:hover {
    color: #ffffff;
  }
}

.mobile-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: var(--sidebar-muted);
  cursor: pointer;
  transition: all var(--transition);

  &:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #ffffff;
  }
}

.collapsed-expand-btn {
  width: 28px;
  height: 28px;
  margin: 0 auto;
}

/* Transitions */
.brand-fade-enter-active,
.brand-fade-leave-active,
.label-fade-enter-active,
.label-fade-leave-active {
  transition: opacity var(--transition);
}
.brand-fade-enter-from,
.brand-fade-leave-to,
.label-fade-enter-from,
.label-fade-leave-to {
  opacity: 0;
}

@media (max-width: 992px) {
  .sidebar {
    right: 0 !important;
    left: auto !important;
    transform: translateX(100%);
    width: 280px !important;
    max-width: 85vw;
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.45);
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);

    &.is-expanded {
      transform: translateX(0);
    }
  }
}
</style>

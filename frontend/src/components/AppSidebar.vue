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
            <span class="brand-name">{{ companyName }}</span>
            <span class="brand-sub">{{ tagline }}</span>
          </div>
        </transition>
      </router-link>

      <button
        v-if="!isMobile && isExpanded"
        type="button"
        class="pin-toggle-btn"
        :class="{ active: appStore.sidebarPinned }"
        :title="appStore.sidebarPinned ? 'إلغاء تثبيت الشريط (تصغير)' : 'تثبيت الشريط ممتداً'"
        :aria-label="appStore.sidebarPinned ? 'إلغاء تثبيت الشريط الجانبي' : 'تثبيت الشريط الجانبي'"
        @click.stop="appStore.toggleSidebarPinned"
      >
        <AppIcon :name="appStore.sidebarPinned ? 'arrowRight' : 'arrowLeft'" :size="14" />
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
          @click="handleItemClick"
        >
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
      <div v-if="!isExpanded" class="user-avatar-mini" :title="userName">
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
  border-left: 1px solid var(--sidebar-border);
  box-shadow: -2px 0 12px rgba(15, 23, 42, 0.08);
  transition: width var(--transition);
  will-change: width;

  &.is-expanded {
    width: var(--sidebar-width, 260px);
    box-shadow: -6px 0 24px rgba(15, 23, 42, 0.12);
  }

  &.is-collapsed {
    .sidebar-header {
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

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  min-height: 64px;
  border-bottom: 1px solid var(--sidebar-border);
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

.brand-name {
  font-size: 0.95rem;
  font-weight: 800;
  white-space: nowrap;
  color: var(--sidebar-text);
  text-overflow: ellipsis;
  overflow: hidden;
}

.brand-sub {
  font-size: 0.72rem;
  color: var(--sidebar-muted);
  white-space: nowrap;
}

.pin-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--sidebar-muted);
  cursor: pointer;
  transition: all var(--transition);

  &:hover {
    background: var(--sidebar-hover-bg);
    color: var(--sidebar-text);
  }
}

.sidebar-nav {
  flex: 1;
  padding: 12px 0;
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
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--sidebar-muted);
  padding: 6px 12px 4px;
  margin: 0;
}

.group-divider {
  height: 1px;
  background: var(--sidebar-border);
  margin: 8px 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  color: var(--sidebar-muted);
  text-decoration: none;
  font-size: 0.86rem;
  font-weight: 600;
  transition: all var(--transition);
  position: relative;

  &:hover {
    background: var(--sidebar-hover-bg);
    color: var(--sidebar-text);
  }

  &.active {
    background: var(--sidebar-active-bg);
    color: var(--sidebar-active-text);
    font-weight: 700;

    .nav-icon {
      color: var(--sidebar-active-text);
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
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: #ffffff;
}

/* ── Bottom User Profile ── */
.sidebar-user-area {
  padding: 12px 14px;
  border-top: 1px solid var(--sidebar-border);
  background: var(--sidebar-surface);
}

.user-avatar-mini {
  width: 38px;
  height: 38px;
  margin: 0 auto;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #ffffff;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 0.9rem;
}

.user-profile-expanded {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #ffffff;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 0.88rem;
  flex-shrink: 0;
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
  color: var(--sidebar-text);
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
    color: var(--sidebar-text);
  }
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
    transform: translateX(100%);
    width: 260px !important;

    &.is-expanded {
      transform: translateX(0);
    }
  }
}
</style>

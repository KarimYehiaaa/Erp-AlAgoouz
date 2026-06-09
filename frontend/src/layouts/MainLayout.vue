<template>
  <div class="layout" :class="{ 'sidebar-collapsed': !appStore.sidebarOpen }">
    <AppSidebar />
    <div class="layout-main">
      <AppNavbar />
      <main class="layout-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup>
import AppSidebar from '@/components/AppSidebar.vue';
import AppNavbar from '@/components/AppNavbar.vue';
import { useAppStore } from '@/stores/app';
const appStore = useAppStore();
</script>

<style lang="scss" scoped>
.layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
}

.layout-main {
  flex: 1;
  margin-right: var(--sidebar-current-width, var(--sidebar-width));
  transition: margin var(--transition);
  min-width: 0;
}

.sidebar-collapsed .layout-main { margin-right: var(--sidebar-collapsed); }

.layout-content {
  padding: clamp(16px, 2vw, 28px);
  padding-top: calc(var(--navbar-height) + 20px);
  min-height: calc(100vh - var(--navbar-height));
}

@media (max-width: 992px) {
  .layout-main { margin-right: 0; }
}
</style>

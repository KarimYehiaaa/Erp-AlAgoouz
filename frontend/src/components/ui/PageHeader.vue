<template>
  <div class="page-header" :class="{ 'page-header-border': border }">
    <div class="page-header-main">
      <!-- Back button -->
      <button
        v-if="showBack"
        class="ph-back-btn"
        type="button"
        @click="$router.back()"
        title="رجوع"
      >
        <AppIcon name="arrowRight" :size="18" />
      </button>

      <!-- Icon -->
      <div v-if="icon" class="ph-icon">
        <AppIcon :name="icon" :size="22" />
      </div>

      <!-- Title & Sub -->
      <div class="ph-text">
        <h1 class="ph-title">{{ title }}</h1>
        <p v-if="subtitle" class="ph-subtitle">{{ subtitle }}</p>
      </div>

      <!-- Breadcrumbs -->
      <nav v-if="breadcrumbs?.length" class="ph-breadcrumbs" aria-label="مسار التنقل">
        <template v-for="(crumb, i) in breadcrumbs" :key="i">
          <router-link v-if="crumb.to" :to="crumb.to" class="ph-crumb">{{
            crumb.label
          }}</router-link>
          <span v-else class="ph-crumb ph-crumb-current">{{ crumb.label }}</span>
          <span v-if="i < breadcrumbs.length - 1" class="ph-crumb-sep">/</span>
        </template>
      </nav>
    </div>

    <!-- Actions -->
    <div v-if="$slots.actions" class="ph-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Breadcrumb {
  label: string;
  to?: string;
}

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    icon?: string;
    showBack?: boolean;
    border?: boolean;
    breadcrumbs?: Breadcrumb[] | null;
  }>(),
  {
    subtitle: '',
    icon: '',
    showBack: false,
    border: true,
    breadcrumbs: null,
  },
);
</script>

<style lang="scss" scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0 16px;
  flex-wrap: wrap;

  &.page-header-border {
    border-bottom: 1px solid var(--border);
    margin-bottom: 20px;
  }
}

.page-header-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex-wrap: wrap;
}

.ph-back-btn {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;

  &:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
}

.ph-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--primary);
  flex-shrink: 0;
}

.ph-text {
  min-width: 0;
  line-height: 1.2;
}

.ph-title {
  font-size: 1.15rem;
  font-weight: 900;
  color: var(--text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ph-subtitle {
  margin-top: 3px;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.ph-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  color: var(--text-muted);
  flex-wrap: wrap;
}

.ph-crumb {
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.15s;

  &:hover {
    color: var(--primary);
  }
  &.ph-crumb-current {
    color: var(--text-strong);
    font-weight: 600;
  }
}

.ph-crumb-sep {
  opacity: 0.5;
}

.ph-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
</style>

<template>
  <div class="quick-fab-container" :class="{ open: isOpen }">
    <!-- قائمة الإجراءات السريعة المتفرعة -->
    <div class="fab-menu" v-if="isOpen">
      <RouterLink
        to="/pos"
        class="fab-action-btn"
        title="شاشة الكاشير السريع (POS)"
        @click="isOpen = false"
      >
        <span class="fab-label">كاشير المحل</span>
        <div class="fab-icon-box primary">
          <AppIcon name="shop" :size="18" />
        </div>
      </RouterLink>

      <RouterLink
        to="/purchases?tab=expenses"
        class="fab-action-btn"
        title="تسجيل مصروف جديد"
        @click="isOpen = false"
      >
        <span class="fab-label">تسجيل مصروف</span>
        <div class="fab-icon-box warning">
          <AppIcon name="expenses" :size="18" />
        </div>
      </RouterLink>

      <RouterLink
        to="/inventory?tab=movements"
        class="fab-action-btn"
        title="تحويل مخزني أو صرف مواد"
        @click="isOpen = false"
      >
        <span class="fab-label">صرف خامات / تحويل</span>
        <div class="fab-icon-box info">
          <AppIcon name="inventory" :size="18" />
        </div>
      </RouterLink>

      <button
        type="button"
        class="fab-action-btn"
        title="البحث السريع في النظام (Ctrl+K)"
        @click="triggerCommandPalette"
      >
        <span class="fab-label">البحث الشامل</span>
        <div class="fab-icon-box accent">
          <AppIcon name="search" :size="18" />
        </div>
      </button>
    </div>

    <!-- الزر الرئيسي العائم -->
    <button
      type="button"
      class="fab-trigger-btn"
      :class="{ active: isOpen }"
      :title="isOpen ? 'إغلاق الإجراءات السريعة' : 'إجراءات تشغيلية سريعة'"
      @click="isOpen = !isOpen"
    >
      <AppIcon :name="isOpen ? 'close' : 'plus'" :size="24" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const isOpen = ref(false);

const triggerCommandPalette = () => {
  isOpen.value = false;
  // إطلاق حدث لوحة الأوامر العامة
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
};
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.quick-fab-container {
  position: fixed;
  bottom: 28px;
  left: 28px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.fab-trigger-btn {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent) 0%, var(--primary) 100%);
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 24px rgba(138, 87, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.25s ease;

  &:hover {
    transform: scale(1.08) translateY(-2px);
    box-shadow: 0 12px 30px rgba(138, 87, 42, 0.55);
  }

  &.active {
    transform: rotate(45deg);
    background: var(--danger);
  }
}

.fab-menu {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  animation: fabFadeUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fabFadeUp {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.fab-action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-decoration: none;

  .fab-label {
    padding: 4px 10px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 700;
    color: var(--text-strong);
    box-shadow: var(--shadow-sm);
    white-space: nowrap;
  }

  .fab-icon-box {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-sm);
    border: 1px solid rgba(255, 255, 255, 0.15);
    transition: transform 0.2s ease;

    &.primary {
      background: var(--primary);
      color: #fff;
    }
    &.warning {
      background: var(--warning);
      color: #fff;
    }
    &.info {
      background: var(--info);
      color: #fff;
    }
    &.accent {
      background: var(--accent);
      color: #fff;
    }
  }

  &:hover .fab-icon-box {
    transform: scale(1.1);
  }
}
</style>

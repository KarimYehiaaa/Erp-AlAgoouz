<template>
  <div class="skeleton-loader-container" :class="{ 'animate-shimmer': animated }">
    <!-- Table Skeleton Layout -->
    <div v-if="type === 'table'" class="skeleton-table">
      <div class="skeleton-row skeleton-header">
        <div
          v-for="c in cols"
          :key="'h-' + c"
          class="skeleton-cell shimmer"
          :style="{ height: '24px' }"
        ></div>
      </div>
      <div v-for="r in rows" :key="'r-' + r" class="skeleton-row">
        <div
          v-for="c in cols"
          :key="'c-' + r + '-' + c"
          class="skeleton-cell shimmer"
          :style="{ height: '20px' }"
        ></div>
      </div>
    </div>

    <!-- List Skeleton Layout -->
    <div v-else-if="type === 'list'" class="skeleton-list">
      <div v-for="i in count" :key="i" class="skeleton-list-item">
        <div class="skeleton-circle shimmer"></div>
        <div class="skeleton-list-content">
          <div class="skeleton-line shimmer w-3/4"></div>
          <div class="skeleton-line shimmer w-1/2"></div>
        </div>
      </div>
    </div>

    <!-- Metric Card Skeleton Layout -->
    <div v-else-if="type === 'card'" class="skeleton-card-layout">
      <div v-for="i in count" :key="i" class="skeleton-card-item shimmer">
        <div class="card-icon-skeleton shimmer"></div>
        <div class="card-label-skeleton shimmer"></div>
        <div class="card-value-skeleton shimmer"></div>
        <div class="card-sub-skeleton shimmer"></div>
      </div>
    </div>

    <!-- Default generic shape (line, circle, box, etc.) -->
    <div v-else class="skeleton-generic-group">
      <div
        v-for="i in count"
        :key="i"
        class="skeleton-item shimmer"
        :class="type"
        :style="customStyle"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
  type: {
    type: String,
    default: 'line', // 'line' | 'circle' | 'card' | 'table' | 'list' | 'box'
    validator: (value: string) =>
      ['line', 'circle', 'card', 'table', 'list', 'box'].includes(value),
  },
  count: {
    type: Number,
    default: 1,
  },
  animated: {
    type: Boolean,
    default: true,
  },
  rows: {
    type: Number,
    default: 4,
  },
  cols: {
    type: Number,
    default: 4,
  },
  width: {
    type: String,
    default: null,
  },
  height: {
    type: String,
    default: null,
  },
  radius: {
    type: String,
    default: null,
  },
});

const customStyle = computed(() => {
  const styles: Record<string, string> = {};
  if (props.width) styles.width = props.width;
  if (props.height) styles.height = props.height;
  if (props.radius) styles.borderRadius = props.radius;
  return styles;
});
</script>

<style lang="scss" scoped>
.skeleton-loader-container {
  width: 100%;
}

.shimmer {
  background: linear-gradient(90deg, var(--bg-soft) 25%, var(--border) 37%, var(--bg-soft) 63%);
  background-size: 400% 100%;
  animation: shimmer-load 1.4s ease infinite;
}

@keyframes shimmer-load {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.skeleton-item {
  background: var(--bg-soft);

  &.line {
    height: 14px;
    width: 100%;
    margin-bottom: 8px;
    border-radius: var(--radius-xs);
  }

  &.circle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
  }

  &.box {
    width: 100%;
    height: 150px;
    border-radius: var(--radius-md);
  }
}

/* List Style */
.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.skeleton-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--bg-soft);
}

.skeleton-list-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skeleton-line {
  height: 12px;
  background: var(--bg-soft);
  border-radius: var(--radius-xs);

  &.w-3\/4 {
    width: 75%;
  }
  &.w-1\/2 {
    width: 50%;
  }
}

/* Card Style */
.skeleton-card-layout {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.skeleton-card-item {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 112px;
}

.card-icon-skeleton {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs);
  background: var(--bg-soft);
}

.card-label-skeleton {
  width: 45%;
  height: 12px;
  border-radius: var(--radius-xs);
  background: var(--bg-soft);
}

.card-value-skeleton {
  width: 60%;
  height: 22px;
  border-radius: var(--radius-xs);
  background: var(--bg-soft);
}

.card-sub-skeleton {
  width: 30%;
  height: 10px;
  border-radius: var(--radius-xs);
  background: var(--bg-soft);
}

/* Table Style */
.skeleton-table {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-card);
}

.skeleton-row {
  display: flex;
  border-bottom: 1px solid var(--border);
  padding: 12px 16px;
  gap: 16px;

  &:last-child {
    border-bottom: none;
  }

  &.skeleton-header {
    background: var(--bg-soft);
  }
}

.skeleton-cell {
  flex: 1;
  background: var(--bg-soft);
  border-radius: var(--radius-xs);
}

@media (prefers-reduced-motion: reduce) {
  .shimmer {
    animation: none !important;
    background: var(--bg-soft) !important;
  }
}
</style>

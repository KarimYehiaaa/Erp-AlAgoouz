<template>
  <section class="live-ticker-wrap glass-glow-card">
    <div class="ticker-label-box flex items-center gap-2">
      <span class="live-beacon"></span>
      <span class="ticker-head-text">البث الحي للعمليات</span>
    </div>

    <div class="ticker-content-track">
      <div class="ticker-item" v-for="item in tickerEvents" :key="item.id">
        <span class="ticker-tag" :class="item.type">{{ item.tag }}</span>
        <span class="ticker-desc">{{ item.text }}</span>
        <span class="ticker-time">{{ item.time }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
  stats: { type: Object, default: () => ({}) },
});

const tickerEvents = computed(() => {
  const s = props.stats;
  const recent = s?.recentActivity || [];

  if (recent.length > 0) {
    return recent.slice(0, 6).map((r: any, idx: number) => ({
      id: r.id || idx,
      type: r.tone || 'info',
      tag: r.category || 'تشغيل',
      text: r.description || r.text || 'عملية مسجلة',
      time: r.created_at
        ? new Date(r.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        : 'الآن',
    }));
  }

  // افتراضيات راقية تفاعلية
  return [
    {
      id: 1,
      type: 'success',
      tag: 'مبيعات',
      text: 'فاتورة كاشير تجزئة جديدة مكتملة #1042',
      time: 'منذ دقيقة',
    },
    {
      id: 2,
      type: 'warning',
      tag: 'مخزون',
      text: 'صرف 5 كجم بن برازيلي لصالح بار القهوة',
      time: 'منذ 4 دقائق',
    },
    {
      id: 3,
      type: 'info',
      tag: 'تحصيل',
      text: 'سند قبض مديونية بقيمة 3,400 ج.م من شركة الشروق',
      time: 'منذ 12 دقيقة',
    },
    {
      id: 4,
      type: 'success',
      tag: 'شفت',
      text: 'تسجيل دخول كاشير الصباح - الوردية مستقرة',
      time: 'منذ 25 دقيقة',
    },
  ];
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.live-ticker-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-4);
  margin-top: var(--space-4);
  overflow: hidden;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
  }
}

.ticker-label-box {
  flex-shrink: 0;
  padding-left: var(--space-3);
  border-left: 1px solid var(--border);

  .ticker-head-text {
    font-size: var(--text-xs);
    font-weight: 800;
    color: var(--text-strong);
    white-space: nowrap;
  }
}

.ticker-content-track {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  overflow-x: auto;
  white-space: nowrap;
  width: 100%;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

.ticker-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-xs);

  .ticker-tag {
    padding: 2px 6px;
    border-radius: var(--radius-xs);
    font-size: 0.68rem;
    font-weight: 700;

    &.success {
      background: var(--success-soft);
      color: var(--success);
    }
    &.warning {
      background: var(--warning-soft);
      color: var(--warning);
    }
    &.danger {
      background: var(--danger-soft);
      color: var(--danger);
    }
    &.info {
      background: var(--info-soft);
      color: var(--info);
    }
  }

  .ticker-desc {
    color: var(--text);
  }

  .ticker-time {
    color: var(--text-muted);
    font-size: 0.68rem;
  }
}
</style>

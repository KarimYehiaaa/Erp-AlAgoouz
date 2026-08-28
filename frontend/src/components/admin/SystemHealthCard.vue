<template>
  <div class="health-grid">
    <!-- Server Uptime -->
    <div class="health-card">
      <div class="health-icon uptime">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <div class="health-info">
        <span class="health-label">وقت التشغيل</span>
        <span class="health-value">{{ formattedUptime }}</span>
      </div>
    </div>

    <!-- Memory Usage -->
    <div class="health-card">
      <div class="health-icon memory" :class="memoryStatus">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01" />
        </svg>
      </div>
      <div class="health-info">
        <span class="health-label">الذاكرة (RAM)</span>
        <span class="health-value">{{ memoryUsed }} MB</span>
        <div class="health-bar">
          <div
            class="health-bar-fill"
            :class="memoryStatus"
            :style="{ width: memoryPercent + '%' }"
          ></div>
        </div>
      </div>
    </div>

    <!-- DB Status -->
    <div class="health-card">
      <div class="health-icon db" :class="dbOk ? 'ok' : 'critical'">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5V19A9 3 0 0 0 21 19V5" />
          <path d="M3 12A9 3 0 0 0 21 12" />
        </svg>
      </div>
      <div class="health-info">
        <span class="health-label">قاعدة البيانات</span>
        <span class="health-value" :class="dbOk ? 'text-ok' : 'text-critical'">
          {{ dbOk ? 'متصل' : 'غير متصل' }}
          <span class="latency-badge" v-if="dbOk">{{ dbLatency }}ms</span>
        </span>
      </div>
    </div>

    <!-- DB Pool -->
    <div class="health-card">
      <div class="health-icon pool">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <div class="health-info">
        <span class="health-label">اتصالات DB Pool</span>
        <span class="health-value">{{ poolActive }} / {{ poolMax }}</span>
        <div class="health-bar">
          <div
            class="health-bar-fill"
            :class="poolStatus"
            :style="{ width: poolPercent + '%' }"
          ></div>
        </div>
      </div>
    </div>

    <!-- Node Version -->
    <div class="health-card">
      <div class="health-icon node">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 2l10 5.5v11L12 24 2 18.5v-11z" />
        </svg>
      </div>
      <div class="health-info">
        <span class="health-label">Node.js</span>
        <span class="health-value">{{ nodeVersion }}</span>
      </div>
    </div>

    <!-- DB Info -->
    <div class="health-card">
      <div class="health-icon dbinfo">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </div>
      <div class="health-info">
        <span class="health-label">حجم قاعدة البيانات</span>
        <span class="health-value">{{ dbSize }}</span>
        <span class="health-sub">{{ tableCount }} جدول · PG {{ pgVersion }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
  health: { type: Object, default: () => ({}) },
});

const getPropData = (obj: any) => {
  if (!obj) return {};
  if (obj.server && obj.database) return obj;
  if (obj.data && typeof obj.data === 'object') return getPropData(obj.data);
  return obj;
};

const normalizedHealth = computed(() => getPropData(props.health));
const server = computed(() => normalizedHealth.value?.server || {});
const db = computed(() => normalizedHealth.value?.database || {});

const formattedUptime = computed(() => {
  const secs = server.value.uptime || 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d} يوم ${h % 24} ساعة`;
  }
  return `${h} ساعة ${m} دقيقة`;
});

const memoryUsed = computed(() => {
  const mem = server.value.memory;
  if (!mem) return 0;
  return Math.round((mem.heapUsed || mem.rss || 0) / 1024 / 1024);
});

const memoryTotal = computed(() => {
  const mem = server.value.memory;
  if (!mem) return 512;
  return Math.round((mem.heapTotal || mem.rss * 2 || 512 * 1024 * 1024) / 1024 / 1024);
});

const memoryPercent = computed(() => {
  if (!memoryTotal.value) return 0;
  return Math.min(100, Math.round((memoryUsed.value / memoryTotal.value) * 100));
});

const memoryStatus = computed(() => {
  if (memoryPercent.value > 85) return 'critical';
  if (memoryPercent.value > 65) return 'warning';
  return 'ok';
});

const dbOk = computed(() => db.value?.ok !== false);
const dbLatency = computed(() => db.value?.latencyMs || 0);

const poolActive = computed(() => db.value?.poolStats?.total || 0);
const poolMax = computed(() => db.value?.poolStats?.max || 60);
const poolPercent = computed(() =>
  Math.min(100, Math.round((poolActive.value / poolMax.value) * 100)),
);
const poolStatus = computed(() => {
  if (poolPercent.value > 85) return 'critical';
  if (poolPercent.value > 60) return 'warning';
  return 'ok';
});

const nodeVersion = computed(() => server.value.nodeVersion || '—');
const pgVersion = computed(() => db.value?.version || '—');
const dbSize = computed(() => db.value?.size || '—');
const tableCount = computed(() => db.value?.tableCount || 0);
</script>

<style scoped>
.health-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.health-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 14px;
  background: var(--card-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.health-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
}

.health-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.health-icon.uptime {
  background: rgba(59, 130, 246, 0.12);
  color: var(--info);
}
.health-icon.memory.ok {
  background: rgba(16, 185, 129, 0.12);
  color: var(--success);
}
.health-icon.memory.warning {
  background: rgba(245, 158, 11, 0.12);
  color: var(--warning);
}
.health-icon.memory.critical {
  background: rgba(239, 68, 68, 0.12);
  color: var(--danger);
}
.health-icon.db.ok {
  background: rgba(16, 185, 129, 0.12);
  color: var(--success);
}
.health-icon.db.critical {
  background: rgba(239, 68, 68, 0.12);
  color: var(--danger);
}
.health-icon.pool {
  background: rgba(139, 92, 246, 0.12);
  color: var(--accent);
}
.health-icon.node {
  background: rgba(34, 197, 94, 0.12);
  color: var(--success);
}
.health-icon.dbinfo {
  background: rgba(14, 165, 233, 0.12);
  color: var(--info);
}

.health-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.health-label {
  font-size: 0.78rem;
  color: var(--text-muted, #888);
  font-weight: 600;
}

.health-value {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-strong, #fff);
  display: flex;
  align-items: center;
  gap: 6px;
}

.text-ok {
  color: var(--success);
}
.text-critical {
  color: var(--danger);
}

.latency-badge {
  font-size: 0.7rem;
  background: rgba(16, 185, 129, 0.15);
  color: var(--success);
  padding: 2px 7px;
  border-radius: 6px;
  font-weight: 700;
}

.health-sub {
  font-size: 0.72rem;
  color: var(--text-muted, #888);
  font-weight: 500;
}

.health-bar {
  width: 100%;
  height: 5px;
  background: var(--border, rgba(255, 255, 255, 0.08));
  border-radius: 3px;
  overflow: hidden;
  margin-top: 4px;
}

.health-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.6s ease;
}

.health-bar-fill.ok {
  background: linear-gradient(90deg, var(--success), var(--success));
}
.health-bar-fill.warning {
  background: linear-gradient(90deg, var(--warning), #fbbf24);
}
.health-bar-fill.critical {
  background: linear-gradient(90deg, var(--danger), #f87171);
}
</style>

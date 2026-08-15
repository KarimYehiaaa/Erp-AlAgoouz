<template>
  <div class="sessions-panel">
    <div class="sessions-header">
      <h3 class="sessions-title">👥 الجلسات النشطة</h3>
      <span class="sessions-count">{{ sessions.length }} جلسة</span>
    </div>

    <div v-if="!sessions.length" class="sessions-empty">لا توجد جلسات نشطة</div>

    <div v-else class="sessions-list">
      <div v-for="session in sessions" :key="session.id" class="session-card">
        <div class="session-avatar">
          {{ (session.full_name || session.username || '?').charAt(0) }}
        </div>
        <div class="session-info">
          <div class="session-name">{{ session.full_name || session.username }}</div>
          <div class="session-meta">
            <span v-if="session.ip_address" class="session-ip">🌐 {{ session.ip_address }}</span>
            <span class="session-time">⏱️ {{ formatTime(session.created_at) }}</span>
          </div>
          <div v-if="session.user_agent" class="session-agent" :title="session.user_agent">
            {{ shortenAgent(session.user_agent) }}
          </div>
        </div>
        <div class="session-actions">
          <button
            class="btn-revoke"
            @click="$emit('revoke', session.id)"
            title="إنهاء هذه الجلسة"
            :disabled="revoking === session.id"
          >
            {{ revoking === session.id ? '...' : '✕' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Failed Logins Section -->
    <div v-if="failedLogins.length" class="failed-section">
      <h4 class="failed-title">🔒 محاولات دخول فاشلة (آخر 24 ساعة)</h4>
      <div class="failed-list">
        <div v-for="(attempt, idx) in failedLogins.slice(0, 10)" :key="idx" class="failed-item">
          <span class="failed-icon">⛔</span>
          <span class="failed-text">{{ attempt.action_ar || 'محاولة دخول فاشلة' }}</span>
          <span class="failed-time">{{ formatTime(attempt.created_at) }}</span>
          <span v-if="attempt.ip_address" class="failed-ip">{{ attempt.ip_address }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface SessionRecord {
  id: number | string;
  full_name?: string;
  username?: string;
  ip_address?: string;
  created_at?: string;
  user_agent?: string;
  [key: string]: any;
}

interface FailedLogin {
  id: number | string;
  username?: string;
  action_ar?: string;
  created_at?: string;
  ip_address?: string;
  [key: string]: any;
}

withDefaults(
  defineProps<{
    sessions?: SessionRecord[];
    failedLogins?: FailedLogin[];
    revoking?: number | string | null;
  }>(),
  {
    sessions: () => [],
    failedLogins: () => [],
    revoking: null,
  },
);

defineEmits(['revoke']);

const formatTime = (ts: string | undefined) => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  return d.toLocaleDateString('ar-EG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const shortenAgent = (ua: any) => {
  if (!ua) return '';
  if (ua.includes('Chrome')) return '🌐 Chrome';
  if (ua.includes('Firefox')) return '🦊 Firefox';
  if (ua.includes('Safari')) return '🧭 Safari';
  if (ua.includes('Edge')) return '🔷 Edge';
  if (ua.includes('axios') || ua.includes('node')) return '🤖 API Client';
  return ua.substring(0, 30) + '...';
};
</script>

<style scoped>
.sessions-panel {
  border-radius: 16px;
  background: var(--card-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  overflow: hidden;
}

.sessions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.06));
}

.sessions-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-strong, #fff);
}

.sessions-count {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.sessions-empty {
  padding: 30px 20px;
  text-align: center;
  color: var(--text-muted, #888);
  font-size: 0.85rem;
}

.sessions-list {
  max-height: 320px;
  overflow-y: auto;
}

.session-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.04));
  transition: background 0.2s;
}

.session-card:hover {
  background: rgba(255, 255, 255, 0.02);
}

.session-avatar {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--accent, #c77a2f), var(--accent-soft, #f3dfcf));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 1rem;
  flex-shrink: 0;
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-name {
  font-weight: 800;
  font-size: 0.86rem;
  color: var(--text-strong, #fff);
}

.session-meta {
  display: flex;
  gap: 10px;
  margin-top: 2px;
}

.session-ip,
.session-time {
  font-size: 0.7rem;
  color: var(--text-muted, #888);
}

.session-agent {
  font-size: 0.68rem;
  color: var(--text-muted, #666);
  margin-top: 2px;
}

.btn-revoke {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-revoke:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
}

.btn-revoke:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Failed Logins */
.failed-section {
  border-top: 2px solid rgba(239, 68, 68, 0.15);
}

.failed-title {
  margin: 0;
  padding: 14px 20px 8px;
  font-size: 0.88rem;
  font-weight: 800;
  color: #ef4444;
}

.failed-list {
  max-height: 200px;
  overflow-y: auto;
}

.failed-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  font-size: 0.76rem;
  color: var(--text-muted, #888);
  border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.03));
}

.failed-icon {
  font-size: 0.85rem;
}

.failed-text {
  flex: 1;
  color: var(--text, #ccc);
}

.failed-time {
  font-size: 0.7rem;
  color: var(--text-muted, #666);
}

.failed-ip {
  font-family: monospace;
  font-size: 0.68rem;
  color: var(--text-muted, #666);
}
</style>

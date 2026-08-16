<template>
  <header class="cashier-header">
    <!-- Brand / Store Info -->
    <div class="header-brand">
      <img src="/logo.png" alt="بن العجوز" class="brand-logo" />
      <div class="brand-info">
        <h1 class="brand-title">بن العجوز</h1>
        <span class="brand-subtitle">نقطة البيع والكاشير</span>
      </div>
    </div>

    <!-- Live Date & Clock -->
    <div class="header-clock">
      <div class="time-display">{{ currentTime }}</div>
      <div class="date-display">{{ currentDate }}</div>
    </div>

    <!-- User & Actions -->
    <div class="header-actions">
      <div class="cashier-user">
        <span class="user-avatar">👤</span>
        <div class="user-info">
          <span class="user-name">{{ cashierName }}</span>
          <span class="shift-badge">🟢 الشفت الحالي نشط</span>
        </div>
      </div>

      <!-- Fullscreen / Kiosk Button -->
      <button
        class="header-btn"
        :class="{ active: isFullscreen }"
        @click="toggleFullscreen"
        :title="isFullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة (F11)'"
      >
        <span class="btn-icon">{{ isFullscreen ? '🗗' : '⛶' }}</span>
        <span class="btn-text">{{ isFullscreen ? 'تصغير' : 'ملء الشاشة' }}</span>
      </button>

      <!-- Logout Button -->
      <button class="header-btn logout-btn" @click="handleLogout" title="تسجيل الخروج">
        <span class="btn-icon">🚪</span>
        <span class="btn-text">خروج</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const currentTime = ref('');
const currentDate = ref('');
const isFullscreen = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const cashierName = computed(() => {
  return authStore.user?.full_name || authStore.user?.username || 'الكاشير';
});

const updateClock = () => {
  const now = new Date();
  currentTime.value = now.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  currentDate.value = now.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    isFullscreen.value = true;
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
      isFullscreen.value = false;
    }
  }
};

const onFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement;
};

const handleLogout = async () => {
  if (window.confirm('هل أنت متأكد من رغبتك في تسجيل الخروج وإنهاء جلسة الكاشير؟')) {
    await authStore.logout();
    router.push('/login');
  }
};

onMounted(() => {
  updateClock();
  timer = setInterval(updateClock, 1000);
  document.addEventListener('fullscreenchange', onFullscreenChange);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
});
</script>

<style scoped lang="scss">
.cashier-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-card, #1e1e2d);
  border-bottom: 1px solid var(--border, #2d2d3f);
  padding: 10px 20px;
  min-height: 64px;
  user-select: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;

  .brand-logo {
    width: 44px;
    height: 44px;
    object-fit: contain;
    border-radius: 8px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  }

  .brand-info {
    display: flex;
    flex-direction: column;

    .brand-title {
      font-size: 1.15rem;
      font-weight: 900;
      color: var(--primary, #10b981);
      margin: 0;
      line-height: 1.2;
    }

    .brand-subtitle {
      font-size: 0.78rem;
      color: var(--text-muted, #94a3b8);
      font-weight: 600;
    }
  }
}

.header-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  padding: 6px 18px;
  border-radius: 10px;
  border: 1px solid var(--border, #2d2d3f);

  .time-display {
    font-size: 1.2rem;
    font-weight: 800;
    font-family: monospace;
    color: var(--text-strong, #ffffff);
    letter-spacing: 1px;
    direction: ltr;
  }

  .date-display {
    font-size: 0.76rem;
    color: var(--text-muted, #94a3b8);
    font-weight: 600;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.cashier-user {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(16, 185, 129, 0.08);
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid rgba(16, 185, 129, 0.2);

  .user-avatar {
    font-size: 1.2rem;
  }

  .user-info {
    display: flex;
    flex-direction: column;

    .user-name {
      font-size: 0.88rem;
      font-weight: 750;
      color: var(--text-strong, #ffffff);
      line-height: 1.2;
    }

    .shift-badge {
      font-size: 0.7rem;
      color: #10b981;
      font-weight: 600;
    }
  }
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-hover, #2a2a3c);
  color: var(--text, #e2e8f0);
  border: 1px solid var(--border, #3b3b4f);
  border-radius: 8px;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-active, #373750);
    border-color: var(--primary, #10b981);
    transform: translateY(-1px);
  }

  &.logout-btn {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
    border-color: rgba(239, 68, 68, 0.3);

    &:hover {
      background: rgba(239, 68, 68, 0.25);
      border-color: #ef4444;
      color: #ffffff;
    }
  }
}

@media (max-width: 768px) {
  .cashier-header {
    padding: 8px 12px;
  }

  .header-clock {
    display: none;
  }

  .btn-text {
    display: none;
  }

  .header-btn {
    padding: 8px 10px;
  }
}
</style>

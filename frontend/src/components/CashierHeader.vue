<template>
  <header class="cashier-header">
    <!-- Brand / Store Info -->
    <div class="header-brand">
      <div class="logo-wrapper">
        <img src="/logo.png" alt="بن العجوز" class="brand-logo" />
      </div>
      <div class="brand-text">
        <div class="brand-title-wrap">
          <span class="brand-title">بن العجوز</span>
          <span class="brand-badge">POS</span>
        </div>
        <span class="shift-live-status">
          <span class="status-dot"></span>
          الشفت نشط
        </span>
      </div>
    </div>

    <!-- Live Date & Clock -->
    <div class="header-center">
      <div class="clock-badge">
        <span class="clock-icon">🕒</span>
        <span class="time-display">{{ currentTime }}</span>
        <span class="date-sep">|</span>
        <span class="date-display">{{ currentDate }}</span>
      </div>
    </div>

    <!-- Cashier Info & Actions -->
    <div class="header-actions">
      <div class="cashier-pill">
        <span class="cashier-avatar">☕</span>
        <span class="cashier-label">الكاشير:</span>
        <span class="cashier-name">{{ cashierName }}</span>
      </div>

      <div class="action-buttons">
        <!-- Fullscreen Button -->
        <button
          class="icon-action-btn"
          :class="{ active: isFullscreen }"
          @click="toggleFullscreen"
          :title="isFullscreen ? 'الخروج من ملء الشاشة (Esc)' : 'ملء الشاشة (F11)'"
          type="button"
        >
          <span>{{ isFullscreen ? '🗗' : '⛶' }}</span>
        </button>

        <!-- Logout Button -->
        <button
          class="icon-action-btn logout-btn"
          @click="handleLogout"
          title="تسجيل الخروج وإنهاء الشفت"
          type="button"
        >
          <span>🚪</span>
          <span class="logout-text">خروج</span>
        </button>
      </div>
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
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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
  background: rgba(26, 26, 39, 0.95);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0 16px;
  height: 52px;
  min-height: 52px;
  user-select: none;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  position: sticky;
  top: 0;
  z-index: 1000;
}

/* ── Brand ── */
.header-brand {
  display: flex;
  align-items: center;
  gap: 10px;

  .logo-wrapper {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.08);

    .brand-logo {
      width: 28px;
      height: 28px;
      object-fit: contain;
    }
  }

  .brand-text {
    display: flex;
    flex-direction: column;
    gap: 1px;

    .brand-title-wrap {
      display: flex;
      align-items: center;
      gap: 6px;

      .brand-title {
        font-size: 0.95rem;
        font-weight: 850;
        color: #ffffff;
        letter-spacing: -0.2px;
      }

      .brand-badge {
        font-size: 0.65rem;
        font-weight: 800;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: #ffffff;
        padding: 1px 5px;
        border-radius: 4px;
        letter-spacing: 0.5px;
      }
    }

    .shift-live-status {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.7rem;
      color: #10b981;
      font-weight: 600;

      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: #10b981;
        box-shadow: 0 0 8px #10b981;
        animation: pulse-dot 2s infinite ease-in-out;
      }
    }
  }
}

@keyframes pulse-dot {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.7;
  }
}

/* ── Center Clock ── */
.header-center {
  display: flex;
  align-items: center;

  .clock-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.06);
    padding: 4px 14px;
    border-radius: 20px;

    .clock-icon {
      font-size: 0.85rem;
    }

    .time-display {
      font-size: 0.92rem;
      font-weight: 800;
      font-family: monospace;
      color: #ffffff;
      direction: ltr;
      letter-spacing: 0.5px;
    }

    .date-sep {
      color: rgba(255, 255, 255, 0.2);
      font-size: 0.8rem;
    }

    .date-display {
      font-size: 0.78rem;
      color: #94a3b8;
      font-weight: 600;
    }
  }
}

/* ── Actions ── */
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;

  .cashier-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.82rem;

    .cashier-avatar {
      font-size: 0.85rem;
    }
    .cashier-label {
      color: #94a3b8;
      font-weight: 600;
    }
    .cashier-name {
      color: #ffffff;
      font-weight: 750;
    }
  }

  .action-buttons {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .icon-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 32px;
    padding: 0 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-1px);
    }

    &.logout-btn {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.25);
      color: #ef4444;

      &:hover {
        background: rgba(239, 68, 68, 0.2);
        border-color: #ef4444;
        color: #ffffff;
      }
    }
  }
}

@media (max-width: 768px) {
  .header-center {
    display: none;
  }
  .cashier-pill {
    display: none;
  }
  .logout-text {
    display: none;
  }
}
</style>

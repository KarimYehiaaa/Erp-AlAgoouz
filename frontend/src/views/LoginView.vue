<template>
  <div class="login-page" dir="rtl">
    <!-- ═══════════════════════════════════════════════════════════════
         RIGHT SIDE: Brand Showcase with Particles & Typography
         ═══════════════════════════════════════════════════════════════ -->
    <aside class="brand-panel">
      <!-- Coffee Particles Canvas -->
      <canvas ref="particlesCanvas" class="particles-canvas" aria-hidden="true"></canvas>

      <!-- Warm Gradient Overlay -->
      <div class="brand-gradient" aria-hidden="true"></div>

      <!-- Brand Content -->
      <div
        class="brand-content"
        :style="{
          transform: `translate(${offset.x * 0.3}px, ${offset.y * 0.3}px)`,
        }"
      >
        <!-- Logo with Parallax -->
        <div class="brand-logo-wrap">
          <img
            src="/logo-transparent.png"
            :alt="brandingState.companyName"
            class="brand-logo"
            :style="{
              transform: `translate(${offset.x}px, ${offset.y}px)`,
            }"
            @error="handleLogoError"
          />
          <div class="logo-ambient" aria-hidden="true"></div>
        </div>

        <!-- Calligraphy Title -->
        <h1 class="brand-title">{{ brandingState.companyName }}</h1>

        <!-- Typing Effect Tagline -->
        <div class="typing-tagline">
          <span class="typed-text">{{ displayedText }}</span>
          <span class="cursor" :class="{ visible: cursorVisible }">|</span>
        </div>

        <!-- Feature Highlights -->
        <div class="brand-features">
          <div
            v-for="(feature, i) in features"
            :key="feature.label"
            class="feature-item"
            :style="{ transitionDelay: `${0.4 + i * 0.12}s` }"
            :class="{ show: featuresVisible }"
          >
            <span class="feature-icon"><AppIcon :name="feature.icon" :size="18" /></span>
            <span class="feature-label">{{ feature.label }}</span>
          </div>
        </div>
      </div>

      <!-- Bottom Credit -->
      <div class="brand-footer">
        <span class="footer-dot"></span>
        <span>منظومة الإدارة والمحاسبة المؤسسية</span>
      </div>
    </aside>

    <!-- ═══════════════════════════════════════════════════════════════
         LEFT SIDE: Clean Premium Form
         ═══════════════════════════════════════════════════════════════ -->
    <main class="form-panel">
      <div class="form-card" :class="{ 'card-shake': shakeCard }">
        <!-- Mobile Brand Header -->
        <div class="mobile-brand">
          <img
            src="/logo-transparent.png"
            :alt="brandingState.companyName"
            class="mobile-logo"
            @error="handleLogoError"
          />
          <div class="mobile-text">
            <h1>{{ brandingState.companyName }}</h1>
            <p>منظومة الإدارة المؤسسية</p>
          </div>
        </div>

        <!-- Form Header -->
        <div class="form-header">
          <h2>تسجيل الدخول</h2>
          <p>أدخل بياناتك للوصول إلى لوحة التحكم</p>
        </div>

        <!-- ========== LOGIN FORM ========== -->
        <form @submit.prevent="handleLogin" class="login-form" novalidate>
          <!-- Username Field -->
          <div
            class="field-group"
            :class="{ focused: isFieldActive('username'), filled: form.username }"
          >
            <div class="field-wrapper">
              <svg
                class="field-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                id="login-username"
                v-model="form.username"
                type="text"
                placeholder=" "
                required
                autocomplete="username"
                @focus="onFocusField('username')"
                @blur="onBlurField"
              />
              <label for="login-username">اسم المستخدم</label>
            </div>
          </div>

          <!-- Password Field -->
          <div
            class="field-group"
            :class="{ focused: isFieldActive('password'), filled: form.password }"
          >
            <div class="field-wrapper">
              <svg
                class="field-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="login-password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder=" "
                required
                autocomplete="current-password"
                @focus="onFocusField('password')"
                @blur="onBlurField"
                @input="onPasswordInput"
              />
              <label for="login-password">كلمة المرور</label>
              <button
                type="button"
                class="eye-toggle"
                @click="showPassword = !showPassword"
                tabindex="-1"
                :title="showPassword ? 'إخفاء كلمة المرور' : 'عرض كلمة المرور'"
              >
                <svg
                  v-if="!showPassword"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <svg
                  v-else
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                  />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
            </div>
            <!-- Password Strength Indicator -->
            <Transition name="strength-slide">
              <div v-if="form.password && strength.score > 0" class="strength-bar">
                <div class="strength-track">
                  <div
                    class="strength-fill"
                    :style="{ width: strength.percentage + '%', background: strength.color }"
                  ></div>
                </div>
                <span class="strength-label" :style="{ color: strength.color }">{{
                  strength.label
                }}</span>
              </div>
            </Transition>
          </div>

          <!-- Options Row -->
          <div class="form-options">
            <label class="custom-check">
              <input type="checkbox" v-model="rememberMe" />
              <span class="check-box">
                <svg viewBox="0 0 12 10" fill="none">
                  <polyline
                    points="1.5 5 4.5 8 10.5 2"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              <span class="check-text">تذكر بياناتي</span>
            </label>
            <a href="https://wa.me/201142819808" target="_blank" class="forgot-link">
              هل نسيت كلمة المرور؟
            </a>
          </div>

          <!-- Error Message -->
          <Transition name="err-slide">
            <div v-if="error" class="error-banner">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{{ error }}</span>
            </div>
          </Transition>

          <!-- Submit Button -->
          <button type="submit" class="submit-btn" :disabled="loading">
            <span v-if="loading" class="btn-spinner"></span>
            <span v-else class="btn-content">
              <span>تسجيل الدخول</span>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </span>
            <span class="btn-shimmer" aria-hidden="true"></span>
          </button>
        </form>

        <!-- Footer Links -->
        <div class="footer-links">
          <p>
            ليس لديك حساب؟ <a href="https://wa.me/201142819808" target="_blank">تواصل مع الإدارة</a>
          </p>
        </div>

        <!-- Server Status & Copyright -->
        <div class="form-footer">
          <button
            type="button"
            class="server-status-btn"
            @click="showServerConfig = true"
            title="تغيير رابط السيرفر"
          >
            <span class="pulse-dot"></span>
            <span>{{ serverDisplayLabel }}</span>
            <span class="cfg-badge">
              <AppIcon name="settings" :size="12" />
              <span>ضبط</span>
            </span>
          </button>
          <span class="copyright">Al-Agoouz Enterprise Platform &copy; 2026</span>
        </div>
      </div>
    </main>

    <!-- Modal: Server Configuration -->
    <div
      v-if="showServerConfig"
      class="server-modal-overlay"
      @click.self="showServerConfig = false"
    >
      <div class="server-modal-card">
        <div class="modal-head">
          <div class="modal-title-flex">
            <span class="modal-icon">⚙️</span>
            <h3>إعدادات خادم النظام (Backend Server)</h3>
          </div>
          <button class="modal-close-btn" @click="showServerConfig = false">✕</button>
        </div>

        <div class="modal-body">
          <p class="modal-desc">
            حدد عنوان السيرفر الذي يعمل عليه النظام (مهم لتطبيقات الموبايل وشبكة الفرع المحلية).
          </p>

          <div class="field-wrapper mb-3">
            <input
              v-model="customServerUrl"
              type="text"
              class="server-input"
              placeholder="مثال: https://agoouz.vercel.app أو http://192.168.1.14:3000"
              dir="ltr"
            />
          </div>

          <div class="presets-grid">
            <button
              type="button"
              class="preset-chip"
              :class="{ active: customServerUrl === 'https://agoouz.vercel.app' }"
              @click="customServerUrl = 'https://agoouz.vercel.app'"
            >
              ☁️ السيرفر السحابي (أونلاين)
            </button>
            <button
              type="button"
              class="preset-chip"
              :class="{ active: customServerUrl === 'http://192.168.1.14:3000' }"
              @click="customServerUrl = 'http://192.168.1.14:3000'"
            >
              🏢 سيرفر الفرع (192.168.1.14:3000)
            </button>
            <button
              type="button"
              class="preset-chip"
              :class="{ active: customServerUrl === 'http://localhost:3000' }"
              @click="customServerUrl = 'http://localhost:3000'"
            >
              💻 الكمبيوتر المباشر (Localhost:3000)
            </button>
          </div>

          <div v-if="testResultMsg" class="test-box" :class="testResultStatus">
            {{ testResultMsg }}
          </div>
        </div>

        <div class="modal-foot">
          <button
            type="button"
            class="btn-test"
            :disabled="testingConn"
            @click="testServerConnection"
          >
            {{ testingConn ? 'جاري الفحص...' : '⚡ فحص الاتصال' }}
          </button>
          <button type="button" class="btn-save" @click="saveServerConfig">💾 حفظ والاعتماد</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import { useAuthStore } from '@/stores/auth';
import { useTypingEffect } from '@/composables/useTypingEffect';
import { useParticles } from '@/composables/useParticles';
import {
  useMouseParallax,
  usePasswordStrength,
  useInputAnimations,
} from '@/composables/useLoginAnimations';
import { getBaseServerUrl, setBaseServerUrl } from '@/api/client';
import { brandingState } from '@/design-system/themes/themeEngine';
import axios from 'axios';

const router = useRouter();
const auth = useAuthStore();

// ─── Form State ───────────────────────────────────────────
const form = ref({ username: '', password: '' });
const rememberMe = ref(true);
const loading = ref(false);
const showPassword = ref(false);
const error = ref('');
const shakeCard = ref(false);

const STORAGE_KEY = 'erp_remembered_username';

// ─── Composables ──────────────────────────────────────────
const { offset } = useMouseParallax(12);
const { strength, evaluate } = usePasswordStrength();
const { onFocusField, onBlurField, isFieldActive } = useInputAnimations();

const {
  displayedText,
  cursorVisible,
  start: startTyping,
} = useTypingEffect({
  phrases: [
    'إدارة مؤسسية متكاملة',
    'ذكاء تشغيلي ولحظي',
    'رقابة مالية ومخزنية موحدة',
    'كفاءة تشغيلية فائقة',
  ],
  typingSpeed: 110,
  deletingSpeed: 55,
  pauseDuration: 2500,
});

const { init: initParticles } = useParticles({
  count: 20,
  color: 'rgba(59, 130, 246, 0.2)',
  minSize: 3,
  maxSize: 7,
  speed: 0.3,
});

// ─── Brand Features ───────────────────────────────────────
const features = [
  { icon: 'inventory', label: 'إدارة المنتجات والمخزون' },
  { icon: 'reports', label: 'تقارير مالية لحظية' },
  { icon: 'shield', label: 'حماية بيانات متقدمة' },
];
const featuresVisible = ref(false);

// ─── Refs ─────────────────────────────────────────────────
const particlesCanvas = ref<HTMLCanvasElement | null>(null);

// ─── Password Input Handler ──────────────────────────────
const onPasswordInput = () => {
  evaluate(form.value.password);
};

// ─── Server Config State ───────────────────────────────────
const showServerConfig = ref(false);
const customServerUrl = ref(getBaseServerUrl() || 'https://agoouz.vercel.app');
const testingConn = ref(false);
const testResultMsg = ref('');
const testResultStatus = ref<'success' | 'error' | ''>('');

const serverDisplayLabel = computed(() => {
  const url = getBaseServerUrl();
  if (!url || url.includes('agoouz.vercel.app')) return 'سيرفر سحابي ☁️';
  if (url.includes('192.168.') || url.includes('localhost')) return 'سيرفر محلي 🏢';
  return 'سيرفر مخصص 🌐';
});

const testServerConnection = async () => {
  testingConn.value = true;
  testResultMsg.value = '';
  testResultStatus.value = '';

  const target = (customServerUrl.value || getBaseServerUrl()).replace(/\/+$/, '');
  const startTime = Date.now();
  try {
    const res = await axios.get(`${target}/api/v1/health`, { timeout: 6000 });
    const latency = Date.now() - startTime;
    if (res.data && res.data.success) {
      testResultStatus.value = 'success';
      const isDbOk = res.data.db?.connected ? ' • قاعدة البيانات متصلة ✅' : '';
      testResultMsg.value = `✅ الاتصال ناجح! (استجابة: ${latency}ms${isDbOk})`;
    } else {
      throw new Error('استجابة غير متوقعة');
    }
  } catch {
    testResultStatus.value = 'error';
    testResultMsg.value = `❌ تعذر الاتصال بالسيرفر (${target}). تحقق من تشغيل السيرفر والإنترنت.`;
  } finally {
    testingConn.value = false;
  }
};

const saveServerConfig = () => {
  setBaseServerUrl(customServerUrl.value);
  showServerConfig.value = false;
  testResultMsg.value = '';
};

// ─── Login Handler ────────────────────────────────────────
const handleLogin = async () => {
  if (!form.value.username || !form.value.password) return;
  loading.value = true;
  error.value = '';
  try {
    await auth.login(form.value.username, form.value.password);

    // Save or remove remembered user
    if (rememberMe.value) {
      localStorage.setItem(STORAGE_KEY, form.value.username);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }

    const isNative =
      typeof window !== 'undefined' &&
      (!!(window as any).Capacitor?.isNativePlatform?.() ||
        window.location.protocol === 'capacitor:' ||
        window.location.protocol === 'file:');

    if (isNative) {
      router.push('/mobile');
    } else {
      const targetRoute = auth.isCashier ? '/branch-sales' : '/';
      router.push(targetRoute);
    }
  } catch (e: any) {
    error.value = e.message || 'اسم المستخدم أو كلمة المرور غير صحيحة';
    triggerShake();
  } finally {
    loading.value = false;
  }
};

const triggerShake = () => {
  shakeCard.value = true;
  setTimeout(() => {
    shakeCard.value = false;
  }, 500);
};

const handleLogoError = (e: Event) => {
  (e.target as HTMLImageElement).src = '/logo.svg';
};

// ─── Lifecycle ────────────────────────────────────────────
onMounted(async () => {
  // Load saved username
  const savedUser = localStorage.getItem(STORAGE_KEY);
  if (savedUser) {
    form.value.username = savedUser;
    rememberMe.value = true;
  } else {
    rememberMe.value = false;
  }

  // Start typing effect
  startTyping();

  // Initialize particles
  await nextTick();
  if (particlesCanvas.value) {
    initParticles(particlesCanvas.value);
  }

  // Stagger features entrance
  setTimeout(() => {
    featuresVisible.value = true;
  }, 600);
});
</script>

<style scoped>
/*
  FONT IMPORTS
  Cairo for UI / Aref Ruqaa for Arabic calligraphy
*/
@import url('https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=Cairo:wght@400;500;600;700;800&display=swap');

/* CSS CUSTOM PROPERTIES (Universal Enterprise Theme) */
.login-page {
  --bg-cream: #f8fafc;
  --bg-white: #ffffff;
  --surface: #f1f5f9;
  --border-light: #e2e8f0;
  --border-medium: #cbd5e1;

  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #64748b;

  --accent: #2563eb;
  --accent-dark: #1d4ed8;
  --accent-light: #3b82f6;
  --accent-glow: rgba(37, 99, 235, 0.18);

  --brand-gradient-start: #0b0f17;
  --brand-gradient-mid: #0f172a;
  --brand-gradient-end: #1e293b;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-xl: 24px;

  --shadow-card: 0 4px 20px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04);
  --shadow-card-hover: 0 8px 30px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04);
  --shadow-input-focus: 0 0 0 3.5px var(--accent-glow);

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* DARK MODE (Espresso) — نفس هوية القهوة بدرجات داكنة
   تُفعَّل عبر data-theme="dark" على <html> (يُدار من stores/app.ts) */
/* ملاحظة: مُستخرجة في كتلة style غير معزولة في نهاية الملف لأن :global() داخل النمط المعزول كان يُسقط جزء .login-page أثناء التجميع (Sass modern-compiler). */

/* ROOT LAYOUT */
.login-page {
  display: flex;
  min-height: 100dvh;
  direction: rtl;
  font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif;
  background: var(--bg-cream);
  color: var(--text-primary);
}

/* BRAND PANEL (Right Side — Desktop Only) */
.brand-panel {
  position: relative;
  display: none;
  width: 46%;
  min-width: 400px;
  max-width: 640px;
  flex-shrink: 0;
  overflow: hidden;
  background: linear-gradient(
    165deg,
    var(--brand-gradient-start) 0%,
    var(--brand-gradient-mid) 45%,
    var(--brand-gradient-end) 100%
  );
  align-items: center;
  justify-content: center;
}

@media (min-width: 1024px) {
  .brand-panel {
    display: flex;
  }
}

/* Canvas for floating coffee particles */
.particles-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

/* Subtle enterprise glow overlay */
.brand-gradient {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 30%, rgba(37, 99, 235, 0.15) 0%, transparent 65%),
    radial-gradient(ellipse at 20% 80%, rgba(99, 102, 241, 0.1) 0%, transparent 50%);
  z-index: 2;
  pointer-events: none;
}

.brand-content {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  transition: transform 0.15s ease-out;
  will-change: transform;
}

/* Logo */
.brand-logo-wrap {
  position: relative;
  margin-bottom: 16px;
}

.brand-logo {
  width: 260px;
  height: auto;
  object-fit: contain;
  position: relative;
  z-index: 2;
  filter: drop-shadow(0 16px 35px rgba(0, 0, 0, 0.5));
  transition: transform 0.2s ease-out;
  will-change: transform;
  animation: logoBreathe 5s ease-in-out infinite;
}

@keyframes logoBreathe {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

.logo-ambient {
  position: absolute;
  inset: -20px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(37, 99, 235, 0.25), transparent 65%);
  filter: blur(25px);
  z-index: 1;
  animation: ambientPulse 4s ease-in-out infinite;
}

@keyframes ambientPulse {
  0%,
  100% {
    opacity: 0.5;
    transform: scale(1);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.08);
  }
}

/* Title */
.brand-title {
  font-family: 'Aref Ruqaa', serif;
  font-size: 5rem;
  font-weight: 700;
  color: #f5e6d0;
  margin: 0;
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  line-height: 1.1;
  letter-spacing: -1px;

  /* كشف الخط بالسحب: يظهر الاسم كأنه يُكتب بالحبر من اليمين لليسار */
  clip-path: inset(0 0 0 0);
  animation: calligraphy-reveal 1.4s cubic-bezier(0.65, 0, 0.35, 1) both;
}

@keyframes calligraphy-reveal {
  from {
    clip-path: inset(0 100% 0 0);
    filter: blur(6px);
    opacity: 0.4;
  }
  60% {
    filter: blur(2px);
  }
  to {
    clip-path: inset(0 0 0 0);
    filter: blur(0);
    opacity: 1;
  }
}

/* Typing Tagline */
.typing-tagline {
  font-family: 'Aref Ruqaa', serif;
  font-size: 1.8rem;
  color: rgba(245, 230, 208, 0.75);
  margin-top: -4px;
  height: 2.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.typed-text {
  display: inline;
}

.cursor {
  display: inline-block;
  color: var(--accent);
  font-weight: 300;
  margin-right: 2px;
  opacity: 0;
  transition: opacity 0.1s;
}

.cursor.visible {
  opacity: 1;
}

/* Brand Features */
.brand-features {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 32px;
  width: 100%;
  max-width: 280px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.88rem;
  font-weight: 600;
  color: rgba(245, 230, 208, 0.8);
  opacity: 0;
  transform: translateX(20px);
  transition: all 0.5s var(--ease-out);
}

.feature-item.show {
  opacity: 1;
  transform: translateX(0);
}

.feature-icon {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  background: rgba(245, 230, 208, 0.1);
  border: 1px solid rgba(245, 230, 208, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.feature-item:hover .feature-icon {
  background: rgba(245, 230, 208, 0.18);
  transform: scale(1.06);
}

/* Brand Footer */
.brand-footer {
  position: absolute;
  bottom: 28px;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.76rem;
  color: rgba(245, 230, 208, 0.45);
  font-weight: 600;
  z-index: 3;
}

.footer-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(200, 149, 110, 0.6);
}

/* FORM PANEL (Left Side — Always Visible) */
.form-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 20px;
  background: var(--bg-cream);
}

@media (min-width: 1024px) {
  .form-panel {
    background: var(--bg-white);
    padding: 40px 48px;
  }
}

/* ─── Form Card ───────────────────────────────────────────────── */
.form-card {
  width: 100%;
  max-width: 430px;
  background: var(--bg-white);
  border-radius: var(--radius-xl);
  padding: 42px 36px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-light);
  animation: cardSlideIn 0.6s var(--ease-out);
  transition:
    transform 0.4s var(--ease-out),
    box-shadow 0.4s ease;
}

.form-card:hover {
  box-shadow: var(--shadow-card-hover);
}

@keyframes cardSlideIn {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (min-width: 1024px) {
  .form-card {
    max-width: 400px;
    background: transparent;
    box-shadow: none;
    border: none;
    border-radius: 0;
    padding: 0;
  }
  .form-card:hover {
    box-shadow: none;
  }
}

/* ─── Mobile Brand Header ─────────────────────────────────── */
.mobile-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-light);
}

@media (min-width: 1024px) {
  .mobile-brand {
    display: none;
  }
}

.mobile-logo {
  width: 58px;
  height: 58px;
  border-radius: var(--radius-md);
  object-fit: contain;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.12));
}

.mobile-text h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-primary);
}

.mobile-text p {
  margin: 2px 0 0;
  font-size: 0.82rem;
  color: var(--text-muted);
  font-weight: 600;
}

/* ─── Form Header ─────────────────────────────────────────── */
.form-header {
  margin-bottom: 32px;
}

.form-header h2 {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.form-header p {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin: 0;
  font-weight: 500;
  line-height: 1.6;
}

/* ─── Login Form ──────────────────────────────────────────── */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ─── Field Group (Floating Label) ────────────────────────── */
.field-group {
  position: relative;
}

.field-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon {
  position: absolute;
  right: 16px;
  color: var(--text-muted);
  z-index: 3;
  pointer-events: none;
  transition:
    color 0.3s ease,
    transform 0.3s ease;
}

.field-wrapper input {
  width: 100%;
  height: 56px;
  padding: 20px 48px 8px 48px;
  border: 1.5px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-primary);
  font-size: 0.95rem;
  font-weight: 600;
  font-family: 'Cairo', sans-serif;
  outline: none;
  transition: all 0.25s var(--ease-out);
}

.field-wrapper label {
  position: absolute;
  right: 48px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-muted);
  pointer-events: none;
  transform-origin: right center;
  transition: all 0.25s var(--ease-out);
}

/* Float label up when focused or filled */
.field-wrapper input:focus + label,
.field-wrapper input:not(:placeholder-shown) + label {
  top: 12px;
  transform: translateY(0) scale(0.78);
  color: var(--accent);
  font-weight: 700;
}

/* Focus state */
.field-wrapper input:focus {
  border-color: var(--accent);
  background: var(--bg-white);
  box-shadow: var(--shadow-input-focus);
}

.field-group.focused .field-icon {
  color: var(--accent);
  transform: scale(1.08);
}

/* ─── Password Strength Indicator ─────────────────────────── */
.strength-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 0 4px;
}

.strength-track {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--border-light);
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  border-radius: 2px;
  transition:
    width 0.4s var(--ease-out),
    background 0.4s ease;
}

.strength-label {
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
  transition: color 0.3s ease;
}

.strength-slide-enter-active {
  animation: strengthIn 0.3s var(--ease-out);
}
.strength-slide-leave-active {
  animation: strengthIn 0.2s ease-in reverse;
}
@keyframes strengthIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ─── Eye Toggle ──────────────────────────────────────────── */
.eye-toggle {
  position: absolute;
  left: 14px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 5px;
  display: flex;
  align-items: center;
  z-index: 3;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.eye-toggle:hover {
  color: var(--accent-dark);
  background: var(--accent-glow);
}

/* ─── Form Options ────────────────────────────────────────── */
.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
}

.custom-check {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.custom-check input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.check-box {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-medium);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.22s var(--ease-spring);
  background: var(--bg-white);
}

.check-box svg {
  width: 12px;
  height: 10px;
  color: #fff;
  opacity: 0;
  transform: scale(0) rotate(-15deg);
  transition: all 0.22s var(--ease-spring);
}

.custom-check input:checked + .check-box {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 2px 8px rgba(200, 149, 110, 0.4);
}

.custom-check input:checked + .check-box svg {
  opacity: 1;
  transform: scale(1) rotate(0);
}

.check-text {
  font-size: 0.82rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.forgot-link {
  color: var(--accent);
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
  transition: color 0.2s ease;
  font-family: inherit;
}

.forgot-link:hover {
  color: var(--accent-dark);
  text-decoration: underline;
}

/* ─── Error Banner ────────────────────────────────────────── */
.error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.07);
  border: 1px solid rgba(239, 68, 68, 0.15);
  color: #dc2626;
  font-size: 0.84rem;
  font-weight: 700;
}

.error-banner svg {
  flex-shrink: 0;
}

.err-slide-enter-active {
  animation: errIn 0.32s var(--ease-out);
}
.err-slide-leave-active {
  animation: errIn 0.22s ease-in reverse;
}
@keyframes errIn {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ─── Submit Button ───────────────────────────────────────── */
.submit-btn {
  position: relative;
  width: 100%;
  height: 54px;
  margin-top: 8px;
  border-radius: var(--radius-md);
  border: none;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
  color: #fff;
  font-size: 1.05rem;
  font-weight: 800;
  font-family: 'Cairo', sans-serif;
  cursor: pointer;
  overflow: hidden;
  box-shadow:
    0 4px 16px rgba(200, 149, 110, 0.4),
    0 1px 3px rgba(200, 149, 110, 0.2);
  transition: all 0.3s var(--ease-out);
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow:
    0 8px 28px rgba(200, 149, 110, 0.55),
    0 2px 6px rgba(200, 149, 110, 0.25);
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}

.submit-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.btn-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-shimmer {
  position: absolute;
  top: 0;
  left: -100%;
  width: 55%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transform: skew(-25deg);
  animation: shimmerSweep 3.8s infinite;
  pointer-events: none;
}

@keyframes shimmerSweep {
  0% {
    left: -100%;
  }
  22%,
  100% {
    left: 200%;
  }
}

.btn-spinner {
  position: relative;
  z-index: 2;
  display: inline-block;
  width: 22px;
  height: 22px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spinRotate 0.7s linear infinite;
}

@keyframes spinRotate {
  to {
    transform: rotate(360deg);
  }
}

/* ─── Footer Links ────────────────────────────────────────── */
.footer-links {
  margin-top: 28px;
  text-align: center;
  font-size: 0.88rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.footer-links p {
  margin: 0;
}

.footer-links a {
  color: var(--accent);
  font-weight: 700;
  text-decoration: none;
  margin-right: 4px;
  transition: color 0.2s;
}

.footer-links a:hover {
  color: var(--accent-dark);
}

/* ─── Form Footer ─────────────────────────────────────────── */
.form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
}

.server-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #16a34a;
  box-shadow: 0 0 6px rgba(22, 163, 74, 0.5);
  animation: dotPulse 2.2s ease-in-out infinite;
}

@keyframes dotPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.server-status span:last-child {
  font-size: 0.74rem;
  color: var(--text-muted);
  font-weight: 600;
}

.copyright {
  font-size: 0.72rem;
  color: var(--border-medium);
  font-weight: 600;
}

/* ─── Card Shake ──────────────────────────────────────────── */
.card-shake {
  animation: cardShakeAnim 0.5s var(--ease-spring);
}

@keyframes cardShakeAnim {
  10%,
  90% {
    transform: translate(-2px);
  }
  20%,
  80% {
    transform: translate(4px);
  }
  30%,
  50%,
  70% {
    transform: translate(-6px);
  }
  40%,
  60% {
    transform: translate(6px);
  }
}

/* RESPONSIVE ADJUSTMENTS */
@media (max-width: 480px) {
  .form-panel {
    padding: 16px 12px;
  }
  .form-card {
    padding: 30px 22px;
    border-radius: var(--radius-lg);
  }
  .form-header h2 {
    font-size: 1.45rem;
  }
  .mobile-brand {
    gap: 10px;
    flex-direction: column;
    text-align: center;
  }
  .mobile-logo {
    width: 52px;
    height: 52px;
  }
  .mobile-text h1 {
    font-size: 1.3rem;
  }
  .mobile-text p {
    font-size: 0.75rem;
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .form-card {
    max-width: 460px;
    padding: 46px 40px;
  }
}

@media (min-width: 1440px) {
  .brand-logo {
    width: 300px;
  }
  .brand-title {
    font-size: 5.8rem;
  }
  .typing-tagline {
    font-size: 2rem;
  }
}

/* ─── Reduced Motion ──────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .brand-logo,
  .logo-ambient,
  .btn-shimmer,
  .pulse-dot,
  .form-card,
  .feature-item {
    animation: none !important;
  }
  .field-wrapper input:focus {
    transform: none;
  }
  .submit-btn:hover:not(:disabled) {
    transform: none;
  }
}

/* ─── Server Configuration Modal & Status Styles ─── */
.server-status-btn {
  background: transparent;
  border: 1px solid var(--border-medium, rgba(217, 168, 108, 0.2));
  border-radius: 20px;
  padding: 4px 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary, #a89f91);
  font-size: 0.82rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
}

.server-status-btn:hover {
  background: var(--surface, rgba(217, 168, 108, 0.1));
  border-color: var(--accent, #d9a86c);
  color: var(--text-primary, #f7ede2);
}

.cfg-badge {
  background: var(--border-light, rgba(255, 255, 255, 0.1));
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: bold;
}

.server-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(10px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: fadeIn 0.2s ease;
}

.server-modal-card {
  background: #1a120b;
  border: 1px solid rgba(217, 168, 108, 0.35);
  border-radius: 20px;
  width: 100%;
  max-width: 440px;
  color: #f7ede2;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-head {
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title-flex {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-title-flex h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #d9a86c;
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: #a89f91;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px;
}

.modal-body {
  padding: 20px;
}

.modal-desc {
  font-size: 0.85rem;
  color: #c4b9a8;
  margin: 0 0 16px;
  line-height: 1.5;
}

.server-input {
  width: 100%;
  padding: 12px 14px;
  background: #090604;
  border: 1px solid rgba(217, 168, 108, 0.3);
  border-radius: 12px;
  color: #ffffff;
  font-size: 0.9rem;
  outline: none;
  font-family: monospace;
  box-sizing: border-box;
}

.server-input:focus {
  border-color: #d9a86c;
  box-shadow: 0 0 12px rgba(217, 168, 108, 0.3);
}

.presets-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 14px 0;
}

.preset-chip {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px 14px;
  color: #e2d7c9;
  font-size: 0.82rem;
  text-align: right;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
}

.preset-chip:hover {
  background: rgba(217, 168, 108, 0.12);
  border-color: rgba(217, 168, 108, 0.4);
}

.preset-chip.active {
  background: rgba(217, 168, 108, 0.2);
  border-color: #d9a86c;
  color: #ffffff;
  font-weight: 700;
}

.test-box {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 0.82rem;
}

.test-box.success {
  background: rgba(52, 211, 153, 0.15);
  border: 1px solid rgba(52, 211, 153, 0.4);
  color: #34d399;
}

.test-box.error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
}

.modal-foot {
  padding: 14px 20px;
  background: rgba(0, 0, 0, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-test {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f7ede2;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}

.btn-save {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  border: none;
  color: #ffffff;
  padding: 8px 18px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 800;
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}
</style>

<!-- ═══════════ كتلة غير معزولة: متغيرات صفحة الدخول في الوضع الداكن ═══════════ -->
<style lang="scss">
html[data-theme='dark'] .login-page {
  --bg-cream: #0b0f17;
  --bg-white: #111827;
  --surface: #1e293b;
  --border-light: #1e293b;
  --border-medium: #334155;

  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;

  --accent: #3b82f6;
  --accent-dark: #60a5fa;
  --accent-light: #1d4ed8;
  --accent-glow: rgba(59, 130, 246, 0.2);

  --shadow-card: 0 4px 20px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-card-hover: 0 8px 30px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4);
}
</style>

<template>
  <div class="login-page" dir="rtl">
    <!-- ═══════════════════════════════════════════════════════════════
         الجانب الأيمن: لوحة العلامة التجارية (سطح المكتب فقط)
         RIGHT SIDE: Brand Showcase Panel (Desktop only)
         ═══════════════════════════════════════════════════════════════ -->
    <aside class="brand-panel">
      <!-- Decorative floating warm orbs -->
      <div class="brand-orb orb-a" aria-hidden="true"></div>
      <div class="brand-orb orb-b" aria-hidden="true"></div>
      <div class="brand-orb orb-c" aria-hidden="true"></div>

      <!-- Subtle diamond grid pattern -->
      <div class="brand-grid" aria-hidden="true"></div>

      <!-- Brand content -->
      <div class="brand-body">
        <!-- 3D Logo with ambient glow -->
        <div class="brand-logo-wrap">
          <img
            src="/logo-transparent.png"
            alt="بن العجوز"
            class="brand-logo-img"
            @error="handleLogoError"
          />
          <div class="logo-ambient-glow" aria-hidden="true"></div>
        </div>

        <h1 class="brand-title">بن العجوز</h1>
        <p class="brand-tagline">نظام إدارة الأعمال والتخطيط الذكي</p>

        <!-- Feature highlight rows -->
        <div class="brand-features">
          <div class="feature-row">
            <span class="feature-chip">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </span>
            <span>إدارة شاملة للمبيعات والمخزون</span>
          </div>
          <div class="feature-row">
            <span class="feature-chip">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span>تتبع دقيق للحسابات والعملاء</span>
          </div>
          <div class="feature-row">
            <span class="feature-chip">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </span>
            <span>تقارير وتحليلات ذكية فورية</span>
          </div>
        </div>
      </div>

      <!-- Bottom encryption line -->
      <div class="brand-bottom-line">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span>بيانات مشفرة ومحمية بمعايير عالمية</span>
      </div>
    </aside>

    <!-- ═══════════════════════════════════════════════════════════════
         الجانب الأيسر: لوحة نموذج تسجيل الدخول
         LEFT SIDE: Login Form Panel
         ═══════════════════════════════════════════════════════════════ -->
    <main class="form-panel">
      <div class="form-container" :class="{ 'card-shake': shakeCard }">
        <!-- Mobile-only compact brand header -->
        <div class="mobile-brand">
          <img
            src="/logo-transparent.png"
            alt="بن العجوز"
            class="mobile-logo-img"
            @error="handleLogoError"
          />
          <div class="mobile-brand-text">
            <h1>بن العجوز</h1>
            <p>نظام إدارة الأعمال الذكي</p>
          </div>
        </div>

        <!-- Form heading -->
        <div class="form-heading">
          <h2>مرحباً بعودتك</h2>
          <p>أدخل بياناتك للوصول إلى لوحة التحكم الإدارية</p>
        </div>

        <!-- ========== LOGIN FORM ========== -->
        <form @submit.prevent="handleLogin" class="login-form" novalidate>
          <!-- Username floating-label field -->
          <div class="float-field">
            <div class="field-shell">
              <svg
                class="field-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
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
              />
              <label for="login-username">اسم المستخدم</label>
            </div>
          </div>

          <!-- Password floating-label field -->
          <div class="float-field">
            <div class="field-shell">
              <svg
                class="field-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
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
              />
              <label for="login-password">كلمة المرور</label>
              <button
                type="button"
                class="eye-btn"
                @click="showPassword = !showPassword"
                tabindex="-1"
                :title="showPassword ? 'إخفاء كلمة المرور' : 'عرض كلمة المرور'"
              >
                <!-- Eye open -->
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
                <!-- Eye closed -->
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
          </div>

          <!-- Options: Remember me + Forgot password -->
          <div class="form-options">
            <label class="custom-check">
              <input type="checkbox" v-model="rememberMe" />
              <span class="check-mark">
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
              <span class="check-label">تذكر هذا الجهاز</span>
            </label>
            <button type="button" class="forgot-link" @click="showForgotHelp">
              نسيت كلمة المرور؟
            </button>
          </div>

          <!-- Error banner with slide animation -->
          <Transition name="err-slide">
            <div v-if="error" class="error-banner" role="alert">
              <svg
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
                  d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{{ error }}</span>
            </div>
          </Transition>

          <!-- Submit button with shimmer sweep -->
          <button type="submit" class="submit-btn" :disabled="loading">
            <span class="shimmer-sweep" aria-hidden="true"></span>
            <span v-if="loading" class="btn-spinner"></span>
            <span v-else class="btn-face">
              <span>تسجيل الدخول</span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </span>
          </button>
        </form>

        <!-- Footer: server status + credit -->
        <footer class="form-footer">
          <div class="server-status">
            <span class="pulse-dot"></span>
            <span>السيرفر متصل · تشفير آمن</span>
          </div>
          <span class="credit-line">تطوير كريم يحيى</span>
        </footer>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
/**
 * LoginView - شاشة تسجيل الدخول
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

// ── Form State ──
const form = ref({ username: '', password: '' });
const rememberMe = ref(true);
const loading = ref(false);
const passwordInputRef = ref<HTMLInputElement | null>(null);

const showForgotHelp = () => {
  alert('يرجى التواصل مع مسؤول النظام لإعادة تعيين كلمة المرور الخاصة بك.');
};

const showPassword = ref(false);
const error = ref('');
const shakeCard = ref(false);

/**
 * معالجة تسجيل الدخول
 */
const handleLogin = async () => {
  if (!form.value.username || !form.value.password) return;
  loading.value = true;
  error.value = '';
  try {
    await auth.login(form.value.username, form.value.password);
    router.push('/');
  } catch (e) {
    error.value = e.message || 'اسم المستخدم أو كلمة المرور غير صحيحة';
    triggerShake();
  } finally {
    loading.value = false;
  }
};

/**
 * تفعيل اهتزاز الكارت عند الخطأ
 */
const triggerShake = () => {
  shakeCard.value = true;
  setTimeout(() => {
    shakeCard.value = false;
  }, 550);
};

/**
 * Fallback عند فشل تحميل اللوجو
 */
const handleLogoError = (e) => {
  e.target.src = '/logo.svg';
};
</script>

<style scoped>
/* ════════════════════════════════════════════════════════════════════
   ROOT LAYOUT — Split Screen (RTL: Brand RIGHT, Form LEFT)
   ════════════════════════════════════════════════════════════════════ */
.login-page {
  display: flex;
  min-height: 100dvh;
  direction: rtl;
  font-family: 'Cairo', 'Outfit', 'Segoe UI', Tahoma, Arial, sans-serif;
  background: #f7f3ee;
}

/* ════════════════════════════════════════════════════════════════════
   BRAND PANEL — Rich Warm Espresso Gradient (Desktop)
   ════════════════════════════════════════════════════════════════════ */
.brand-panel {
  position: relative;
  display: none;
  width: 44%;
  min-width: 380px;
  max-width: 620px;
  flex-shrink: 0;
  background: linear-gradient(168deg, #160b04 0%, #2c1810 28%, #4a2c17 62%, #6b3f1f 100%);
  overflow: hidden;
  padding: 48px 40px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

@media (min-width: 1024px) {
  .brand-panel {
    display: flex;
  }
}

/* ── Floating Warm Orbs ── */
.brand-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  pointer-events: none;
  will-change: transform;
}

.orb-a {
  width: 340px;
  height: 340px;
  background: radial-gradient(circle, rgba(212, 165, 116, 0.38), transparent 70%);
  top: -6%;
  right: -10%;
  animation: orbFloat 20s ease-in-out infinite alternate;
}

.orb-b {
  width: 260px;
  height: 260px;
  background: radial-gradient(circle, rgba(176, 125, 79, 0.3), transparent 70%);
  bottom: 8%;
  left: -6%;
  animation: orbFloat 17s ease-in-out infinite alternate-reverse;
}

.orb-c {
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(255, 190, 100, 0.22), transparent 70%);
  top: 42%;
  left: 48%;
  animation: orbFloat 23s ease-in-out infinite alternate;
  animation-delay: -7s;
}

@keyframes orbFloat {
  0% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(22px, -28px) scale(1.06);
  }
  100% {
    transform: translate(-14px, 18px) scale(0.95);
  }
}

/* ── Diamond Grid Pattern ── */
.brand-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(30deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(-30deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 26px 26px;
  pointer-events: none;
}

/* ── Brand Body ── */
.brand-body {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  animation: brandFadeIn 0.9s ease-out 0.15s both;
}

@keyframes brandFadeIn {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── 3D Logo ── */
.brand-logo-wrap {
  position: relative;
  margin-bottom: 18px;
}

.brand-logo-img {
  width: 130px;
  height: 130px;
  object-fit: contain;
  border-radius: 26px;
  position: relative;
  z-index: 2;
  filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.45));
  animation: logoBreath 5s ease-in-out infinite;
}

@keyframes logoBreath {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

.logo-ambient-glow {
  position: absolute;
  inset: -18px;
  border-radius: 32px;
  background: radial-gradient(circle, rgba(212, 165, 116, 0.5), transparent 70%);
  filter: blur(22px);
  z-index: 1;
  animation: glowPulse 4s ease-in-out infinite;
}

@keyframes glowPulse {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.06);
  }
}

/* ── Brand Typography ── */
.brand-title {
  font-size: 2.6rem;
  font-weight: 900;
  color: #ffffff;
  margin: 0;
  letter-spacing: -0.3px;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.3);
}

.brand-tagline {
  font-size: 0.92rem;
  color: rgba(212, 192, 168, 0.82);
  font-weight: 600;
  margin: 4px 0 36px;
}

/* ── Feature Highlights ── */
.brand-features {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 310px;
}

.feature-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.86rem;
  color: rgba(255, 255, 255, 0.76);
  font-weight: 600;
}

.feature-chip {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: rgba(212, 165, 116, 0.14);
  border: 1px solid rgba(212, 165, 116, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #d4a574;
  transition: all 0.3s ease;
}

.feature-row:hover .feature-chip {
  background: rgba(212, 165, 116, 0.25);
  transform: scale(1.06);
}

/* ── Bottom Encryption Notice ── */
.brand-bottom-line {
  position: absolute;
  bottom: 30px;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.76rem;
  color: rgba(168, 148, 128, 0.65);
  font-weight: 600;
  z-index: 2;
}

/* ════════════════════════════════════════════════════════════════════
   FORM PANEL — Clean Warm Light Background
   ════════════════════════════════════════════════════════════════════ */
.form-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 20px;
  background: #f7f3ee;
}

@media (min-width: 1024px) {
  .form-panel {
    background: #ffffff;
    padding: 40px 48px;
  }
}

/* ── Form Container (Card on mobile, clean on desktop) ── */
.form-container {
  width: 100%;
  max-width: 430px;
  background: #ffffff;
  border-radius: 26px;
  padding: 38px 32px;
  box-shadow:
    0 1px 4px rgba(44, 24, 16, 0.05),
    0 8px 36px rgba(44, 24, 16, 0.08);
  border: 1px solid rgba(176, 125, 79, 0.08);
  animation: formSlideIn 0.55s ease-out;
}

@keyframes formSlideIn {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (min-width: 1024px) {
  .form-container {
    max-width: 400px;
    background: transparent;
    box-shadow: none;
    border: none;
    border-radius: 0;
    padding: 0;
  }
}

/* ── Mobile Brand Header ── */
.mobile-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 30px;
  padding-bottom: 22px;
  border-bottom: 1px solid #f0e8de;
}

.mobile-logo-img {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  object-fit: contain;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
}

.mobile-brand-text h1 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 900;
  color: #1c1410;
}

.mobile-brand-text p {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: #9c8e82;
  font-weight: 600;
}

@media (min-width: 1024px) {
  .mobile-brand {
    display: none;
  }
}

/* ── Form Heading ── */
.form-heading {
  margin-bottom: 28px;
}

.form-heading h2 {
  font-size: 1.65rem;
  font-weight: 800;
  color: #1c1410;
  margin: 0 0 6px;
}

.form-heading p {
  font-size: 0.88rem;
  color: #7c6b5d;
  margin: 0;
  font-weight: 500;
  line-height: 1.6;
}

/* ── Dev Quick-Fill Pill ── */
.dev-pill {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  margin-bottom: 22px;
  border-radius: 12px;
  background: rgba(176, 125, 79, 0.07);
  border: 1.5px dashed rgba(176, 125, 79, 0.32);
  color: #8b5e3c;
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.25s ease;
}

.dev-pill svg {
  color: #b07d4f;
  flex-shrink: 0;
}

.dev-pill:hover {
  background: rgba(176, 125, 79, 0.14);
  border-color: #b07d4f;
  transform: translateY(-1px);
}

/* ── Login Form ── */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ════════════════════════════════════════════════════════════════════
   FLOATING LABEL INPUT FIELDS
   ════════════════════════════════════════════════════════════════════ */
.field-shell {
  position: relative;
  display: flex;
  align-items: center;
}

/* Field icon (right side in RTL) */
.field-icon {
  position: absolute;
  right: 15px;
  color: #bba998;
  pointer-events: none;
  z-index: 3;
  transition: color 0.25s ease;
}

/* Input base */
.field-shell input {
  width: 100%;
  height: 56px;
  padding: 22px 46px 8px 16px;
  border: 1.5px solid #e6d9cc;
  border-radius: 14px;
  background: #faf7f2;
  color: #1c1410;
  font-size: 0.95rem;
  font-weight: 600;
  font-family: inherit;
  outline: none;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Increase left padding for password (eye button space) */
.field-shell input[autocomplete='current-password'] {
  padding-left: 46px;
}

/* Floating label (positioned inside the field) */
.field-shell label {
  position: absolute;
  right: 46px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.88rem;
  font-weight: 600;
  color: #9c8e82;
  pointer-events: none;
  transform-origin: right center;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Label floats up on focus or when input has content */
.field-shell input:focus + label,
.field-shell input:not(:placeholder-shown) + label {
  top: 11px;
  transform: translateY(0) scale(0.78);
  color: #b07d4f;
  font-weight: 700;
}

/* Input focus ring */
.field-shell input:focus {
  border-color: #b07d4f;
  box-shadow: 0 0 0 3.5px rgba(176, 125, 79, 0.12);
  background: #ffffff;
}

/* Icon color change on focus */
.field-shell:has(input:focus) .field-icon {
  color: #b07d4f;
}

/* Eye toggle button */
.eye-btn {
  position: absolute;
  left: 13px;
  background: none;
  border: none;
  color: #bba998;
  cursor: pointer;
  padding: 5px;
  display: flex;
  align-items: center;
  z-index: 3;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.eye-btn:hover {
  color: #4a3f37;
  background: rgba(176, 125, 79, 0.08);
}

/* ════════════════════════════════════════════════════════════════════
   CUSTOM CHECKBOX
   ════════════════════════════════════════════════════════════════════ */
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

.check-mark {
  width: 20px;
  height: 20px;
  border: 2px solid #d5c8bb;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}

.check-mark svg {
  width: 12px;
  height: 10px;
  color: #ffffff;
  opacity: 0;
  transform: scale(0) rotate(-15deg);
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.custom-check input:checked + .check-mark {
  background: #b07d4f;
  border-color: #b07d4f;
  box-shadow: 0 2px 8px rgba(176, 125, 79, 0.3);
}

.custom-check input:checked + .check-mark svg {
  opacity: 1;
  transform: scale(1) rotate(0deg);
}

.check-label {
  font-size: 0.82rem;
  color: #7c6b5d;
  font-weight: 600;
}

/* Forgot password link */
.forgot-link {
  background: none;
  border: none;
  color: #b07d4f;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  transition: color 0.2s ease;
}

.forgot-link:hover {
  color: #8b5e3c;
  text-decoration: underline;
}

/* ════════════════════════════════════════════════════════════════════
   ERROR BANNER
   ════════════════════════════════════════════════════════════════════ */
.error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(220, 38, 38, 0.06);
  border: 1px solid rgba(220, 38, 38, 0.16);
  color: #dc2626;
  font-size: 0.84rem;
  font-weight: 700;
}

.error-banner svg {
  flex-shrink: 0;
}

/* Error enter/exit animation */
.err-slide-enter-active {
  animation: errIn 0.32s ease-out;
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

/* ════════════════════════════════════════════════════════════════════
   SUBMIT BUTTON — Warm Gradient with Shimmer Sweep
   ════════════════════════════════════════════════════════════════════ */
.submit-btn {
  position: relative;
  width: 100%;
  height: 52px;
  margin-top: 6px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #b87d4a 0%, #8b5e3c 50%, #7a4e30 100%);
  color: #ffffff;
  font-size: 1rem;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  overflow: hidden;
  box-shadow:
    0 4px 16px rgba(176, 125, 79, 0.32),
    0 1px 3px rgba(176, 125, 79, 0.15);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow:
    0 8px 30px rgba(176, 125, 79, 0.45),
    0 2px 6px rgba(176, 125, 79, 0.2);
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* Shimmer sweep effect */
.shimmer-sweep {
  position: absolute;
  top: 0;
  left: -100%;
  width: 55%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22), transparent);
  transform: skewX(-25deg);
  animation: shimmer 3.8s infinite;
  pointer-events: none;
}

@keyframes shimmer {
  0% {
    left: -100%;
  }
  22%,
  100% {
    left: 200%;
  }
}

.btn-face {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* Loading spinner */
.btn-spinner {
  position: relative;
  z-index: 2;
  width: 22px;
  height: 22px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #ffffff;
  margin: 0 auto;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ════════════════════════════════════════════════════════════════════
   FORM FOOTER — Server Status & Credit
   ════════════════════════════════════════════════════════════════════ */
.form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px solid #f0e8de;
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
  color: #9c8e82;
  font-weight: 600;
}

.credit-line {
  font-size: 0.72rem;
  color: #c5b8aa;
  font-weight: 600;
}

/* ════════════════════════════════════════════════════════════════════
   SHAKE ANIMATION — Error Haptic Feedback
   ════════════════════════════════════════════════════════════════════ */
.card-shake {
  animation: cardShake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

@keyframes cardShake {
  10%,
  90% {
    transform: translateX(-2px);
  }
  20%,
  80% {
    transform: translateX(4px);
  }
  30%,
  50%,
  70% {
    transform: translateX(-6px);
  }
  40%,
  60% {
    transform: translateX(6px);
  }
}

/* ════════════════════════════════════════════════════════════════════
   RESPONSIVE — Mobile Optimizations
   ════════════════════════════════════════════════════════════════════ */
@media (max-width: 480px) {
  .form-panel {
    padding: 18px 14px;
  }

  .form-container {
    padding: 28px 22px;
    border-radius: 22px;
  }

  .form-heading h2 {
    font-size: 1.4rem;
  }

  .brand-title {
    font-size: 2.1rem;
  }
}

/* Tablet landscape adjustments */
@media (min-width: 768px) and (max-width: 1023px) {
  .form-container {
    max-width: 460px;
    padding: 44px 38px;
  }
}

/* Large desktops — more spacious brand panel */
@media (min-width: 1440px) {
  .brand-logo-img {
    width: 150px;
    height: 150px;
  }

  .brand-title {
    font-size: 2.9rem;
  }

  .brand-tagline {
    font-size: 1rem;
  }
}

/* ════════════════════════════════════════════════════════════════════
   PREFERS-REDUCED-MOTION — Accessibility
   ════════════════════════════════════════════════════════════════════ */
@media (prefers-reduced-motion: reduce) {
  .brand-orb,
  .brand-logo-img,
  .logo-ambient-glow,
  .shimmer-sweep,
  .pulse-dot {
    animation: none !important;
  }

  .form-container,
  .brand-body {
    animation: none !important;
  }
}
</style>

<template>
  <div class="login-page-v2" dir="rtl">
    <!-- ═══════════════════════════════════════════════════════════════
         RIGHT SIDE: Brand Showcase & 3D Visuals
         ═══════════════════════════════════════════════════════════════ -->
    <aside class="brand-panel">
      <!-- Atmospheric dark cinematic background with warm lighting -->
      <div class="cinematic-bg" aria-hidden="true"></div>
      <div class="ambient-light" aria-hidden="true"></div>

      <div class="brand-content">
        <!-- 3D Logo representation -->
        <div class="brand-logo-3d">
          <img
            src="/logo-transparent.png"
            alt="بن العجوز"
            class="logo-img"
            @error="handleLogoError"
          />
          <div class="logo-glow" aria-hidden="true"></div>
        </div>

        <!-- Typography -->
        <h1 class="calligraphy-title">بن العجوز</h1>
        <h2 class="calligraphy-subtitle">أصل المزاج</h2>
      </div>
    </aside>

    <!-- ═══════════════════════════════════════════════════════════════
         LEFT SIDE: Glassmorphism Login Interface
         ═══════════════════════════════════════════════════════════════ -->
    <main class="form-panel">
      <!-- Dark backdrop for the left side to match the overall dark aesthetic -->
      <div class="form-backdrop" aria-hidden="true"></div>

      <!-- Glassmorphism Container -->
      <div class="glass-container" :class="{ 'card-shake': shakeCard }">
        <!-- Mobile Header (Visible only on small screens) -->
        <div class="mobile-brand">
          <img src="/logo-transparent.png" alt="بن العجوز" @error="handleLogoError" />
          <div class="mobile-text">
            <h1>بن العجوز</h1>
            <p>أصل المزاج</p>
          </div>
        </div>

        <div class="form-header">
          <h2>تسجيل الدخول</h2>
          <p>أدخل بياناتك للوصول إلى لوحة التحكم</p>
        </div>

        <!-- ========== LOGIN FORM ========== -->
        <form @submit.prevent="handleLogin" class="glass-form" novalidate>
          <!-- Username Field -->
          <div class="input-group">
            <label for="login-username">اسم المستخدم</label>
            <div class="input-wrapper">
              <svg
                class="input-icon"
                width="20"
                height="20"
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
                placeholder="أدخل اسم المستخدم الخاص بك"
                required
                autocomplete="username"
              />
            </div>
          </div>

          <!-- Password Field -->
          <div class="input-group">
            <label for="login-password">كلمة المرور</label>
            <div class="input-wrapper">
              <svg
                class="input-icon"
                width="20"
                height="20"
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
                placeholder="••••••••"
                required
                autocomplete="current-password"
              />
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

          <!-- Options -->
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
              <span class="check-label">تذكر بياناتي</span>
            </label>
            <button type="button" class="forgot-link" @click="showForgotHelp">
              هل نسيت كلمة المرور؟
            </button>
          </div>

          <!-- Error Message -->
          <Transition name="fade-slide">
            <div v-if="error" class="error-msg">
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
            <span v-else class="btn-text">
              تسجيل الدخول
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
          </button>
        </form>

        <div class="footer-links">
          <p>ليس لديك حساب؟ <a href="#" @click.prevent="showForgotHelp">تواصل مع الإدارة</a></p>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

// Form State
const form = ref({ username: '', password: '' });
const rememberMe = ref(true);
const loading = ref(false);
const showPassword = ref(false);
const error = ref('');
const shakeCard = ref(false);

const showForgotHelp = () => {
  alert('يرجى التواصل مع مسؤول النظام لإنشاء حساب أو إعادة تعيين كلمة المرور الخاصة بك.');
};

const handleLogin = async () => {
  if (!form.value.username || !form.value.password) return;
  loading.value = true;
  error.value = '';
  try {
    await auth.login(form.value.username, form.value.password);
    router.push('/');
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
</script>

<style scoped>
/* 
  FONT IMPORTS 
  Using 'Cairo' for Modern UI Arabic texts and 'Aref Ruqaa' for Arabic calligraphy
*/
@import url('https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=Cairo:wght@400;500;600;700;800&display=swap');

/* ════════════════════════════════════════════════════════════════════
   ROOT LAYOUT
   ════════════════════════════════════════════════════════════════════ */
.login-page-v2 {
  display: flex;
  min-height: 100dvh;
  direction: rtl; /* This naturally puts Brand on the Right and Form on the Left */
  font-family: 'Cairo', sans-serif;
  background: #0a0604;
  color: #fff;
}

/* ════════════════════════════════════════════════════════════════════
   RIGHT SIDE — BRAND SHOWCASE (Cinematic Dark Coffee)
   ════════════════════════════════════════════════════════════════════ */
.brand-panel {
  display: none;
  flex: 1.2;
  position: relative;
  overflow: hidden;
  align-items: center;
  justify-content: center;
}

@media (min-width: 1024px) {
  .brand-panel {
    display: flex;
  }
}

/* Deep espresso gradient mimicking a cinematic backdrop */
.cinematic-bg {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 40%, #2a160d 0%, #110905 50%, #050201 100%);
  z-index: 0;
}

/* Warm ambient golden light */
.ambient-light {
  position: absolute;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(218, 165, 32, 0.15) 0%, transparent 60%);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
  pointer-events: none;
}

.brand-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

/* 3D Logo Styling */
.brand-logo-3d {
  position: relative;
  margin-bottom: 30px;
  animation: float3D 6s ease-in-out infinite;
}

.logo-img {
  width: 220px;
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 20px 30px rgba(0, 0, 0, 0.8));
  position: relative;
  z-index: 2;
}

.logo-glow {
  position: absolute;
  inset: 10px;
  background: radial-gradient(circle, rgba(255, 180, 80, 0.4), transparent 70%);
  filter: blur(25px);
  z-index: 1;
  animation: pulseGlow 4s ease-in-out infinite;
}

@keyframes float3D {
  0%,
  100% {
    transform: translateY(0) rotateX(0deg) rotateY(0deg);
  }
  50% {
    transform: translateY(-15px) rotateX(5deg) rotateY(5deg);
  }
}

@keyframes pulseGlow {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

/* Typography (Arabic Calligraphy) */
.calligraphy-title {
  font-family: 'Aref Ruqaa', serif;
  font-size: 5rem;
  font-weight: 700;
  color: #e8d0a9;
  margin: 0;
  text-shadow: 2px 4px 15px rgba(0, 0, 0, 0.6);
  line-height: 1.2;
}

.calligraphy-subtitle {
  font-family: 'Aref Ruqaa', serif;
  font-size: 2rem;
  font-weight: 400;
  color: #c4a47c;
  margin: 0;
  margin-top: -10px;
  text-shadow: 1px 2px 10px rgba(0, 0, 0, 0.5);
}

/* ════════════════════════════════════════════════════════════════════
   LEFT SIDE — GLASSMORPHISM FORM
   ════════════════════════════════════════════════════════════════════ */
.form-panel {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

/* Dark espresso backdrop to unify with right side */
.form-backdrop {
  position: absolute;
  inset: 0;
  background: #140a06;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.02) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.02) 25%, transparent 25%);
  background-size: 20px 20px;
  z-index: 0;
}

.glass-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;

  /* Enhanced Glassmorphism Effect */
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 30px 60px rgba(0, 0, 0, 0.7),
    inset 0 0 30px rgba(255, 255, 255, 0.03);
  border-radius: 28px;
  padding: 50px 45px;

  animation: slideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1);
  transition:
    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 0.4s ease;
}

.glass-container:hover {
  transform: translateY(-5px);
  box-shadow:
    0 40px 70px rgba(0, 0, 0, 0.8),
    inset 0 0 30px rgba(255, 255, 255, 0.04);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(40px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.mobile-brand {
  display: none;
  align-items: center;
  justify-content: center;
  gap: 15px;
  margin-bottom: 30px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 20px;
}

@media (max-width: 1023px) {
  .mobile-brand {
    display: flex;
  }
}

.mobile-brand img {
  width: 55px;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5));
}

.mobile-text h1 {
  font-family: 'Aref Ruqaa', serif;
  font-size: 2rem;
  margin: 0;
  color: #e8d0a9;
}
.mobile-text p {
  font-family: 'Aref Ruqaa', serif;
  margin: 0;
  font-size: 1.1rem;
  color: #c4a47c;
}

.form-header {
  text-align: center;
  margin-bottom: 40px;
}

.form-header h2 {
  font-size: 2.2rem;
  font-weight: 700;
  color: #e8d0a9;
  margin: 0;
  letter-spacing: 0px;
}

.form-header p {
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.95rem;
  margin: 8px 0 0;
  font-weight: 500;
}

.glass-form {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.input-group label {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 600;
  margin-right: 5px; /* RTL right margin */
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  right: 18px; /* Icon on the right for RTL */
  color: rgba(255, 255, 255, 0.35);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.input-wrapper input {
  width: 100%;
  height: 56px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 0 50px 0 20px; /* Space on right for icon */
  color: #fff;
  font-size: 1rem;
  font-family: 'Cairo', sans-serif;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.2);
}

.input-wrapper input::placeholder {
  color: rgba(255, 255, 255, 0.25);
  font-weight: 400;
}

/* Glowing Amber Border on Focus */
.input-wrapper input:focus {
  outline: none;
  border-color: #d49a5b;
  background: rgba(0, 0, 0, 0.45);
  box-shadow:
    0 0 20px rgba(212, 154, 91, 0.15),
    inset 0 2px 6px rgba(0, 0, 0, 0.3);
  transform: translateY(-2px);
}

.input-wrapper:focus-within .input-icon {
  color: #d49a5b;
  transform: scale(1.1);
}

.eye-btn {
  position: absolute;
  left: 18px; /* Eye on the left for RTL */
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  padding: 4px;
  display: flex;
  transition: all 0.3s;
  border-radius: 50%;
}

.eye-btn:hover {
  color: #e8d0a9;
  background: rgba(255, 255, 255, 0.05);
}

.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  margin-top: -5px;
  padding: 0 4px;
}

.custom-check {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.custom-check input {
  display: none;
}

.check-mark {
  width: 20px;
  height: 20px;
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: rgba(0, 0, 0, 0.2);
}

.check-mark svg {
  width: 12px;
  height: 12px;
  color: #000;
  opacity: 0;
  transform: scale(0) rotate(-15deg);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.custom-check:hover .check-mark {
  border-color: rgba(255, 255, 255, 0.4);
}

.custom-check input:checked + .check-mark {
  background: #d49a5b;
  border-color: #d49a5b;
  box-shadow: 0 4px 10px rgba(212, 154, 91, 0.3);
}

.custom-check input:checked + .check-mark svg {
  opacity: 1;
  transform: scale(1) rotate(0);
}

.check-label {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
  transition: color 0.3s;
}

.custom-check:hover .check-label {
  color: rgba(255, 255, 255, 0.9);
}

.forgot-link {
  color: #d49a5b;
  text-decoration: underline;
  text-decoration-color: transparent;
  transition: all 0.3s;
  font-weight: 600;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
}

.forgot-link:hover {
  text-decoration-color: #d49a5b;
  color: #e8d0a9;
}

.submit-btn {
  height: 58px;
  margin-top: 15px;
  background: linear-gradient(135deg, #d49a5b 0%, #8a572a 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  color: #fff;
  font-size: 1.15rem;
  font-weight: 700;
  font-family: 'Cairo', sans-serif;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow:
    0 10px 25px rgba(138, 87, 42, 0.35),
    inset 0 2px 5px rgba(255, 255, 255, 0.2);
  position: relative;
  overflow: hidden;
}

/* Elegant light sweep effect */
.submit-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -150%;
  width: 150%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
  transform: skewX(-20deg);
  transition: left 0.7s cubic-bezier(0.4, 0, 0.2, 1);
}

.submit-btn:hover::before {
  left: 150%;
}

.submit-btn:hover {
  transform: translateY(-3px);
  box-shadow:
    0 15px 35px rgba(138, 87, 42, 0.5),
    inset 0 2px 5px rgba(255, 255, 255, 0.3);
  filter: brightness(1.1);
}

.submit-btn:active {
  transform: translateY(1px);
  box-shadow: 0 5px 15px rgba(138, 87, 42, 0.3);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  filter: grayscale(0.5);
}

.btn-text {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.btn-spinner {
  display: inline-block;
  width: 24px;
  height: 24px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.footer-links {
  margin-top: 30px;
  text-align: center;
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 500;
}

.footer-links a {
  color: #d49a5b;
  font-weight: 700;
  text-decoration: none;
  margin-right: 5px; /* RTL margin */
  transition: color 0.3s;
}

.footer-links a:hover {
  color: #e8d0a9;
}

.error-msg {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #ff8787;
  background: rgba(255, 107, 107, 0.15);
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 107, 107, 0.3);
  font-size: 0.95rem;
  font-weight: 600;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.card-shake {
  animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

@keyframes shake {
  10%,
  90% {
    transform: translate3d(-1px, 0, 0);
  }
  20%,
  80% {
    transform: translate3d(2px, 0, 0);
  }
  30%,
  50%,
  70% {
    transform: translate3d(-5px, 0, 0);
  }
  40%,
  60% {
    transform: translate3d(5px, 0, 0);
  }
}

@media (max-width: 480px) {
  .glass-container {
    padding: 35px 25px;
    border-radius: 22px;
  }
  .form-header h2 {
    font-size: 1.9rem;
  }
}
</style>

<template>
  <div class="login-page" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
    <!-- Aurora Animated Mesh Gradient Backdrop -->
    <div class="aurora-bg">
      <div class="aurora-blob blob-1"></div>
      <div class="aurora-blob blob-2"></div>
      <div class="aurora-blob blob-3"></div>
    </div>
    
    <!-- Interactive Particle Grid Pattern -->
    <div class="grid-overlay"></div>

    <!-- Center Floating Executive Card -->
    <main ref="cardRef" class="login-floating-card" :class="{ 'shake-error': shakeCard }">
      <!-- Top Glow Bar -->
      <div class="card-top-beam"></div>

      <!-- Header & Brand Mark -->
      <header class="card-header">
        <div class="logo-wrapper">
          <AppLogo size="xl" :rounded="true" class="logo-img" />
          <div class="logo-glow-ring"></div>
        </div>
        <div class="brand-text">
          <span class="system-badge">
            <AppIcon name="shieldCheck" :size="13" />
            <span>نظام التشغيل والتخطيط الذكي</span>
          </span>
          <h1 class="system-title">بن العجوز ERP</h1>
          <p class="system-subtitle">ادخل بياناتك للمتابعة إلى لوحة التحكم الإدارية</p>
        </div>
      </header>

      <!-- Quick Fast-Fill Demo Button (development only) -->
      <button
        v-if="isDev"
        type="button"
        class="quick-admin-pill"
        @click="fillQuickDemo"
        title="تعبئة بيانات الحساب التجريبي بنقرة واحدة"
      >
        <AppIcon name="sparkles" :size="15" class="sparkle-icon" />
        <span>دخول سريع بصلاحية المدير (Demo Admin)</span>
      </button>

      <!-- Login Form -->
      <form class="login-form" @submit.prevent="handleLogin">
        <!-- Username Field -->
        <div class="field-group">
          <label for="username">اسم المستخدم</label>
          <div class="input-shell">
            <AppIcon name="users" :size="18" class="input-icon" />
            <input 
              id="username"
              v-model="form.username" 
              type="text" 
              required 
              placeholder="اسم المستخدم..." 
              autocomplete="username" 
            />
          </div>
        </div>

        <!-- Password Field -->
        <div class="field-group">
          <label for="password">كلمة المرور</label>
          <div class="input-shell">
            <AppIcon name="lock" :size="18" class="input-icon" />
            <input 
              id="password"
              v-model="form.password" 
              :type="showPassword ? 'text' : 'password'" 
              required 
              placeholder="كلمة المرور..." 
              autocomplete="current-password" 
            />
            <button 
              type="button" 
              class="eye-toggle-btn" 
              @click="showPassword = !showPassword"
              tabindex="-1"
              :title="showPassword ? 'إخفاء كلمة المرور' : 'عرض كلمة المرور'"
            >
              <AppIcon :name="showPassword ? 'eyeOff' : 'eye'" :size="17" />
            </button>
          </div>
        </div>

        <!-- Options Row -->
        <div class="options-row">
          <label class="remember-label">
            <input type="checkbox" v-model="rememberMe" />
            <span>تذكر هذا الجهاز</span>
          </label>
          <button type="button" class="forgot-btn" @click="showForgotHelp">
            نسيت كلمة المرور؟
          </button>
        </div>

        <!-- Error Message Banner -->
        <div v-if="error" class="error-banner">
          <AppIcon name="alertTriangle" :size="17" />
          <span>{{ error }}</span>
        </div>

        <!-- Shimmer Submit Button -->
        <button type="submit" class="shimmer-submit-btn" :disabled="loading">
          <div class="shimmer-sweep"></div>
          <span v-if="loading" class="spinner"></span>
          <span v-else class="btn-inner">
            <span>تسجيل الدخول للنظام</span>
            <AppIcon name="arrowLeft" :size="18" />
          </span>
        </button>
      </form>

      <!-- System Health Footer -->
      <footer class="card-footer">
        <div class="health-status">
          <span class="ping-dot"></span>
          <span>السيرفر متصل (32ms) · تشفير JWT 256-bit</span>
        </div>
        <span class="copyright-tag">تطوير Karim Yehia</span>
      </footer>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppLogo from '@/components/AppLogo.vue';
import AppIcon from '@/components/AppIcon.vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const isDev = import.meta.env.DEV;

const form = ref({ username: '', password: '' });
const rememberMe = ref(true);
const loading = ref(false);
const showPassword = ref(false);
const error = ref('');
const cardRef = ref(null);
const shakeCard = ref(false);

const fillQuickDemo = () => {
  form.value.username = 'admin';
  form.value.password = 'admin123';
  handleLogin();
};

const showForgotHelp = () => {
  alert('يرجى التواصل مع مسؤول النظام لإعادة ضبط وتحديث كلمة المرور الخاصة بك.');
};

const handleLogin = async () => {
  if (!form.value.username || !form.value.password) return;
  loading.value = true;
  error.value = '';
  try {
    await auth.login(form.value.username, form.value.password);
    router.push('/');
  } catch (e) {
    error.value = e.message || 'اسم المستخدم أو كلمة المرور غير صحيحة';
    shakeCard.value = true;
    setTimeout(() => {
      shakeCard.value = false;
    }, 450);
  } finally {
    loading.value = false;
  }
};

// 3D Parallax Tilt Effect on MouseMove
const handleMouseMove = (e) => {
  if (!cardRef.value) return;
  const card = cardRef.value;
  const rect = card.getBoundingClientRect();
  
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2;
  
  const rotateX = -(y / rect.height) * 6;
  const rotateY = (x / rect.width) * 6;
  
  card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
};

const handleMouseLeave = () => {
  if (!cardRef.value) return;
  cardRef.value.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
};
</script>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #070a12;
  position: relative;
  overflow: hidden;
  direction: rtl;
  font-family: inherit;
}

/* Aurora Backdrop Blobs */
.aurora-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.aurora-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(130px);
  opacity: 0.35;
  animation: floatAurora 18s ease-in-out infinite alternate;
}

.blob-1 {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(199, 122, 47, 0.45), transparent 70%);
  top: -20%;
  left: 50%;
  transform: translateX(-50%);
}

.blob-2 {
  width: 450px;
  height: 450px;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.3), transparent 70%);
  bottom: -10%;
  right: 10%;
  animation-delay: -6s;
}

.blob-3 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.25), transparent 70%);
  bottom: 20%;
  left: 5%;
  animation-delay: -12s;
}

@keyframes floatAurora {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(30px, -40px) scale(1.08); }
  100% { transform: translate(-20px, 30px) scale(0.95); }
}

/* Grid Pattern Overlay */
.grid-overlay {
  position: absolute;
  inset: 0;
  background-image: 
    linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
  opacity: 0.8;
}

/* Center Floating Executive Glass Card */
.login-floating-card {
  width: min(460px, 92vw);
  background: rgba(13, 18, 30, 0.82);
  backdrop-filter: blur(32px);
  -webkit-backdrop-filter: blur(32px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 28px;
  padding: 40px 36px;
  box-shadow: 
    0 30px 90px -20px rgba(0, 0, 0, 0.8),
    0 0 60px rgba(199, 122, 47, 0.15);
  position: relative;
  overflow: hidden;
  z-index: 10;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Glowing Top Beam Bar */
.card-top-beam {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #c77a2f, #f59e0b, transparent);
}

/* Header & Brand Mark */
.card-header {
  text-align: center;
  margin-bottom: 24px;
}

.logo-wrapper {
  position: relative;
  display: inline-block;
  margin-bottom: 16px;
}

.logo-img {
  position: relative;
  z-index: 2;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
}

.logo-glow-ring {
  position: absolute;
  inset: -8px;
  border-radius: 24px;
  background: radial-gradient(circle, rgba(199, 122, 47, 0.5), transparent 70%);
  filter: blur(10px);
  z-index: 1;
}

.system-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  font-weight: 800;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.25);
  padding: 4px 12px;
  border-radius: 20px;
  margin-bottom: 10px;
}

.system-title {
  margin: 0;
  font-size: 1.85rem;
  font-weight: 900;
  color: #ffffff;
  letter-spacing: -0.5px;
}

.system-subtitle {
  margin: 6px 0 0;
  font-size: 0.86rem;
  color: #94a3b8;
  font-weight: 500;
}

/* Quick Admin Fast-Fill Pill */
.quick-admin-pill {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 16px;
  margin-bottom: 22px;
  border-radius: 14px;
  background: rgba(199, 122, 47, 0.12);
  border: 1px dashed rgba(199, 122, 47, 0.45);
  color: #fbbf24;
  font-size: 0.86rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.25s ease;
}

.quick-admin-pill:hover {
  background: rgba(199, 122, 47, 0.24);
  border-color: #f59e0b;
  transform: translateY(-1px);
}

.sparkle-icon {
  color: #f59e0b;
}

/* Form Styles */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-group label {
  display: block;
  font-size: 0.84rem;
  font-weight: 700;
  color: #cbd5e1;
  margin-bottom: 6px;
}

.input-shell {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  right: 14px;
  color: #64748b;
  pointer-events: none;
}

.input-shell input {
  width: 100%;
  padding: 12px 44px 12px 42px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(7, 10, 18, 0.65);
  color: #ffffff;
  font-size: 0.94rem;
  font-weight: 600;
  outline: none;
  transition: all 0.25s ease;
}

.input-shell input:focus {
  border-color: #c77a2f;
  box-shadow: 0 0 0 3px rgba(199, 122, 47, 0.25);
  background: rgba(7, 10, 18, 0.95);
}

.eye-toggle-btn {
  position: absolute;
  left: 12px;
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.2s ease;
}

.eye-toggle-btn:hover {
  color: #f8fafc;
}

/* Options Row */
.options-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.82rem;
  margin-top: 2px;
}

.remember-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  cursor: pointer;
  user-select: none;
}

.remember-label input[type="checkbox"] {
  accent-color: #c77a2f;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.forgot-btn {
  background: transparent;
  border: none;
  color: #f59e0b;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.82rem;
  padding: 0;
  transition: color 0.2s ease;
}

.forgot-btn:hover {
  color: #fbbf24;
  text-decoration: underline;
}

/* Error Banner */
.error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.14);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #f87171;
  font-size: 0.84rem;
  font-weight: 700;
}

/* Shimmer Submit Button */
.shimmer-submit-btn {
  position: relative;
  width: 100%;
  padding: 14px;
  margin-top: 6px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #c77a2f 0%, #a35d1e 100%);
  color: #ffffff;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 22px rgba(199, 122, 47, 0.38);
  overflow: hidden;
  transition: all 0.25s ease;
}

.shimmer-submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(199, 122, 47, 0.55);
}

.shimmer-submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.shimmer-sweep {
  position: absolute;
  top: 0;
  left: -100%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transform: skewX(-25deg);
  animation: sweep 3s infinite;
}

@keyframes sweep {
  0% { left: -100%; }
  30%, 100% { left: 180%; }
}

.btn-inner {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* Footer Status */
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 26px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.health-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  color: #94a3b8;
}

.ping-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.copyright-tag {
  font-size: 0.75rem;
  color: #64748b;
}

/* Shake Animation */
.shake-error {
  animation: shake 0.45s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-10px); }
  40%, 80% { transform: translateX(10px); }
}

/* Spinner */
.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #ffffff;
  margin: 0 auto;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 480px) {
  .login-floating-card {
    padding: 30px 22px;
    border-radius: 22px;
  }
}
</style>

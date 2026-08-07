<template>
  <div class="login-page" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
    <!-- Ambient Background Lighting Orbs -->
    <div class="bg-glow orb-1"></div>
    <div class="bg-glow orb-2"></div>
    <div class="bg-glow orb-3"></div>

    <div ref="shellRef" class="login-container" :class="{ 'shake-error': shakeCard }">
      
      <!-- Right Side: Executive Brand Stage -->
      <div class="brand-stage">
        <div class="brand-glow-halo">
          <AppLogo size="xxl" :rounded="true" class="brand-logo" />
        </div>

        <div class="brand-header">
          <span class="brand-tag">ERP SYSTEM v1.0</span>
          <h1 class="brand-title">بن العجوز</h1>
          <p class="brand-subtitle">نظام الإدارة وتخطيط الموارد الشامل</p>
        </div>

        <!-- System Capability Chips -->
        <div class="brand-features">
          <div class="feature-chip">
            <span class="chip-icon">⚡</span>
            <div class="chip-info">
              <span class="chip-title">معالجة فورية</span>
              <span class="chip-sub">استجابة 82ms</span>
            </div>
          </div>
          <div class="feature-chip">
            <span class="chip-icon">🔒</span>
            <div class="chip-info">
              <span class="chip-title">تشفير متقدم</span>
              <span class="chip-sub">JWT 256-bit Token</span>
            </div>
          </div>
          <div class="feature-chip">
            <span class="chip-icon">📊</span>
            <div class="chip-info">
              <span class="chip-title">تحليلات مركزية</span>
              <span class="chip-sub">رادار المخاطر والأرباح</span>
            </div>
          </div>
        </div>

        <div class="brand-footer">
          <span>نظام تشغيل وإدارة الفروع والعمليات الحية</span>
        </div>
      </div>

      <!-- Left Side: Login Form Card -->
      <div class="login-card">
        <div class="card-header">
          <span class="welcome-badge">مرحباً بك</span>
          <h2>تسجيل الدخول للنظام</h2>
          <p>يرجى إدخال اسم المستخدم وكلمة المرور للمتابعة</p>
        </div>

        <!-- Quick Demo Account Fill Button -->
        <button type="button" class="quick-demo-btn" @click="fillQuickDemo" title="تعبئة بيانات الحساب التجريبي بنقرة واحدة">
          <span class="demo-sparkle">🔑</span>
          <span>دخول تجريبي سريع (Admin)</span>
        </button>

        <form class="login-form" @submit.prevent="handleLogin">
          <!-- Username Input -->
          <div class="input-group">
            <label for="username">اسم المستخدم *</label>
            <div class="input-wrapper">
              <span class="input-icon">👤</span>
              <input 
                id="username"
                v-model="form.username" 
                type="text" 
                required 
                placeholder="أدخل اسم المستخدم..." 
                autocomplete="username" 
              />
            </div>
          </div>

          <!-- Password Input -->
          <div class="input-group">
            <label for="password">كلمة المرور *</label>
            <div class="input-wrapper">
              <span class="input-icon">🔑</span>
              <input 
                id="password"
                v-model="form.password" 
                :type="showPassword ? 'text' : 'password'" 
                required 
                placeholder="أدخل كلمة المرور..." 
                autocomplete="current-password" 
              />
              <button 
                type="button" 
                class="password-toggle" 
                @click="showPassword = !showPassword"
                tabindex="-1"
                :title="showPassword ? 'إخفاء كلمة المرور' : 'عرض كلمة المرور'"
              >
                <AppIcon :name="showPassword ? 'eyeOff' : 'eye'" :size="18" />
              </button>
            </div>
          </div>

          <!-- Error Alert Message -->
          <div v-if="error" class="error-alert">
            <span class="error-icon">⚠️</span>
            <span>{{ error }}</span>
          </div>

          <!-- Submit Button -->
          <button type="submit" class="submit-btn" :disabled="loading">
            <span v-if="loading" class="spinner"></span>
            <span v-else>دخول النظام 🚀</span>
          </button>
        </form>

        <!-- Live Server Status Indicator -->
        <div class="card-footer">
          <div class="status-indicator">
            <span class="status-dot online"></span>
            <span>السيرفر متصل · بن العجوز ERP</span>
          </div>
          <small class="dev-credits">تطوير Karim Yehia</small>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppLogo from '@/components/AppLogo.vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

const form = ref({ username: '', password: '' });
const loading = ref(false);
const showPassword = ref(false);
const error = ref('');
const shellRef = ref(null);
const shakeCard = ref(false);

const fillQuickDemo = () => {
  form.value.username = 'admin';
  form.value.password = 'admin123';
  handleLogin();
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
    }, 500);
  } finally {
    loading.value = false;
  }
};

// 3D Tilt Effect on MouseMove
const handleMouseMove = (e) => {
  if (!shellRef.value) return;
  const shell = shellRef.value;
  const rect = shell.getBoundingClientRect();
  
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2;
  
  const rotateX = -(y / rect.height) * 5;
  const rotateY = (x / rect.width) * 5;
  
  shell.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
};

const handleMouseLeave = () => {
  if (!shellRef.value) return;
  shellRef.value.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg)';
};
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: radial-gradient(circle at 50% 20%, #1e293b 0%, #0f172a 100%);
  position: relative;
  overflow: hidden;
  direction: rtl;
  font-family: inherit;
}

/* Ambient Glow Orbs */
.bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.3;
  pointer-events: none;
}
.orb-1 {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(199,122,47,0.4), transparent 70%);
  top: -10%;
  right: 10%;
}
.orb-2 {
  width: 450px;
  height: 450px;
  background: radial-gradient(circle, rgba(59,130,246,0.3), transparent 70%);
  bottom: -10%;
  left: 10%;
}
.orb-3 {
  width: 350px;
  height: 350px;
  background: radial-gradient(circle, rgba(16,185,129,0.25), transparent 70%);
  top: 40%;
  left: 35%;
}

/* Container Split Shell */
.login-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: min(1050px, 95vw);
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 28px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(199, 122, 47, 0.15);
  overflow: hidden;
  transition: transform 0.2s cubic-bezier(0.1, 0.9, 0.2, 1);
}

/* Right Side: Brand Stage */
.brand-stage {
  background: linear-gradient(135deg, rgba(199,122,47,0.15) 0%, rgba(30,41,59,0.9) 100%);
  padding: 48px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
}

.brand-glow-halo {
  width: 110px;
  height: 110px;
  border-radius: 28px;
  background: rgba(199, 122, 47, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(199, 122, 47, 0.3);
  box-shadow: 0 0 30px rgba(199, 122, 47, 0.25);
  margin-bottom: 24px;
}

.brand-tag {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 800;
  color: #c77a2f;
  background: rgba(199, 122, 47, 0.12);
  padding: 4px 12px;
  border-radius: 20px;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.brand-title {
  margin: 0;
  font-size: 2.2rem;
  font-weight: 900;
  color: #ffffff;
  letter-spacing: -0.5px;
}

.brand-subtitle {
  margin: 8px 0 0;
  font-size: 0.95rem;
  color: #94a3b8;
  font-weight: 500;
}

.brand-features {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 36px 0;
}

.feature-chip {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.25s ease;
}

.feature-chip:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(199, 122, 47, 0.3);
}

.chip-icon {
  font-size: 1.3rem;
}

.chip-title {
  display: block;
  font-size: 0.88rem;
  font-weight: 800;
  color: #f8fafc;
}

.chip-sub {
  display: block;
  font-size: 0.76rem;
  color: #94a3b8;
}

.brand-footer {
  font-size: 0.8rem;
  color: #64748b;
  font-weight: 500;
}

/* Left Side: Login Card */
.login-card {
  padding: 48px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.welcome-badge {
  color: #c77a2f;
  font-size: 0.82rem;
  font-weight: 800;
}

.card-header h2 {
  margin: 4px 0 6px;
  font-size: 1.6rem;
  font-weight: 800;
  color: #ffffff;
}

.card-header p {
  margin: 0 0 24px;
  font-size: 0.88rem;
  color: #94a3b8;
}

/* Quick Demo Button */
.quick-demo-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  margin-bottom: 22px;
  border-radius: 14px;
  background: rgba(199, 122, 47, 0.1);
  border: 1px dashed rgba(199, 122, 47, 0.4);
  color: #f59e0b;
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.25s ease;
}

.quick-demo-btn:hover {
  background: rgba(199, 122, 47, 0.2);
  border-color: #c77a2f;
  transform: translateY(-1px);
}

/* Form Styles */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.input-group label {
  display: block;
  font-size: 0.84rem;
  font-weight: 700;
  color: #cbd5e1;
  margin-bottom: 6px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  right: 14px;
  font-size: 1rem;
  opacity: 0.7;
  pointer-events: none;
}

.input-wrapper input {
  width: 100%;
  padding: 12px 42px 12px 40px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(15, 23, 42, 0.6);
  color: #ffffff;
  font-size: 0.95rem;
  font-weight: 600;
  outline: none;
  transition: all 0.25s ease;
}

.input-wrapper input:focus {
  border-color: #c77a2f;
  box-shadow: 0 0 0 3px rgba(199, 122, 47, 0.2);
  background: rgba(15, 23, 42, 0.9);
}

.password-toggle {
  position: absolute;
  left: 12px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
}

.password-toggle:hover {
  color: #ffffff;
}

.error-alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  font-size: 0.84rem;
  font-weight: 700;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #c77a2f 0%, #a35d1e 100%);
  color: #ffffff;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(199, 122, 47, 0.35);
  transition: all 0.25s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 6px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(199, 122, 47, 0.5);
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* Card Footer Indicator */
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  color: #94a3b8;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.online {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.dev-credits {
  font-size: 0.75rem;
  color: #64748b;
}

/* Shake animation on error */
.shake-error {
  animation: shake 0.4s ease-in-out;
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
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive Layout */
@media (max-width: 850px) {
  .login-container {
    grid-template-columns: 1fr;
  }
  .brand-stage {
    display: none;
  }
  .login-card {
    padding: 32px 24px;
  }
}
</style>

<template>
  <div class="login-page" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
    <!-- Ambient Background Light Orbs -->
    <div class="glow-orb orb-1"></div>
    <div class="glow-orb orb-2"></div>
    <div class="glow-orb orb-3"></div>

    <!-- Background Animated Mesh Grid -->
    <div class="bg-mesh-grid"></div>

    <!-- Main Split Glass Shell -->
    <div ref="shellRef" class="login-shell" :class="{ 'shake-error': shakeCard }">
      
      <!-- Right Side: Executive Brand Stage -->
      <section class="brand-stage">
        <div class="brand-glow-halo">
          <AppLogo size="xxl" :rounded="true" class="brand-logo" />
        </div>

        <div class="brand-header">
          <span class="brand-badge">
            <AppIcon name="coffee" :size="14" />
            <span>نظام إداري متكامل v1.0</span>
          </span>
          <h1 class="brand-title">بن العجوز</h1>
          <p class="brand-subtitle">منظومة التشغيل الذكية وتخطيط الموارد المتقدمة</p>
        </div>

        <!-- Capability Cards Bento -->
        <div class="bento-capabilities">
          <div class="bento-card">
            <div class="bento-icon-wrap amber">
              <AppIcon name="shieldCheck" :size="20" />
            </div>
            <div class="bento-content">
              <h4>أمان ومصادقة مشفرة</h4>
              <p>حماية عالية التشفير عبر بروتوكولات JWT 256-bit</p>
            </div>
          </div>

          <div class="bento-card">
            <div class="bento-icon-wrap emerald">
              <AppIcon name="userCheck" :size="20" />
            </div>
            <div class="bento-content">
              <h4>سرعة معالجة استثنائية</h4>
              <p>مزامنة فائقة الخفة واستجابة حية أقل من 32ms</p>
            </div>
          </div>

          <div class="bento-card">
            <div class="bento-icon-wrap blue">
              <AppIcon name="trendingUp" :size="20" />
            </div>
            <div class="bento-content">
              <h4>رادار المبيعات والأرباح</h4>
              <p>مراقبة شاملة للتدفقات النقدية والمخزون الحقيقي</p>
            </div>
          </div>
        </div>

        <!-- Brand Footer -->
        <div class="brand-stage-footer">
          <AppIcon name="boxes" :size="16" />
          <span>منظومة بن العجوز لربط الفروع والحسابات المركزية</span>
        </div>
      </section>

      <!-- Left Side: Login Form Card -->
      <section class="login-card">
        <div class="card-header">
          <span class="welcome-chip">مرحباً بك</span>
          <h2>تسجيل الدخول للنظام</h2>
          <p>يرجى إدخال اسم المستخدم وكلمة المرور للمتابعة</p>
        </div>

        <!-- Quick Demo Pill Button -->
        <button type="button" class="quick-demo-pill" @click="fillQuickDemo">
          <AppIcon name="sparkles" :size="16" />
          <span>دخول سريع بصلاحية المدير (Demo Admin)</span>
        </button>

        <!-- Login Form -->
        <form class="login-form" @submit.prevent="handleLogin">
          <!-- Username Input -->
          <div class="form-group">
            <label for="username">اسم المستخدم *</label>
            <div class="input-container">
              <span class="field-icon">
                <AppIcon name="users" :size="18" />
              </span>
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
          <div class="form-group">
            <label for="password">كلمة المرور *</label>
            <div class="input-container">
              <span class="field-icon">
                <AppIcon name="lock" :size="18" />
              </span>
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
                class="password-toggle-btn" 
                @click="showPassword = !showPassword"
                tabindex="-1"
                :title="showPassword ? 'إخفاء كلمة المرور' : 'عرض كلمة المرور'"
              >
                <AppIcon :name="showPassword ? 'eyeOff' : 'eye'" :size="18" />
              </button>
            </div>
          </div>

          <!-- Extra Controls: Remember me & Forgot Password -->
          <div class="form-options">
            <label class="remember-me">
              <input type="checkbox" v-model="rememberMe" />
              <span>تذكر هذا الجهاز</span>
            </label>
            <button type="button" class="forgot-link" @click="showForgotHelp">
              نسيت كلمة المرور؟
            </button>
          </div>

          <!-- Error Alert Box -->
          <div v-if="error" class="error-banner">
            <AppIcon name="alertTriangle" :size="18" />
            <span>{{ error }}</span>
          </div>

          <!-- Submit Button -->
          <button type="submit" class="submit-action-btn" :disabled="loading">
            <span v-if="loading" class="btn-spinner"></span>
            <span v-else class="btn-text">
              <span>دخول النظام</span>
              <AppIcon name="arrowLeft" :size="18" />
            </span>
          </button>
        </form>

        <!-- Live Server Status Footer -->
        <div class="card-footer-bar">
          <div class="server-ping-badge">
            <span class="ping-dot online"></span>
            <span>السيرفر متصل (32ms) · بن العجوز ERP</span>
          </div>
          <small class="credits-text">تطوير Karim Yehia</small>
        </div>
      </section>

    </div>
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

const form = ref({ username: '', password: '' });
const rememberMe = ref(true);
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

const showForgotHelp = () => {
  alert('يرجى التواصل مع مسؤول النظام لتطوير وإعادة ضبط كلمة المرور الخاصة بحسابك.');
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

// 3D Perspective Tilt on Mouse Move
const handleMouseMove = (e) => {
  if (!shellRef.value) return;
  const shell = shellRef.value;
  const rect = shell.getBoundingClientRect();
  
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2;
  
  const rotateX = -(y / rect.height) * 4;
  const rotateY = (x / rect.width) * 4;
  
  shell.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
};

const handleMouseLeave = () => {
  if (!shellRef.value) return;
  shellRef.value.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg)';
};
</script>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: radial-gradient(circle at 50% 20%, #161e2e 0%, #0b0f19 100%);
  position: relative;
  overflow: hidden;
  direction: rtl;
}

/* Background Ambient Orbs */
.glow-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(140px);
  opacity: 0.28;
  pointer-events: none;
}
.orb-1 {
  width: 550px;
  height: 550px;
  background: radial-gradient(circle, rgba(199, 122, 47, 0.4), transparent 70%);
  top: -15%;
  right: 15%;
}
.orb-2 {
  width: 480px;
  height: 480px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.25), transparent 70%);
  bottom: -15%;
  left: 10%;
}
.orb-3 {
  width: 380px;
  height: 380px;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.2), transparent 70%);
  top: 45%;
  left: 40%;
}

/* Background SVG Mesh Pattern */
.bg-mesh-grid {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
  opacity: 0.6;
}

/* Split Glass Container */
.login-shell {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: min(1080px, 95vw);
  background: rgba(15, 23, 42, 0.82);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(199, 122, 47, 0.25);
  border-radius: 28px;
  box-shadow: 
    0 30px 60px -15px rgba(0, 0, 0, 0.65), 
    0 0 50px rgba(199, 122, 47, 0.12);
  overflow: hidden;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 10;
}

/* Right Side: Brand Stage */
.brand-stage {
  background: linear-gradient(135deg, rgba(199, 122, 47, 0.15) 0%, rgba(15, 23, 42, 0.95) 100%);
  padding: 48px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
}

.brand-glow-halo {
  width: 100px;
  height: 100px;
  border-radius: 24px;
  background: rgba(199, 122, 47, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(199, 122, 47, 0.35);
  box-shadow: 0 0 35px rgba(199, 122, 47, 0.3);
  margin-bottom: 24px;
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  font-weight: 800;
  color: #d97706;
  background: rgba(217, 119, 6, 0.12);
  padding: 5px 14px;
  border-radius: 20px;
  margin-bottom: 12px;
  border: 1px solid rgba(217, 119, 6, 0.25);
}

.brand-title {
  margin: 0;
  font-size: 2.3rem;
  font-weight: 900;
  color: #ffffff;
  letter-spacing: -0.5px;
}

.brand-subtitle {
  margin: 8px 0 0;
  font-size: 0.92rem;
  color: #94a3b8;
  font-weight: 500;
  line-height: 1.5;
}

/* Bento Capabilities */
.bento-capabilities {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 32px 0;
}

.bento-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.25s ease;
}

.bento-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(199, 122, 47, 0.35);
  transform: translateX(-4px);
}

.bento-icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.bento-icon-wrap.amber { background: rgba(217, 119, 6, 0.15); color: #f59e0b; }
.bento-icon-wrap.emerald { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.bento-icon-wrap.blue { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }

.bento-content h4 {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 800;
  color: #f8fafc;
}

.bento-content p {
  margin: 3px 0 0;
  font-size: 0.76rem;
  color: #94a3b8;
}

.brand-stage-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
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

.welcome-chip {
  color: #c77a2f;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.card-header h2 {
  margin: 4px 0 6px;
  font-size: 1.7rem;
  font-weight: 900;
  color: #ffffff;
}

.card-header p {
  margin: 0 0 24px;
  font-size: 0.88rem;
  color: #94a3b8;
}

/* Quick Demo Pill */
.quick-demo-pill {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  margin-bottom: 24px;
  border-radius: 14px;
  background: rgba(199, 122, 47, 0.12);
  border: 1px dashed rgba(199, 122, 47, 0.45);
  color: #f59e0b;
  font-size: 0.88rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.25s ease;
}

.quick-demo-pill:hover {
  background: rgba(199, 122, 47, 0.22);
  border-color: #d97706;
  transform: translateY(-1px);
}

/* Form Styles */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-group label {
  display: block;
  font-size: 0.84rem;
  font-weight: 700;
  color: #cbd5e1;
  margin-bottom: 6px;
}

.input-container {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon {
  position: absolute;
  right: 14px;
  color: #64748b;
  display: flex;
  align-items: center;
  pointer-events: none;
}

.input-container input {
  width: 100%;
  padding: 12px 44px 12px 42px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(15, 23, 42, 0.65);
  color: #ffffff;
  font-size: 0.94rem;
  font-weight: 600;
  outline: none;
  transition: all 0.25s ease;
}

.input-container input:focus {
  border-color: #c77a2f;
  box-shadow: 0 0 0 3px rgba(199, 122, 47, 0.25);
  background: rgba(15, 23, 42, 0.95);
}

.password-toggle-btn {
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

.password-toggle-btn:hover {
  color: #f8fafc;
}

/* Form Options */
.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.82rem;
}

.remember-me {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  cursor: pointer;
  user-select: none;
}

.remember-me input[type="checkbox"] {
  accent-color: #c77a2f;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.forgot-link {
  background: none;
  border: none;
  color: #d97706;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.82rem;
  padding: 0;
  transition: color 0.2s ease;
}

.forgot-link:hover {
  color: #f59e0b;
  text-decoration: underline;
}

/* Error Banner */
.error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.14);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #f87171;
  font-size: 0.84rem;
  font-weight: 700;
}

/* Submit Button */
.submit-action-btn {
  width: 100%;
  padding: 14px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #c77a2f 0%, #a35d1e 100%);
  color: #ffffff;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 22px rgba(199, 122, 47, 0.38);
  transition: all 0.25s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 4px;
}

.submit-action-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(199, 122, 47, 0.55);
}

.submit-action-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-text {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Footer Status Bar */
.card-footer-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.server-ping-badge {
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
}

.ping-dot.online {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.credits-text {
  font-size: 0.75rem;
  color: #64748b;
}

/* Shake Animation */
.shake-error {
  animation: shake 0.4s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-10px); }
  40%, 80% { transform: translateX(10px); }
}

/* Spinner */
.btn-spinner {
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

/* Responsive Breakdown */
@media (max-width: 880px) {
  .login-shell {
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

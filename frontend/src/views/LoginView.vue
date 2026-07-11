<template>
  <div class="login-page" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
    <!-- Soft Ambient Warm Cream Glow Orbs -->
    <div class="glow-orb glow-orb-1"></div>
    <div class="glow-orb glow-orb-2"></div>
    <div class="glow-orb glow-orb-3"></div>

    <div 
      ref="shellRef" 
      class="login-shell" 
      :class="{ 'show-form': showForm, 'shake-error': shakeCard }"
    >
      <!-- Brand Panel (Clickable to reveal form when collapsed) -->
      <section 
        class="brand-panel" 
        :class="{ 'centered-intro': !showForm }"
        @click="!showForm ? revealForm() : null"
      >
        <div class="brand-orbit">
          <AppLogo size="xxl" :rounded="true" class="login-logo" />
        </div>
        <div class="brand-copy">
          <h1>بن العجوز</h1>
          <p>أصل المزاج</p>
        </div>
      </section>

      <!-- Login Form Card -->
      <section v-if="showForm" class="login-card fade-in-right">
        <div class="login-header">
          <span class="login-kicker">تسجيل الدخول</span>
          <h2>مرحباً بك في نظام التشغيل</h2>
          <p>ادخل بياناتك للمتابعة إلى لوحة الإدارة اليومية.</p>
        </div>

        <form class="login-form" @submit.prevent="handleLogin">
          <!-- Floating Label: Username -->
          <div class="form-group floating-group">
            <input 
              v-model="form.username" 
              type="text" 
              required 
              placeholder=" " 
              autocomplete="username" 
            />
            <label>اسم المستخدم</label>
          </div>

          <!-- Floating Label: Password -->
          <div class="form-group floating-group password-group">
            <input 
              v-model="form.password" 
              :type="showPassword ? 'text' : 'password'" 
              required 
              placeholder=" " 
              autocomplete="current-password" 
              class="password-input"
            />
            <label>كلمة المرور</label>
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

          <p v-if="error" class="error">{{ error }}</p>
          
          <button type="submit" class="btn btn-primary login-btn" :class="{ 'btn-loading': loading }" :disabled="loading">
            {{ loading ? 'جاري الدخول...' : 'دخول النظام' }}
          </button>

          <button type="button" class="btn btn-outline back-btn" @click.stop="showForm = false">
            ← رجوع للشعار
          </button>
        </form>

        <div class="login-footer">
          <small>نظام مملوك لـ بن العجوز · الإصدار 1.0.0</small>
          <span>تطوير وبرمجة Karim Yehia</span>
        </div>
      </section>
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
const showForm = ref(false);
const shakeCard = ref(false);

const revealForm = () => {
  showForm.value = true;
  // Dynamic synthesis sound effect when clicking logo
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4 note
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) {}
};

const handleLogin = async () => {
  loading.value = true;
  error.value = '';
  try {
    await auth.login(form.value.username, form.value.password);
    router.push('/');
  } catch (e) {
    error.value = e.message;
    shakeCard.value = true;
    setTimeout(() => {
      shakeCard.value = false;
    }, 500);
  } finally {
    loading.value = false;
  }
};

// 3D Perspective Tilt on MouseMove
const handleMouseMove = (e) => {
  if (!shellRef.value) return;
  const shell = shellRef.value;
  const rect = shell.getBoundingClientRect();
  
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2;
  
  const rotateX = -(y / rect.height) * 8;
  const rotateY = (x / rect.width) * 8;
  
  shell.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
};

const handleMouseLeave = () => {
  if (!shellRef.value) return;
  shellRef.value.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
};
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
  overflow: hidden;
  position: relative;
  background: radial-gradient(circle at 30% 30%, #fffbf6 0%, #f7edd8 100%); /* Light Warm Cappuccino Cream */
  perspective: 1000px;
}

/* Warm Cream Glow Orbs */
.glow-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(140px);
  opacity: 0.35;
  pointer-events: none;
}
.glow-orb-1 {
  width: 450px;
  height: 450px;
  background: radial-gradient(circle, rgba(220, 166, 85, 0.35), transparent 70%);
  top: 10%;
  left: 15%;
  animation: orbDrift1 15s ease-in-out infinite alternate;
}
.glow-orb-2 {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(194, 65, 12, 0.15), transparent 70%);
  bottom: 10%;
  right: 15%;
  animation: orbDrift2 18s ease-in-out infinite alternate;
}
.glow-orb-3 {
  width: 350px;
  height: 350px;
  background: radial-gradient(circle, rgba(74, 44, 17, 0.15), transparent 70%);
  top: 40%;
  right: 40%;
  animation: orbDrift3 20s ease-in-out infinite alternate;
}

/* ── Shake Animation on Error ── */
.shake-error {
  animation: cardShake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
  perspective: 1000px;
}

@keyframes cardShake {
  10%, 90% { transform: translate3d(-3px, 0, 0); }
  20%, 80% { transform: translate3d(5px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-7px, 0, 0); }
  40%, 60% { transform: translate3d(7px, 0, 0); }
}

.login-shell {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 440px; /* Initial compact layout showing only logo */
  min-height: 520px;
  display: grid;
  grid-template-columns: 1fr;
  border: 1px solid rgba(74, 44, 17, 0.1);
  border-radius: 30px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.85); /* Premium glassmorphism white */
  box-shadow: 
    0 24px 70px rgba(74, 44, 17, 0.08),
    inset 0 1px 2px rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(24px) saturate(1.1);
  -webkit-backdrop-filter: blur(24px) saturate(1.1);
  transition: max-width 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.15s cubic-bezier(0.25, 0.8, 0.25, 1);
  animation: shellIn 820ms cubic-bezier(.16,1,.3,1) both;

  /* Expanded layout classes */
  &.show-form {
    max-width: 900px;
    grid-template-columns: 1.05fr 0.95fr;
  }
}

.brand-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  gap: 24px;
  padding: 46px;
  color: #4a2c11; /* Rich Espresso Dark Coffee color */
  background: linear-gradient(145deg, #fffcf7, #f4e9da); /* Soft Warm Cream Cappuccino */
  border-right: 1px solid rgba(74, 44, 17, 0.06);
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  
  &.centered-intro {
    cursor: pointer;
    background: linear-gradient(145deg, #ffffff, #f7ede2);
    &:hover {
      background: linear-gradient(145deg, #ffffff, #f1e2d3);
      .brand-orbit {
        transform: scale(1.05);
        box-shadow: 0 12px 30px rgba(180, 123, 42, 0.15), inset 0 0 0 1px rgba(180, 123, 42, 0.2);
      }
    }
  }
}

.brand-orbit {
  width: 210px;
  height: 210px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(180, 123, 42, 0.12), transparent 70%);
  box-shadow: inset 0 0 0 1.5px rgba(74, 44, 17, 0.12);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  animation: orbitPulse 6s ease-in-out infinite;
}

.login-logo {
  width: 170px;
  height: 170px;
  filter: drop-shadow(0 12px 24px rgba(74, 44, 17, 0.15));
  animation: logoFloat 5s ease-in-out infinite;
}

.brand-copy {
  h1 {
    margin: 0;
    font-size: clamp(2.2rem, 4vw, 3.2rem);
    font-weight: 950;
    letter-spacing: -0.02em;
    color: #4a2c11;
  }
  p {
    margin: 8px 0 0;
    color: #8a5a20;
    font-size: clamp(1.2rem, 2.5vw, 1.6rem);
    font-weight: 800;
    letter-spacing: 0.08em;
  }
}

.click-prompt {
  font-size: 0.88rem;
  font-weight: 800;
  color: #b47b2a;
  background: rgba(180, 123, 42, 0.08);
  padding: 6px 14px;
  border-radius: 99px;
  margin-top: 12px;
}

.login-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 48px;
  background: rgba(255, 252, 248, 0.7); /* Clean light card background */
}

.login-header {
  margin-bottom: 24px;
  text-align: right;
  .login-kicker {
    display: inline-block;
    margin-bottom: 8px;
    color: #b47b2a;
    font-size: 0.8rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    border-bottom: 1.5px solid #b47b2a;
    padding-bottom: 2px;
  }
  h2 {
    margin: 0;
    color: #4a2c11;
    font-size: clamp(1.4rem, 2vw, 1.8rem);
    font-weight: 900;
  }
  p {
    margin: 8px 0 0;
    color: #7c6c5f;
    font-size: 0.86rem;
    font-weight: 700;
    line-height: 1.5;
  }
}

.login-form {
  text-align: right;
}

/* Floating Label Form Groups */
.floating-group {
  position: relative;
  margin-bottom: 20px;
  
  input {
    width: 100%;
    min-height: 50px;
    padding: 16px 14px 6px;
    border: 1.5px solid rgba(74, 44, 17, 0.15);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.95);
    color: #4a2c11;
    font-weight: 700;
    font-size: 0.95rem;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
    
    &:focus {
      border-color: #b47b2a;
      background: #ffffff;
      box-shadow: 0 0 0 4px rgba(180, 123, 42, 0.12);
    }
  }
  
  label {
    position: absolute;
    top: 50%;
    right: 14px;
    transform: translateY(-50%);
    color: #8c7c6f;
    font-size: 0.9rem;
    font-weight: 700;
    pointer-events: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  input:focus ~ label,
  input:not(:placeholder-shown) ~ label {
    top: 14px;
    font-size: 0.72rem;
    color: #b47b2a;
    font-weight: 900;
  }
}

.password-group {
  position: relative;
}
.password-input {
  padding-left: 42px !important;
}
.password-toggle-btn {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: #8c7c6f;
  cursor: pointer;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  z-index: 10;
  border-radius: 50%;
  
  &:hover {
    color: #b47b2a;
    background: rgba(180, 123, 42, 0.08);
  }
}

/* Metallic Gold Shimmer Button */
.login-btn {
  width: 100%;
  min-height: 50px;
  margin-top: 8px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #b47b2a 0%, #dca655 50%, #b47b2a 100%);
  box-shadow: 0 8px 24px rgba(180, 123, 42, 0.25);
  color: #fff8ed;
  font-size: 0.98rem;
  font-weight: 950;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  
  &::after {
    content: '';
    position: absolute;
    top: -50%;
    bottom: -50%;
    width: 60px;
    left: -80px;
    transform: rotate(25deg);
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
    transition: left 0.6s cubic-bezier(0.3, 1, 0.3, 1);
  }
  
  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 12px 30px rgba(180, 123, 42, 0.38);
    &::after {
      left: 120%;
    }
  }
  
  &:active:not(:disabled) {
    transform: translateY(0);
  }
}

.back-btn {
  width: 100%;
  min-height: 44px;
  margin-top: 12px;
  border-radius: 12px;
  font-size: 0.88rem;
  font-weight: 800;
  border: 1.5px solid rgba(74, 44, 17, 0.15);
  color: #7c6c5f;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(74, 44, 17, 0.05);
    color: #4a2c11;
  }
}

.error {
  margin: 10px 0;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(220, 53, 69, 0.08);
  border: 1px solid rgba(220, 53, 69, 0.18);
  color: #dc3545;
  font-size: 0.82rem;
  font-weight: 800;
  text-align: right;
}

.login-footer {
  display: grid;
  gap: 4px;
  margin-top: 24px;
  color: #8c7c6f;
  text-align: center;
  font-size: 0.76rem;
  font-weight: 700;
  small {
    font-size: 0.7rem;
    color: #a59588;
  }
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Animations and transitions */
.fade-in-right {
  animation: fadeInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes fadeInRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes orbDrift1 {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(40px, -60px) scale(1.1); }
}
@keyframes orbDrift2 {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(-50px, 40px) scale(1.05); }
}
@keyframes orbDrift3 {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(30px, 30px) scale(1.15); }
}
@keyframes shellIn {
  from { opacity: 0; transform: translateY(20px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes logoFloat {
  0%, 100% { transform: translateY(0) rotate(-0.5deg); }
  50% { transform: translateY(-6px) rotate(0.5deg); }
}
@keyframes orbitPulse {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.025); opacity: 1; }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 860px) {
  .login-page {
    padding: 16px;
  }
  .login-shell {
    grid-template-columns: 1fr !important;
    max-width: 440px !important;
    min-height: auto;
    border-radius: 20px;
  }
  .brand-panel {
    padding: 36px 20px 24px;
    border-right: none;
    border-bottom: 1px solid rgba(74, 44, 17, 0.06);
  }
  .brand-orbit {
    width: 150px;
    height: 150px;
  }
  .login-logo {
    width: 120px;
    height: 120px;
  }
  .login-card {
    padding: 32px 20px;
  }
}
</style>

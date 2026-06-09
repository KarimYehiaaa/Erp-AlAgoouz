<template>
  <div class="login-page">
    <section class="login-card animate-in">
      <div class="login-header">
        <AppLogo size="xl" :rounded="true" class="login-logo" />
        <div>
          <h1>بن العجوز</h1>
          <p>نظام إدارة التشغيل والمخزون والمالية</p>
        </div>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <div class="form-group">
          <label>اسم المستخدم</label>
          <input v-model="form.username" type="text" required placeholder="admin" autocomplete="username" />
        </div>
        <div class="form-group">
          <label>كلمة المرور</label>
          <input v-model="form.password" type="password" required placeholder="••••••••" autocomplete="current-password" />
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" class="btn btn-primary login-btn" :disabled="loading">
          {{ loading ? 'جاري الدخول...' : 'تسجيل الدخول' }}
        </button>
      </form>

      <div class="login-footer">
        <span>الافتراضي: admin / Admin@123</span>
        <small>نظام مملوك لـ بن العجوز · الإصدار 1.0.0</small>
      </div>
    </section>
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
const error = ref('');

const handleLogin = async () => {
  loading.value = true;
  error.value = '';
  try {
    await auth.login(form.value.username, form.value.password);
    router.push('/');
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
};
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    linear-gradient(135deg, rgba(37, 99, 235, 0.1), transparent 34%),
    linear-gradient(315deg, rgba(15, 118, 110, 0.12), transparent 38%),
    var(--bg);
}

.login-card {
  width: min(440px, 100%);
  padding: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
}

.login-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 26px;
}

.login-logo {
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}

.login-header h1 {
  color: var(--text-strong);
  font-size: 1.8rem;
  font-weight: 900;
  line-height: 1.1;
}

.login-header p {
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 700;
}

.login-form {
  text-align: right;
}

.login-btn {
  width: 100%;
  min-height: 44px;
  margin-top: 6px;
}

.error {
  margin: 10px 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--danger) 24%, var(--border));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--danger) 9%, transparent);
  color: var(--danger);
  font-size: 0.84rem;
  font-weight: 800;
}

.login-footer {
  display: grid;
  gap: 6px;
  margin-top: 18px;
  color: var(--text-muted);
  text-align: center;
  font-size: 0.78rem;
}

.login-footer small {
  font-size: 0.72rem;
}
</style>

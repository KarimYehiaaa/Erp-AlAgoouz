<template>
  <div class="pos-login-page">
    <div class="login-modal-card">
      <div class="brand-header">
        <div class="logo-circle">
          <AppIcon name="coffee" :size="36" />
        </div>
        <h2>بن العجوز ERP</h2>
        <p>نقطة بيع الكاشير (Desktop POS Terminal)</p>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <div v-if="errorMsg" class="error-banner">
          <AppIcon name="alertTriangle" :size="16" />
          <span>{{ errorMsg }}</span>
        </div>

        <div class="form-group">
          <label>اسم المستخدم / كود الكاشير</label>
          <input
            v-model="form.username"
            type="text"
            required
            placeholder="أدخل اسم المستخدم..."
            class="pos-input"
            autofocus
          />
        </div>

        <div class="form-group">
          <label>كلمة المرور</label>
          <input
            v-model="form.password"
            type="password"
            required
            placeholder="••••••••"
            class="pos-input"
          />
        </div>

        <button type="submit" class="btn-pos-login" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          <span v-else>تسجيل الدخول وبدء الوردية</span>
        </button>
      </form>

      <div class="login-footer">
        <span>الجهاز: <strong>TRM-MAIN-01</strong></span>
        <span>الفرع: <strong>الفرع الرئيسي</strong></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import { usePosAuthStore } from '../stores/posAuth';

const router = useRouter();
const authStore = usePosAuthStore();

const form = ref({
  username: '',
  password: '',
});

const loading = ref(false);
const errorMsg = ref('');

const handleLogin = async () => {
  loading.value = true;
  errorMsg.value = '';
  try {
    await authStore.login(form.value);
    router.push('/shift/open');
  } catch (err: any) {
    errorMsg.value = err.message || 'فشل تسجيل الدخول. تحقق من البيانات.';
  } finally {
    loading.value = false;
  }
};
</script>

<style lang="scss" scoped>
.pos-login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 20%, rgba(138, 87, 42, 0.08) 0%, #f6f4f0 85%);
  padding: 20px;
}

.login-modal-card {
  width: 100%;
  max-width: 440px;
  background: #ffffff;
  border: 1.5px solid var(--border, #e7e2d9);
  border-radius: var(--radius-xl, 18px);
  padding: 36px 32px;
  box-shadow: 0 12px 36px rgba(41, 37, 36, 0.08);
}

.brand-header {
  text-align: center;
  margin-bottom: 26px;

  .logo-circle {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--primary, #8a572a);
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;
    box-shadow: 0 4px 14px rgba(138, 87, 42, 0.3);
  }

  h2 {
    font-size: 1.6rem;
    font-weight: 900;
    color: var(--text-strong, #0c0a09);
    margin: 0 0 4px;
  }

  p {
    font-size: 0.88rem;
    color: var(--text-muted, #78716c);
    margin: 0;
  }
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;

  .error-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--danger-soft, rgba(220, 38, 38, 0.1));
    border: 1px solid var(--danger-border, rgba(220, 38, 38, 0.25));
    color: var(--danger, #dc2626);
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 750;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;

    label {
      font-size: 0.85rem;
      font-weight: 750;
      color: var(--text-main, #292524);
    }

    .pos-input {
      height: 48px;
      padding: 0 16px;
      background: #ffffff;
      border: 1.5px solid var(--border, #e7e2d9);
      border-radius: 8px;
      color: var(--text-strong, #0c0a09);
      font-size: 1rem;
      font-weight: 650;

      &:focus {
        border-color: var(--primary, #8a572a);
        outline: none;
        box-shadow: 0 0 0 3px rgba(138, 87, 42, 0.15);
      }
    }
  }

  .btn-pos-login {
    height: 52px;
    background: linear-gradient(135deg, #8a572a 0%, #6e411b 100%);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 1.05rem;
    font-weight: 850;
    cursor: pointer;
    margin-top: 8px;
    transition: all 0.2s ease;
    box-shadow: 0 4px 14px rgba(138, 87, 42, 0.3);

    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #9b6330 0%, #7d4a20 100%);
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(138, 87, 42, 0.4);
    }
  }
}

.login-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft, #f0ebe1);
  font-size: 0.8rem;
  color: var(--text-muted, #78716c);
}
</style>

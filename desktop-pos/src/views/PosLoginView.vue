<template>
  <div class="pos-login-page">
    <div class="login-modal-card">
      <div class="brand-header">
        <div class="logo-circle" aria-hidden="true">
          <img src="/logo-transparent.png" alt="" />
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

        <div class="server-config-toggle">
          <button
            type="button"
            class="btn-text-link"
            :aria-expanded="showServerConfig"
            @click="showServerConfig = !showServerConfig"
          >
            <AppIcon name="settings" :size="14" />
            <span>{{ showServerConfig ? 'إخفاء إعدادات الخادم' : 'إعدادات اتصال الخادم المركزي' }}</span>
          </button>
        </div>

        <div v-if="showServerConfig" class="server-config-panel">
          <label>رابط الخادم المركزي (Central Server API):</label>
          <div class="server-input-row">
            <input
              v-model="serverUrlInput"
              type="text"
              placeholder="http://localhost:3000/api/v1 أو https://..."
              class="pos-input text-xs"
            />
            <button type="button" class="btn-save-server" @click="saveServerUrl">حفظ</button>
          </div>
          <span v-if="serverSavedMsg" class="server-saved-hint">{{ serverSavedMsg }}</span>
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
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import { usePosAuthStore } from '../stores/posAuth';
import { getServerUrl, setServerUrl } from '../services/config';

const router = useRouter();
const authStore = usePosAuthStore();

const form = ref({
  username: '',
  password: '',
});

const loading = ref(false);
const errorMsg = ref('');
const showServerConfig = ref(false);
const serverUrlInput = ref(getServerUrl());
const serverSavedMsg = ref('');

onMounted(() => {
  serverUrlInput.value = getServerUrl();
});

const saveServerUrl = async () => {
  if (!serverUrlInput.value.trim()) return;
  const res = await setServerUrl(serverUrlInput.value.trim());
  if (!res.success) {
    errorMsg.value = res.error || 'عنوان الخادم غير موثوق به لهذا الجهاز';
    serverSavedMsg.value = '';
    return;
  }
  errorMsg.value = '';
  serverSavedMsg.value = 'تم حفظ وتحديث عنوان الخادم المركزي بنجاح';
  setTimeout(() => {
    serverSavedMsg.value = '';
  }, 3000);
};

const handleLogin = async () => {
  loading.value = true;
  errorMsg.value = '';
  try {
    if (serverUrlInput.value.trim()) {
      const res = await setServerUrl(serverUrlInput.value.trim());
      if (!res.success) {
        errorMsg.value = res.error || 'عنوان الخادم غير موثوق به لهذا الجهاز';
        loading.value = false;
        return;
      }
    }
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

    img {
      width: 48px;
      height: 48px;
      object-fit: contain;
      filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.22));
    }
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

  .server-config-toggle {
    display: flex;
    justify-content: center;

    .btn-text-link {
      background: none;
      border: none;
      color: var(--primary, #8a572a);
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 4px;

      &:hover {
        background: rgba(138, 87, 42, 0.08);
      }
    }
  }

  .server-config-panel {
    background: #faf8f5;
    border: 1px dashed var(--border, #e7e2d9);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;

    label {
      font-size: 0.75rem;
      color: var(--text-muted, #78716c);
      font-weight: 700;
    }

    .server-input-row {
      display: flex;
      gap: 6px;

      input {
        flex: 1;
        height: 36px;
        font-size: 0.8rem;
        direction: ltr;
        text-align: left;
      }

      .btn-save-server {
        background: var(--primary, #8a572a);
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 0 12px;
        font-size: 0.8rem;
        font-weight: 700;
        cursor: pointer;

        &:hover {
          background: #73451e;
        }
      }
    }

    .server-saved-hint {
      font-size: 0.75rem;
      color: #15803d;
      font-weight: 700;
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

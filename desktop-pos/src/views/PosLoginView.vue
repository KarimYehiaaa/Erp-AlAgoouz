<template>
  <div class="pos-login-page" dir="rtl">
    <div class="login-modal-card">
      <div class="brand-header">
        <div class="logo-circle" aria-hidden="true">
          <img src="/logo-transparent.png" alt="بن العجوز" @error="handleLogoError" />
        </div>
        <h2>بن العجوز ERP</h2>
        <p>نقطة بيع الكاشير (Desktop POS Terminal)</p>
      </div>

      <!-- Server Connection Badge -->
      <div class="server-status-pill" :class="connectionStatus">
        <span class="status-dot"></span>
        <span class="status-text">{{ connectionStatusText }}</span>
        <button
          type="button"
          class="btn-ping"
          title="فحص الاتصال بالخادم"
          :disabled="isPinging"
          @click="checkServerHealth"
        >
          <AppIcon :name="isPinging ? 'refreshCw' : 'activity'" :size="12" />
        </button>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <!-- Error Banner -->
        <div v-if="errorMsg" class="error-banner">
          <AppIcon name="alertTriangle" :size="16" />
          <div class="error-content">
            <span>{{ errorMsg }}</span>
            <div v-if="suggestedAccounts" class="accounts-hint">
              <span>الحسابات المعتمدة:</span>
              <button
                v-for="acc in ['Karimyehia', 'cash', 'Agouz', 'capo']"
                :key="acc"
                type="button"
                class="acc-chip"
                @click="form.username = acc"
              >
                {{ acc }}
              </button>
            </div>
          </div>
        </div>

        <!-- Username -->
        <div class="form-group">
          <label>اسم المستخدم / كود الكاشير</label>
          <div class="input-with-icon">
            <input
              v-model="form.username"
              type="text"
              required
              placeholder="مثال: Karimyehia أو cash"
              class="pos-input"
              autofocus
            />
          </div>
        </div>

        <!-- Password -->
        <div class="form-group">
          <label>كلمة المرور</label>
          <div class="password-input-wrap">
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              required
              placeholder="••••••••"
              class="pos-input"
            />
            <button
              type="button"
              class="btn-toggle-eye"
              tabindex="-1"
              :title="showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'"
              @click="showPassword = !showPassword"
            >
              <AppIcon :name="showPassword ? 'eyeOff' : 'eye'" :size="18" />
            </button>
          </div>
        </div>

        <!-- Remember Me Checkbox -->
        <div class="remember-row">
          <label class="remember-label">
            <input v-model="rememberMe" type="checkbox" />
            <span>تذكر اسم المستخدم</span>
          </label>
        </div>

        <!-- Submit Button -->
        <button type="submit" class="btn-pos-login" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          <span v-else>تسجيل الدخول وبدء الوردية</span>
        </button>

        <!-- Quick Server Switcher & Advanced Settings -->
        <div class="server-config-section">
          <div class="server-preset-buttons">
            <button
              type="button"
              class="btn-preset"
              :class="{ active: isLocalServer }"
              @click="selectPreset('local')"
            >
              <span class="preset-indicator"></span>
              <span>السيرفر المحلي (Localhost)</span>
            </button>
            <button
              type="button"
              class="btn-preset"
              :class="{ active: isCloudServer }"
              @click="selectPreset('cloud')"
            >
              <span class="preset-indicator"></span>
              <span>السيرفر السحابي (Cloud Online)</span>
            </button>
          </div>

          <button
            type="button"
            class="btn-text-link"
            :aria-expanded="showServerConfig"
            @click="showServerConfig = !showServerConfig"
          >
            <AppIcon name="settings" :size="13" />
            <span>{{
              showServerConfig ? 'إخفاء الإعدادات المتقدمة' : 'عنوان مخصص للخادم...'
            }}</span>
          </button>

          <div v-if="showServerConfig" class="server-config-panel">
            <label>رابط الخادم المخصص (API URL):</label>
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
        </div>
      </form>

      <div class="login-footer">
        <div class="terminal-meta">
          <span>الجهاز: <strong>TRM-MAIN-01</strong></span>
          <span>المحل: <strong>المحل الرئيسي</strong></span>
        </div>
        <button
          type="button"
          class="btn-footer-updater"
          :class="{
            'update-ready': isDownloaded,
            'update-downloading': isDownloading,
            'update-available': isAvailable,
          }"
          :title="
            isDownloaded
              ? 'تحديث جديد جاهز للتثبيت الفوري — اضغط للتطبيق'
              : isDownloading
                ? `جاري تحميل التحديث (${downloadPercent}%)`
                : 'فحص التحديثات التلقائية'
          "
          @click="openUpdateModal"
        >
          <AppIcon
            :name="isDownloaded ? 'download' : isDownloading || isChecking ? 'refreshCw' : 'download'"
            :size="13"
            :class="{ 'spin-anim': isChecking || isDownloading }"
          />
          <span>v{{ appVersion }}</span>
          <span v-if="isDownloaded" class="badge-ready">تحديث جاهز!</span>
          <span v-else-if="isDownloading" class="badge-downloading">{{ downloadPercent }}%</span>
          <span v-else-if="isAvailable" class="badge-available">متاح</span>
        </button>
      </div>
    </div>

    <!-- Smart In-App Update Modal -->
    <UpdateModal :is-open="showUpdateModal" @close="closeUpdateModal" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import AppIcon from '../components/AppIcon.vue';
import UpdateModal from '../components/UpdateModal.vue';
import { usePosAuthStore } from '../stores/posAuth';
import { useAppUpdater } from '../composables/useAppUpdater';
import {
  getServerUrl,
  setServerUrl,
  SAFE_LOCAL_URL,
  SAFE_PRODUCTION_URL,
} from '../services/config';

const router = useRouter();
const authStore = usePosAuthStore();
const {
  updateState,
  appVersion,
  showUpdateModal,
  isAvailable,
  isDownloading,
  isDownloaded,
  isChecking,
  downloadPercent,
  initUpdater,
  openUpdateModal,
  closeUpdateModal,
} = useAppUpdater();

const REMEMBERED_USER_KEY = 'pos_remembered_username';

const form = ref({
  username: '',
  password: '',
});

const rememberMe = ref(true);
const showPassword = ref(false);
const loading = ref(false);
const errorMsg = ref('');
const showServerConfig = ref(false);
const serverUrlInput = ref(getServerUrl());
const serverSavedMsg = ref('');

// Health / Connection State
const isPinging = ref(false);
const connectionStatus = ref<'checking' | 'connected' | 'error' | 'idle'>('idle');
const connectionStatusText = ref('جاري فحص الاتصال بالخادم...');
const serverLatency = ref<number | null>(null);

const isLocalServer = computed(() => {
  const current = (serverUrlInput.value || getServerUrl()).toLowerCase();
  return current.includes('localhost') || current.includes('127.0.0.1');
});

const isCloudServer = computed(() => {
  const current = (serverUrlInput.value || getServerUrl()).toLowerCase();
  return current.includes('agoouz.vercel.app') || current.includes('alagoouz.com');
});

const suggestedAccounts = computed(() => {
  return errorMsg.value.includes('غير صحيحة') || errorMsg.value.includes('401');
});

const handleLogoError = (e: Event) => {
  (e.target as HTMLImageElement).src = '/logo.svg';
};

const checkServerHealth = async () => {
  isPinging.value = true;
  connectionStatus.value = 'checking';
  connectionStatusText.value = 'جاري اختبار الاتصال...';

  const rawUrl = serverUrlInput.value || getServerUrl();
  const base = rawUrl.trim().replace(/\/+$/, '');
  const rootBase = base.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
  const startTime = Date.now();

  // تجميع قائمة العناوين المحتملة بترتيب الأولوية
  const candidates: string[] = [];
  if (base.endsWith('/api/v1') || base.endsWith('/api')) {
    candidates.push(`${base}/health`);
    candidates.push(`${rootBase}/health`);
  } else {
    candidates.push(`${base}/api/v1/health`);
    candidates.push(`${base}/health`);
  }

  // دعم التبديل التلقائي بين localhost و 127.0.0.1 لتفادي مشاكل DNS على ويندوز
  if (base.includes('localhost')) {
    candidates.push(...candidates.map((u) => u.replace('localhost', '127.0.0.1')));
  } else if (base.includes('127.0.0.1')) {
    candidates.push(...candidates.map((u) => u.replace('127.0.0.1', 'localhost')));
  }

  const uniqueUrls = Array.from(new Set(candidates));
  let res: any = null;
  let lastErr: any = null;

  for (const testUrl of uniqueUrls) {
    try {
      res = await axios.get(testUrl, {
        timeout: 6000,
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.data?.success || res.status === 200) {
        break; // نجح الفحص
      }
    } catch (err: any) {
      lastErr = err;
    }
  }

  const latency = Date.now() - startTime;
  serverLatency.value = latency;

  if (res && (res.data?.success || res.status === 200)) {
    connectionStatus.value = 'connected';
    const typeLabel = isLocalServer.value ? 'الخادم المحلي' : 'السيرفر السحابي';
    connectionStatusText.value = `متصل بـ ${typeLabel} (${latency}ms)`;
  } else {
    connectionStatus.value = 'error';
    const typeLabel = isLocalServer.value ? 'الخادم المحلي (Localhost)' : 'السيرفر السحابي';
    if (lastErr?.code === 'ECONNABORTED' || lastErr?.message?.includes('timeout')) {
      connectionStatusText.value = `استجابة ${typeLabel} بطيئة (انتهت المهلة)`;
    } else {
      connectionStatusText.value = `تعذر الاتصال بـ ${typeLabel}`;
    }
  }
  isPinging.value = false;
};

const selectPreset = async (preset: 'local' | 'cloud') => {
  errorMsg.value = '';
  const targetUrl = preset === 'local' ? SAFE_LOCAL_URL : SAFE_PRODUCTION_URL;
  serverUrlInput.value = targetUrl;
  const res = await setServerUrl(targetUrl);
  if (res.success) {
    serverSavedMsg.value = `تم التبديل إلى ${preset === 'local' ? 'السيرفر المحلي' : 'السيرفر السحابي'}`;
    setTimeout(() => {
      serverSavedMsg.value = '';
    }, 2500);
    await checkServerHealth();
  } else {
    errorMsg.value = res.error || 'فشل التبديل للسيرفر المحدد';
  }
};

onMounted(async () => {
  await initUpdater();
  serverUrlInput.value = getServerUrl();
  const savedUser = localStorage.getItem(REMEMBERED_USER_KEY);
  if (savedUser) {
    form.value.username = savedUser;
  }
  await checkServerHealth();
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
  await checkServerHealth();
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

    if (rememberMe.value) {
      localStorage.setItem(REMEMBERED_USER_KEY, form.value.username.trim());
    } else {
      localStorage.removeItem(REMEMBERED_USER_KEY);
    }

    router.push('/shift/open');
  } catch (err: any) {
    if (err.response?.data?.message) {
      errorMsg.value = err.response.data.message;
    } else if (err.response?.status === 401) {
      errorMsg.value = 'اسم المستخدم أو كلمة المرور غير صحيحة';
    } else if (err.response?.status === 403) {
      errorMsg.value = 'الحساب ليس لديه صلاحية الدخول لنقطة البيع (مطلوب كاشير أو مدير)';
    } else if (err.code === 'ERR_NETWORK' || !err.response) {
      errorMsg.value = `تعذر الاتصال بالخادم (${serverUrlInput.value || getServerUrl()}). يرجى التأكد من تشغيل السيرفر أو اختيار السيرفر السحابي.`;
    } else {
      errorMsg.value = err.message || 'فشل تسجيل الدخول. تحقق من البيانات.';
    }
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
  padding: 32px 28px;
  box-shadow: 0 12px 36px rgba(41, 37, 36, 0.08);
}

.brand-header {
  text-align: center;
  margin-bottom: 18px;

  .logo-circle {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--primary, #8a572a);
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    box-shadow: 0 4px 14px rgba(138, 87, 42, 0.3);

    img {
      width: 44px;
      height: 44px;
      object-fit: contain;
      filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.22));
    }
  }

  h2 {
    font-size: 1.5rem;
    font-weight: 900;
    color: var(--text-strong, #0c0a09);
    margin: 0 0 4px;
  }

  p {
    font-size: 0.85rem;
    color: var(--text-muted, #78716c);
    margin: 0;
  }
}

.server-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 700;
  margin-bottom: 16px;
  transition: all 0.2s ease;

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-text {
    flex: 1;
    text-align: right;
  }

  .btn-ping {
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    opacity: 0.7;
    display: inline-flex;
    align-items: center;
    padding: 2px;
    border-radius: 4px;

    &:hover:not(:disabled) {
      opacity: 1;
    }
  }

  &.connected {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #065f46;
    .status-dot {
      background: #10b981;
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.3);
    }
  }

  &.error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
    .status-dot {
      background: #ef4444;
      box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3);
    }
  }

  &.checking,
  &.idle {
    background: #f5f5f4;
    border: 1px solid #e7e5e4;
    color: #57534e;
    .status-dot {
      background: #a8a29e;
    }
  }
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;

  .error-banner {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: var(--danger-soft, rgba(220, 38, 38, 0.1));
    border: 1px solid var(--danger-border, rgba(220, 38, 38, 0.25));
    color: var(--danger, #dc2626);
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 750;

    .error-content {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
    }

    .accounts-hint {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 0.75rem;
      color: #991b1b;
      font-weight: 600;

      .acc-chip {
        background: #ffffff;
        border: 1px solid #fca5a5;
        color: #991b1b;
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 0.72rem;
        font-weight: 700;
        cursor: pointer;

        &:hover {
          background: #fee2e2;
        }
      }
    }
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;

    label {
      font-size: 0.82rem;
      font-weight: 750;
      color: var(--text-main, #292524);
    }

    .pos-input {
      width: 100%;
      height: 46px;
      padding: 0 14px;
      background: #ffffff;
      border: 1.5px solid var(--border, #e7e2d9);
      border-radius: 8px;
      color: var(--text-strong, #0c0a09);
      font-size: 0.95rem;
      font-weight: 650;

      &:focus {
        border-color: var(--primary, #8a572a);
        outline: none;
        box-shadow: 0 0 0 3px rgba(138, 87, 42, 0.15);
      }
    }

    .password-input-wrap {
      position: relative;
      display: flex;
      align-items: center;

      .btn-toggle-eye {
        position: absolute;
        left: 12px;
        background: none;
        border: none;
        color: var(--text-muted, #78716c);
        cursor: pointer;
        display: flex;
        align-items: center;
        padding: 4px;

        &:hover {
          color: var(--text-strong, #0c0a09);
        }
      }
    }
  }

  .remember-row {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .remember-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      color: var(--text-muted, #78716c);
      cursor: pointer;
      font-weight: 600;

      input[type='checkbox'] {
        accent-color: var(--primary, #8a572a);
        width: 15px;
        height: 15px;
      }
    }
  }

  .btn-pos-login {
    height: 48px;
    background: linear-gradient(135deg, #8a572a 0%, #6e411b 100%);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 850;
    cursor: pointer;
    margin-top: 4px;
    transition: all 0.2s ease;
    box-shadow: 0 4px 14px rgba(138, 87, 42, 0.3);

    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #9b6330 0%, #7d4a20 100%);
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(138, 87, 42, 0.4);
    }

    &:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
  }

  .server-config-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;

    .server-preset-buttons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;

      .btn-preset {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 7px 8px;
        border-radius: 6px;
        background: #fbf9f6;
        border: 1px solid var(--border, #e7e2d9);
        color: var(--text-muted, #78716c);
        font-size: 0.72rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;

        .preset-indicator {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #d6d3d1;
        }

        &.active {
          background: rgba(138, 87, 42, 0.08);
          border-color: var(--primary, #8a572a);
          color: var(--primary, #8a572a);

          .preset-indicator {
            background: var(--primary, #8a572a);
          }
        }

        &:hover:not(.active) {
          background: #f5f2eb;
          color: var(--text-strong, #0c0a09);
        }
      }
    }

    .btn-text-link {
      background: none;
      border: none;
      color: var(--primary, #8a572a);
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 2px 4px;
      border-radius: 4px;

      &:hover {
        background: rgba(138, 87, 42, 0.08);
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
        font-size: 0.72rem;
        color: var(--text-muted, #78716c);
        font-weight: 700;
      }

      .server-input-row {
        display: flex;
        gap: 6px;

        input {
          flex: 1;
          height: 34px;
          font-size: 0.78rem;
          direction: ltr;
          text-align: left;
        }

        .btn-save-server {
          background: var(--primary, #8a572a);
          color: #fff;
          border: none;
          border-radius: 6px;
          padding: 0 12px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;

          &:hover {
            background: #73451e;
          }
        }
      }

      .server-saved-hint {
        font-size: 0.72rem;
        color: #15803d;
        font-weight: 700;
      }
    }
  }
}

.login-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--border-soft, #f0ebe1);
  font-size: 0.78rem;
  color: var(--text-muted, #78716c);

  .terminal-meta {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .btn-footer-updater {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(0, 0, 0, 0.04);
    border: 1px solid var(--border-soft, #e7e0d3);
    padding: 3px 8px;
    border-radius: 6px;
    color: var(--text-muted, #78716c);
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(0, 0, 0, 0.08);
      color: var(--primary, #8a572a);
      border-color: var(--primary, #8a572a);
    }

    &.update-ready {
      background: #ecfdf5;
      color: #065f46;
      border-color: #10b981;
      font-weight: 700;

      .badge-ready {
        background: #10b981;
        color: #fff;
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 0.65rem;
      }
    }

    &.update-downloading {
      background: #eff6ff;
      color: #1e40af;
      border-color: #3b82f6;

      .badge-downloading {
        background: #3b82f6;
        color: #fff;
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 0.65rem;
      }
    }

    &.update-available {
      background: #fffbeb;
      color: #92400e;
      border-color: #f59e0b;

      .badge-available {
        background: #f59e0b;
        color: #fff;
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 0.65rem;
      }
    }

    .spin-anim {
      animation: spin 1.2s linear infinite;
    }
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>

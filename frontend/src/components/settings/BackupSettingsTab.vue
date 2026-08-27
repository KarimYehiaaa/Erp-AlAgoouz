<template>
  <section class="settings-section">
    <div class="section-title">
      <h2>النسخ الاحتياطي</h2>
      <p>أنشئ نسخاً احتياطية واسترد البيانات عند الحاجة</p>
    </div>

    <!-- إحصائيات سريعة -->
    <div class="backup-stats-row">
      <div class="backup-stat-box">
        <span class="stat-num">{{ backups.length }}</span>
        <span class="stat-label">نسخة محفوظة</span>
      </div>
      <div class="backup-stat-box">
        <span class="stat-num">{{ latestBackup ? formatBackupDate(latestBackup.name) : '—' }}</span>
        <span class="stat-label">آخر نسخة</span>
      </div>
      <div class="backup-stat-box">
        <span class="stat-num">{{ formatBackupSize(totalBackupSize) }}</span>
        <span class="stat-label">الحجم الكلي</span>
      </div>
    </div>

    <!-- أدوات -->
    <div class="settings-card">
      <div class="backup-toolbar">
        <div class="toolbar-group">
          <button
            v-permission="'settings.manage'"
            class="btn btn-add"
            @click="createBackup"
            :disabled="backuping || !canEdit"
          >
            <AppIcon name="add" :size="16" /> إنشاء نسخة
          </button>
          <button class="btn btn-outline" @click="refreshBackups">
            <AppIcon name="theme" :size="16" /> تحديث
          </button>
        </div>
        <div class="view-switcher">
          <button :class="{ active: backupView === 'cards' }" @click="backupView = 'cards'">
            بطاقات
          </button>
          <button :class="{ active: backupView === 'timeline' }" @click="backupView = 'timeline'">
            زمني
          </button>
          <button :class="{ active: backupView === 'compact' }" @click="backupView = 'compact'">
            مضغوط
          </button>
        </div>
      </div>

      <!-- قائمة النسخ -->
      <div v-if="sortedBackups.length" class="backup-list" :data-view="backupView">
        <div v-for="b in sortedBackups" :key="b.name" class="backup-item">
          <div class="backup-icon">{{ backupView === 'timeline' ? '●' : 'BK' }}</div>
          <div class="backup-info">
            <strong>{{ b.name }}</strong>
            <small>{{ formatBackupSize(b.size) }} · {{ formatBackupDate(b.name) }}</small>
          </div>
          <div class="backup-item-actions">
            <button class="btn btn-sm btn-outline" @click="download(b.name)">
              <AppIcon name="download" :size="14" /> تحميل
            </button>
            <button
              v-permission="'settings.manage'"
              v-if="canEdit"
              class="btn btn-sm btn-edit"
              @click="restore(b.name)"
            >
              <AppIcon name="arrowLeft" :size="14" /> استرداد
            </button>
          </div>
        </div>
      </div>
      <div v-else class="backup-empty">
        <strong>لا توجد نسخ احتياطية بعد</strong>
        <p>أنشئ نسخة قبل أي تعديل كبير على البيانات</p>
      </div>
    </div>

    <!-- إعدادات النسخ الاحتياطي السحابي التلقائي -->
    <div class="settings-card cloud-backup-card">
      <h4 class="group-label">النسخ الاحتياطي السحابي التلقائي</h4>
      <p class="section-desc">
        قم بربط النظام بخدمة سحابية لرفع النسخة الاحتياطية تلقائياً عند إنشائها أو جدولتها دورياً.
      </p>

      <div class="fields-grid">
        <div class="form-group full-width">
          <label>المزود السحابي</label>
          <select v-model="cloudBackupSettings.provider" :disabled="!canEdit">
            <option value="none">تعطيل النسخ السحابي</option>
            <option value="gdrive">Google Drive (جوجل درايف)</option>
            <option value="dropbox">Dropbox (دروب بوكس)</option>
            <option value="webhook">Webhook مخصص / Discord Webhook</option>
          </select>
        </div>
      </div>

      <!-- إعدادات Google Drive -->
      <div v-if="cloudBackupSettings.provider === 'gdrive'" class="provider-fields fade-in">
        <div class="fields-grid">
          <div class="form-group full-width">
            <label>نوع الاتصال بـ Google Drive</label>
            <select v-model="cloudBackupSettings.gdrive_auth_type" :disabled="!canEdit">
              <option value="service_account">
                حساب خدمة (Service Account) — مناسب للمؤسسات والمساحات المشتركة
              </option>
              <option value="oauth">
                حساب Google شخصي (OAuth2 / Refresh Token) — مناسب للحسابات الشخصية
              </option>
            </select>
          </div>

          <!-- خيار 1: Service Account -->
          <div
            v-if="cloudBackupSettings.gdrive_auth_type === 'service_account'"
            class="form-group full-width fade-in"
          >
            <label>ملف مفتاح حساب الخدمة (Google Service Account JSON Key)</label>
            <textarea
              v-model="cloudBackupSettings.gdrive_key"
              placeholder='{"type": "service_account", "project_id": ...}'
              rows="5"
              style="font-family: monospace; font-size: 0.82rem"
              :disabled="!canEdit"
            ></textarea>
            <p class="hint mt-12">
              أدخل محتوى ملف المفتاح JSON الخاص بـ Service Account من Google Cloud Console، وتأكد من
              مشاركة مجلد الـ Google Drive مع بريد حساب الخدمة.
            </p>
          </div>

          <!-- خيار 2: OAuth2 -->
          <div
            v-if="cloudBackupSettings.gdrive_auth_type === 'oauth'"
            class="form-group full-width fade-in"
          >
            <div class="fields-grid">
              <div class="form-group">
                <label>معرف العميل (Client ID)</label>
                <input
                  type="text"
                  v-model="cloudBackupSettings.gdrive_client_id"
                  placeholder="أدخل Google Client ID"
                  :disabled="!canEdit"
                />
              </div>
              <div class="form-group">
                <label>مفتاح العميل السري (Client Secret)</label>
                <input
                  type="password"
                  v-model="cloudBackupSettings.gdrive_client_secret"
                  placeholder="أدخل Google Client Secret"
                  :disabled="!canEdit"
                />
              </div>
              <div class="form-group full-width">
                <label>رمز التجديد (Refresh Token)</label>
                <input
                  type="password"
                  v-model="cloudBackupSettings.gdrive_refresh_token"
                  placeholder="أدخل Google OAuth2 Refresh Token"
                  :disabled="!canEdit"
                />
                <p class="hint mt-12">
                  يمكنك استخراج رمز التجديد (Refresh Token) بسهولة باستخدام أداة Google OAuth
                  Playground.
                </p>
              </div>
            </div>
          </div>

          <div class="form-group full-width">
            <label>معرف مجلد جوجل درايف (Google Drive Folder ID)</label>
            <input
              type="text"
              v-model="cloudBackupSettings.gdrive_folder_id"
              placeholder="أدخل Folder ID (اختياري)"
              :disabled="!canEdit"
            />
            <p class="hint">
              إذا تركته فارغاً سيتم رفع الملف في المجلد الرئيسي لحساب جوجل درايف الخاص بك.
            </p>
          </div>
        </div>
      </div>

      <!-- إعدادات Dropbox -->
      <div v-if="cloudBackupSettings.provider === 'dropbox'" class="provider-fields fade-in">
        <div class="fields-grid">
          <div class="form-group full-width">
            <label>رمز الوصول (Access Token)</label>
            <input
              type="password"
              v-model="cloudBackupSettings.dropbox_token"
              placeholder="أدخل Dropbox Access Token"
              :disabled="!canEdit"
            />
          </div>
          <div class="form-group full-width">
            <label>مسار المجلد السحابي</label>
            <input
              type="text"
              v-model="cloudBackupSettings.dropbox_path"
              placeholder="/AlAgoouz-ERP-Backups"
              :disabled="!canEdit"
            />
          </div>
        </div>
      </div>

      <!-- إعدادات Webhook -->
      <div v-if="cloudBackupSettings.provider === 'webhook'" class="provider-fields fade-in">
        <div class="fields-grid">
          <div class="form-group full-width">
            <label>رابط الـ Webhook</label>
            <input
              type="text"
              v-model="cloudBackupSettings.webhook_url"
              placeholder="https://discord.com/api/webhooks/..."
              :disabled="!canEdit"
            />
            <p class="hint mt-12">
              يدعم روابط Webhooks الخاصة بـ Discord بشكل مباشر مع تفاصيل محسنة.
            </p>
          </div>
        </div>
      </div>

      <div class="cloud-actions">
        <button
          v-permission="'settings.manage'"
          v-if="canEdit"
          class="btn btn-save"
          @click="saveCloudBackupSettings"
          :disabled="cloudSaving"
        >
          <AppIcon name="save" :size="16" />
          {{ cloudSaving ? 'جاري الحفظ...' : 'حفظ الإعدادات السحابية' }}
        </button>
        <button
          v-if="cloudBackupSettings.provider !== 'none'"
          class="btn btn-outline"
          @click="testCloudBackup"
          :disabled="cloudTesting || !canEdit"
        >
          <AppIcon name="theme" :size="16" />
          {{ cloudTesting ? 'جاري الفحص...' : 'فحص الرفع التجريبي' }}
        </button>
      </div>
    </div>

    <!-- استرداد من ملف -->
    <div v-if="canEdit" class="settings-card">
      <h4 class="group-label">استرداد من ملف خارجي</h4>
      <p class="section-desc">رفع ملف JSON محفوظ مسبقاً لاستبدال بيانات النظام</p>
      <div class="restore-row">
        <label class="file-picker">
          <input type="file" @change="onFileChange" accept="application/json" />
          {{ restoreFile ? restoreFile.name : 'اختر ملف JSON' }}
        </label>
        <button
          class="btn btn-outline"
          @click="uploadRestore"
          :disabled="uploading || !restoreFile"
        >
          <AppIcon name="download" :size="16" style="transform: rotate(180deg)" />
          {{ uploading ? 'جاري الاسترداد...' : 'رفع واسترداد' }}
        </button>
      </div>
    </div>

    <!-- منطقة الخطر -->
    <div v-if="canEdit" class="settings-card danger-zone">
      <h4 class="group-label danger">منطقة الخطر</h4>
      <p class="section-desc">
        هذه الإجراءات لا يمكن التراجع عنها. تأكد من وجود نسخة احتياطية أولاً.
      </p>
      <button class="btn btn-delete" @click="clearSystem" :disabled="clearing">
        <AppIcon name="delete" :size="16" />
        {{ clearing ? 'جاري التصفير...' : 'تصفير بيانات النظام' }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { users as userApi } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { useBackupSettings } from '@/composables/useBackupSettings';

const authStore = useAuthStore();
const canEdit = computed(() => authStore.hasPermission('settings.manage'));
const {
  backups,
  backupView,
  backuping,
  clearing,
  uploading,
  restoreFile,
  cloudBackupSettings,
  cloudSaving,
  cloudTesting,
  loadBackupSettings,
  saveCloudBackupSettings,
  testCloudBackup,
  sortedBackups,
  latestBackup,
  totalBackupSize,
  formatBackupSize,
  formatBackupDate,
  refreshBackups,
  createBackup,
  download,
  restore,
  clearSystem,
  onFileChange,
  uploadRestore,
} = useBackupSettings();

onMounted(async () => {
  try {
    const data = (await userApi.settings())?.data || {};
    loadBackupSettings(data);
  } catch {
    /* offline */
  }
  await refreshBackups();
});
</script>

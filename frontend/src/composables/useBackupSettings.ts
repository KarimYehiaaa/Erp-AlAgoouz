import { computed, ref } from 'vue';
import { users as userApi, backup as backupApi } from '@/api';

/**
 * إدارة النسخ الاحتياطي: النسخ المحلية (إنشاء/تنزيل/استرداد/تصفير) + النسخ السحابي
 * (Google Drive / Dropbox / Webhook) مع فحص اتصال تجريبي.
 */
export function useBackupSettings() {
  const backups = ref<any[]>([]);
  const backupView = ref('cards');
  const backuping = ref(false);
  const clearing = ref(false);
  const uploading = ref(false);
  const restoreFile = ref<any>(null);

  const cloudBackupSettings = ref({
    provider: 'none',
    gdrive_auth_type: 'service_account',
    gdrive_key: '',
    gdrive_folder_id: '',
    gdrive_client_id: '',
    gdrive_client_secret: '',
    gdrive_refresh_token: '',
    dropbox_token: '',
    dropbox_path: '/AlAgoouz-ERP-Backups',
    webhook_url: '',
  });
  const cloudSaving = ref(false);
  const cloudTesting = ref(false);

  /** تعبئة إعدادات النسخ السحابي من استجابة خادم الإعدادات (مع القيم الافتراضية). */
  const loadBackupSettings = (data: Record<string, any>) => {
    cloudBackupSettings.value = data.cloud_backup || {
      provider: 'none',
      gdrive_auth_type: 'service_account',
      gdrive_key: '',
      gdrive_folder_id: '',
      gdrive_client_id: '',
      gdrive_client_secret: '',
      gdrive_refresh_token: '',
      dropbox_token: '',
      dropbox_path: '/AlAgoouz-ERP-Backups',
      webhook_url: '',
    };
  };

  const saveCloudBackupSettings = async () => {
    cloudSaving.value = true;
    try {
      await userApi.updateSetting('cloud_backup', cloudBackupSettings.value);
      alert('تم حفظ إعدادات النسخ السحابي بنجاح');
    } catch (e: any) {
      alert(e.message || 'فشل حفظ إعدادات النسخ السحابي');
    } finally {
      cloudSaving.value = false;
    }
  };

  const testCloudBackup = async () => {
    cloudTesting.value = true;
    try {
      const res = (await backupApi.cloudTest(cloudBackupSettings.value)) as any;
      if (res?.data?.success || res?.success) {
        alert('✅ نجح الاتصال والرفع السحابي التجريبي!');
      } else {
        alert(`❌ فشل الرفع التجريبي: ${res?.message || 'خطأ غير معروف'}`);
      }
    } catch (e: any) {
      alert(`❌ فشل الفحص: ${e.response?.data?.message || e.message}`);
    } finally {
      cloudTesting.value = false;
    }
  };

  const sortedBackups = computed(() =>
    [...backups.value].sort((a: any, b: any) => String(b.name).localeCompare(String(a.name))),
  );
  const latestBackup = computed(() => sortedBackups.value[0] || null);
  const totalBackupSize = computed(() =>
    backups.value.reduce((s: any, b: any) => s + Number(b.size || 0), 0),
  );

  const formatBackupSize = (bytes = 0) => {
    const v = Number(bytes || 0);
    return v >= 1024 * 1024 ? `${(v / 1024 / 1024).toFixed(1)} MB` : `${(v / 1024).toFixed(1)} KB`;
  };

  const formatBackupDate = (name = '') => {
    const m = String(name).match(/(\d{4})[-_](\d{2})[-_](\d{2})[T_ -](\d{2})[-_:](\d{2})/);
    if (!m) return 'غير محدد';
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  };

  const refreshBackups = async () => {
    try {
      backups.value = (await backupApi.list())?.data || [];
    } catch {
      backups.value = [];
    }
  };

  const createBackup = async () => {
    backuping.value = true;
    try {
      await backupApi.create();
      await refreshBackups();
      alert('تم إنشاء النسخة الاحتياطية');
    } catch (e: any) {
      alert(e.message || 'فشل إنشاء النسخة');
    } finally {
      backuping.value = false;
    }
  };

  const download = async (name: any) => {
    try {
      const res = (await backupApi.download(name)) as unknown as Blob;
      const url = URL.createObjectURL(res);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || 'فشل التحميل');
    }
  };

  const restore = async (name: any) => {
    if (!confirm('استرداد نسخة سيستبدل بيانات النظام. استمر؟')) return;
    try {
      await backupApi.restore(name);
      alert('تم الاسترداد بنجاح');
    } catch (e: any) {
      alert(e.message || 'فشل الاسترداد');
    }
  };

  const clearSystem = async () => {
    const token = prompt('اكتب CONFIRM_CLEAR للتأكيد — هذا الإجراء لا يمكن التراجع عنه');
    if (token !== 'CONFIRM_CLEAR') return;
    clearing.value = true;
    try {
      await backupApi.clear({ confirm: 'CONFIRM_CLEAR' });
      alert('تم تصفير النظام');
    } catch (e: any) {
      alert(e.message || 'فشل التصفير');
    } finally {
      clearing.value = false;
    }
  };

  const onFileChange = (e: any) => {
    restoreFile.value = e.target.files?.[0] || null;
  };

  const uploadRestore = async () => {
    if (!restoreFile.value) return;
    if (!confirm('استرداد من ملف سيستبدل بيانات النظام. استمر؟')) return;
    uploading.value = true;
    try {
      await backupApi.restoreFile(restoreFile.value);
      alert('تم الاسترداد من الملف');
      await refreshBackups();
    } catch (e: any) {
      alert(e.message || 'فشل الاسترداد');
    } finally {
      uploading.value = false;
    }
  };

  return {
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
  };
}

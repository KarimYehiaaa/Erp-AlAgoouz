import { onBeforeUnmount, ref } from 'vue';
import { users as userApi } from '@/api';

/**
 * بيانات المحل (الاسم/الهاتف/العنوان/الوصف) وإعدادات الضريبة.
 * تُحمَّل من خادم الإعدادات وتُحفظ عبر userApi.updateSetting.
 */
export function useCompanySettings() {
  const settings = ref({
    company: { name_ar: '', phone: '', address: '', tagline: '' },
    tax: { enabled: false, rate: 14 },
  });
  const saving = ref(false);
  const saveMsg = ref('');
  let saveMsgTimer: ReturnType<typeof setTimeout> | null = null;

  /** تعبئة الإعدادات من استجابة خادم الإعدادات (مع قيم افتراضية عند غيابها). */
  const loadCompanySettings = (data: Record<string, any>) => {
    settings.value.company = data.company || {
      name_ar: 'بن العجوز',
      phone: '',
      address: '',
      tagline: 'للبن التركي',
    };
    settings.value.tax = data.tax || { enabled: false, rate: 14 };
  };

  /** حفظ بيانات المحل مع رسالة حالة تختفي تلقائيًا بعد 3 ثوانٍ. */
  const saveCompany = async () => {
    saving.value = true;
    saveMsg.value = '';
    try {
      await userApi.updateSetting('company', settings.value.company);
      saveMsg.value = 'تم الحفظ — سيظهر على الفواتير';
      if (saveMsgTimer) clearTimeout(saveMsgTimer);
      saveMsgTimer = setTimeout(() => (saveMsg.value = ''), 3000);
    } catch (e: any) {
      saveMsg.value = e.message || 'فشل الحفظ';
    } finally {
      saving.value = false;
    }
  };

  onBeforeUnmount(() => {
    if (saveMsgTimer) clearTimeout(saveMsgTimer);
  });

  return { settings, saving, saveMsg, saveCompany, loadCompanySettings };
}

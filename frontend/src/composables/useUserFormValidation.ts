import { ref } from 'vue';

/**
 * نوع نتيجة تحقق حقل واحد.
 */
export interface ValidationState {
  /** null = لم يُتحقق بعد، true = صالح، false = غير صالح */
  valid: boolean | null;
  /** رسالة العرض (فارغة إذا لا يوجد) */
  msg: string;
}

/**
 * حالة تحقق النموذج كاملة — حقلا username وemail.
 */
export interface UserFormValidations {
  username: ValidationState;
  email: ValidationState;
}

/** وصف قوة كلمة المرور المعروض. */
export interface PasswordStrength {
  /** النسبة المئوية 0-100 */
  percent: number;
  /** النص العربي (قوية جداً ✨ / متوسطة ⚡ / ضعيفة ⚠️...) */
  text: string;
  /** لون الشريط (hex) */
  color: string;
}

/**
 * القيمة الافتراضية لحالة التحقق قبل أي إدخال.
 */
export function emptyValidations(): UserFormValidations {
  return {
    username: { valid: null, msg: '' },
    email: { valid: null, msg: '' },
  };
}

/**
 * تحقق اسم الدخول: مطلوب + 3 أحرف على الأقل.
 * @param username القيمة المدخلة
 * @returns حالة تحقق جاهزة للعرض
 */
export function validateUsernameValue(username: string): ValidationState {
  const val = (username || '').trim();
  if (!val) {
    return { valid: false, msg: 'اسم المستخدم مطلوب' };
  }
  if (val.length < 3) {
    return { valid: false, msg: 'يجب أن يكون 3 حروف على الأقل' };
  }
  return { valid: true, msg: 'اسم المستخدم متاح ✓' };
}

/**
 * تحقق البريد الإلكتروني: اختياري، لكن إذا أُدخل يجب أن يكون بصيغة صحيحة.
 * @param email القيمة المدخلة
 * @returns حالة تحقق جاهزة للعرض
 */
export function validateEmailValue(email: string): ValidationState {
  const val = (email || '').trim();
  if (!val) {
    return { valid: true, msg: '' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(val)) {
    return { valid: false, msg: 'صيغة البريد الإلكتروني غير صحيحة' };
  }
  return { valid: true, msg: 'بريد إلكتروني صالح ✓' };
}

/**
 * حساب قوة كلمة المرور: نقاط على الطول والأحرف الكبيرة والأرقام والرموز.
 * @param password القيمة المدخلة
 * @returns { percent, text, color } لشريط القوة
 */
export function evaluatePasswordStrengthValue(password: string): PasswordStrength {
  const pwd = password || '';
  if (!pwd) {
    return { percent: 0, text: 'ضعيفة جداً ⚠️', color: '#dc2626' };
  }
  let score = 0;
  if (pwd.length >= 6) score += 20;
  if (pwd.length >= 10) score += 20;
  if (/[A-Z]/.test(pwd)) score += 20;
  if (/[0-9]/.test(pwd)) score += 20;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 20;

  if (score <= 40) {
    return { percent: score, text: 'ضعيفة ⚠️', color: '#dc2626' };
  }
  if (score <= 80) {
    return { percent: score, text: 'متوسطة ⚡', color: '#d97706' };
  }
  return { percent: score, text: 'قوية جداً ✨', color: '#16a34a' };
}

/**
 * composable خالص لمنطق تحقق نموذج المستخدم — بلا أي اعتماد على API أو UI.
 * يوفر الحالة التفاعلية (refs) والدوال المحدِّثة، مع إبقاء الدوال الخالصة
 * (validateUsernameValue / validateEmailValue / evaluatePasswordStrengthValue)
 * معرّضة للاختبار المباشر.
 */
export function useUserFormValidation() {
  const validations = ref<UserFormValidations>(emptyValidations());
  const strengthPercent = ref(0);
  const strengthText = ref('ضعيفة جداً ⚠️');
  const strengthColor = ref('#dc2626');

  /** تحقق اسم الدخول وتحديث الحالة. */
  const validateUsername = (username: string) => {
    validations.value.username = validateUsernameValue(username);
  };

  /** تحقق البريد الإلكتروني وتحديث الحالة. */
  const validateEmail = (email: string) => {
    validations.value.email = validateEmailValue(email);
  };

  /** حساب قوة كلمة المرور وتحديث شريط القوة. */
  const evaluatePasswordStrength = (password: string) => {
    const result = evaluatePasswordStrengthValue(password);
    strengthPercent.value = result.percent;
    strengthText.value = result.text;
    strengthColor.value = result.color;
  };

  /** إعادة ضبط كل حالات التحقق إلى الافتراضي. */
  const resetValidations = () => {
    validations.value = emptyValidations();
    strengthPercent.value = 0;
    strengthText.value = 'ضعيفة جداً ⚠️';
    strengthColor.value = '#dc2626';
  };

  return {
    validations,
    strengthPercent,
    strengthText,
    strengthColor,
    validateUsername,
    validateEmail,
    evaluatePasswordStrength,
    resetValidations,
  };
}

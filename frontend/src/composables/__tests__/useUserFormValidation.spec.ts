import { describe, it, expect } from 'vitest';
import {
  useUserFormValidation,
  validateUsernameValue,
  validateEmailValue,
  evaluatePasswordStrengthValue,
  emptyValidations,
} from '../useUserFormValidation';

/**
 * اختبار وحدة لمنطق تحقق نموذج المستخدم (useUserFormValidation).
 * composable خالص بلا API ولا UI — يغطي:
 *  - تحقق اسم الدخول (مطلوب + 3 أحرف)
 *  - تحقق البريد الإلكتروني (اختياري + صيغة)
 *  - قوة كلمة المرور (الطول/الأحرف الكبيرة/الأرقام/الرموز)
 *  - الحالة التفاعلية للـ composable (تحديث refs + إعادة الضبط)
 */
describe('useUserFormValidation (user form validation logic)', () => {
  describe('validateUsernameValue', () => {
    it('يرفض الاسم الفارغ برسالة "اسم المستخدم مطلوب"', () => {
      expect(validateUsernameValue('')).toEqual({ valid: false, msg: 'اسم المستخدم مطلوب' });
      expect(validateUsernameValue('   ')).toEqual({ valid: false, msg: 'اسم المستخدم مطلوب' });
      expect(validateUsernameValue(undefined as unknown as string)).toEqual({
        valid: false,
        msg: 'اسم المستخدم مطلوب',
      });
    });

    it('يرفض الاسم الأقصر من 3 أحرف', () => {
      expect(validateUsernameValue('ab')).toEqual({
        valid: false,
        msg: 'يجب أن يكون 3 حروف على الأقل',
      });
      expect(validateUsernameValue('  k  ')).toEqual({
        valid: false,
        msg: 'يجب أن يكون 3 حروف على الأقل',
      });
    });

    it('يقبل الاسم الصالح مع إزالة المسافات', () => {
      expect(validateUsernameValue('karim')).toEqual({ valid: true, msg: 'اسم المستخدم متاح ✓' });
      expect(validateUsernameValue('  karim  ')).toEqual({
        valid: true,
        msg: 'اسم المستخدم متاح ✓',
      });
    });
  });

  describe('validateEmailValue', () => {
    it('يقبل البريد الفارغ (اختياري) بدون رسالة', () => {
      expect(validateEmailValue('')).toEqual({ valid: true, msg: '' });
      expect(validateEmailValue('   ')).toEqual({ valid: true, msg: '' });
    });

    it('يرفض الصيغة غير الصحيحة', () => {
      expect(validateEmailValue('not-an-email')).toEqual({
        valid: false,
        msg: 'صيغة البريد الإلكتروني غير صحيحة',
      });
      expect(validateEmailValue('user@')).toEqual({
        valid: false,
        msg: 'صيغة البريد الإلكتروني غير صحيحة',
      });
      expect(validateEmailValue('@domain.com')).toEqual({
        valid: false,
        msg: 'صيغة البريد الإلكتروني غير صحيحة',
      });
    });

    it('يقبل البريد الصحيح', () => {
      expect(validateEmailValue('karim@example.com')).toEqual({
        valid: true,
        msg: 'بريد إلكتروني صالح ✓',
      });
      expect(validateEmailValue('  user.name+tag@sub.domain.org  ')).toEqual({
        valid: true,
        msg: 'بريد إلكتروني صالح ✓',
      });
    });
  });

  describe('evaluatePasswordStrengthValue', () => {
    it('يعيد ضعيفة جداً عند كلمة مرور فارغة', () => {
      expect(evaluatePasswordStrengthValue('')).toEqual({
        percent: 0,
        text: 'ضعيفة جداً ⚠️',
        color: '#dc2626',
      });
    });

    it('قصيرة بدون رموز = ضعيفة (أحمر)', () => {
      const r = evaluatePasswordStrengthValue('abc');
      expect(r.percent).toBe(0);
      expect(r.text).toBe('ضعيفة ⚠️');
      expect(r.color).toBe('#dc2626');
    });

    it('6 أحرف فقط = 20 نقطة = ضعيفة', () => {
      const r = evaluatePasswordStrengthValue('abcdef');
      expect(r.percent).toBe(20);
      expect(r.text).toBe('ضعيفة ⚠️');
    });

    it('10 أحرف صغيرة = 40 نقطة = ضعيفة (حد الفاصل)', () => {
      const r = evaluatePasswordStrengthValue('abcdefghij');
      expect(r.percent).toBe(40);
      expect(r.text).toBe('ضعيفة ⚠️');
    });

    it('طول 11 + رقم = 60 نقطة = متوسطة (برتقالي)', () => {
      // 11 أحرف: >=6 (20) + >=10 (20) + رقم (20) = 60
      const r = evaluatePasswordStrengthValue('abcdefghij1');
      expect(r.percent).toBe(60);
      expect(r.text).toBe('متوسطة ⚡');
      expect(r.color).toBe('#d97706');
    });

    it('كلمة مرور قوية كاملة = 100 نقطة = قوية جداً (أخضر)', () => {
      const r = evaluatePasswordStrengthValue('StrongPass1!');
      // الطول ≥10 (20) + حرف كبير (20) + رقم (20) + رمز (20) = 80... لا طول ≥6؟ الطول 12 ≥10 فقط.
      // الحساب: >=6 (20) + >=10 (20) + A-Z (20) + 0-9 (20) + رمز (20) = 100
      expect(r.percent).toBe(100);
      expect(r.text).toBe('قوية جداً ✨');
      expect(r.color).toBe('#16a34a');
    });

    it('11 حرفًا بلا أرقام/رموز/أحرف كبيرة = 40 نقطة = ضعيفة', () => {
      const r = evaluatePasswordStrengthValue('abcdefghijk');
      // >=6 (20) + >=10 (20) = 40 فقط
      expect(r.percent).toBe(40);
      expect(r.text).toBe('ضعيفة ⚠️');
    });
  });

  describe('useUserFormValidation (reactive state)', () => {
    it('يبدأ بحالة افتراضية نظيفة (لا تحقق بعد + قوة صفرية)', () => {
      const v = useUserFormValidation();
      expect(v.validations.value).toEqual(emptyValidations());
      expect(v.strengthPercent.value).toBe(0);
      expect(v.strengthText.value).toBe('ضعيفة جداً ⚠️');
      expect(v.strengthColor.value).toBe('#dc2626');
    });

    it('validateUsername يحدّث حالة الـ ref (فارغ → مطلوب)', () => {
      const v = useUserFormValidation();
      v.validateUsername('');
      expect(v.validations.value.username).toEqual({ valid: false, msg: 'اسم المستخدم مطلوب' });
    });

    it('validateEmail يحدّث حالة الـ ref (صيغة خاطئة → خطأ)', () => {
      const v = useUserFormValidation();
      v.validateEmail('bad');
      expect(v.validations.value.email.valid).toBe(false);
    });

    it('evaluatePasswordStrength يحدّث شريط القوة الثلاثي', () => {
      const v = useUserFormValidation();
      v.evaluatePasswordStrength('StrongPass1!');
      expect(v.strengthPercent.value).toBe(100);
      expect(v.strengthText.value).toBe('قوية جداً ✨');
      expect(v.strengthColor.value).toBe('#16a34a');
    });

    it('resetValidations يعيد كل شيء للافتراضي بعد تحقق سابق', () => {
      const v = useUserFormValidation();
      v.validateUsername('x');
      v.validateEmail('bad@');
      v.evaluatePasswordStrength('StrongPass1!');

      v.resetValidations();
      expect(v.validations.value).toEqual(emptyValidations());
      expect(v.strengthPercent.value).toBe(0);
      expect(v.strengthText.value).toBe('ضعيفة جداً ⚠️');
      expect(v.strengthColor.value).toBe('#dc2626');
    });

    it('كل استدعاء composable يملك حالة مستقلة', () => {
      const a = useUserFormValidation();
      const b = useUserFormValidation();
      a.validateUsername('karim');
      expect(a.validations.value.username.valid).toBe(true);
      expect(b.validations.value.username.valid).toBeNull();
    });
  });
});

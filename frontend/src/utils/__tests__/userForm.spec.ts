import { describe, it, expect } from 'vitest';
import {
  buildUserPayload,
  emptyUserForm,
  filterUsersByQuery,
  generateRestorePassword,
  pickDefaultRoleId,
  userToForm,
} from '../userForm';

/**
 * اختبار وحدة لأدوات نموذج المستخدم الخالصة (utils/userForm.ts).
 * تغطي: بناء payload الإرسال، ترتيب الدور الافتراضي، الفلترة، كلمة الاستعادة،
 * والتحويل بين المستخدم والنموذج — بلا أي API أو UI.
 */
describe('userForm utils (pure user form logic)', () => {
  describe('emptyUserForm', () => {
    it('يعيد نموذجًا فارغًا مع الدور الافتراضي الممرر', () => {
      expect(emptyUserForm(3)).toEqual({
        id: null,
        username: '',
        full_name: '',
        email: '',
        phone: '',
        role_id: 3,
        is_active: true,
        password: '',
      });
    });

    it('بدون دور افتراضي يترك role_id = null', () => {
      expect(emptyUserForm().role_id).toBeNull();
    });
  });

  describe('pickDefaultRoleId', () => {
    it('يختار أول دور غير admin', () => {
      const roles = [
        { id: 1, name: 'admin', name_ar: 'مالك' },
        { id: 2, name: 'supervisor', name_ar: 'مشرف' },
        { id: 3, name: 'cashier', name_ar: 'كاشير' },
      ];
      expect(pickDefaultRoleId(roles)).toBe(2);
    });

    it('يرجع أول دور إذا كان admin هو الوحيد', () => {
      expect(pickDefaultRoleId([{ id: 1, name: 'admin' }])).toBe(1);
    });

    it('يرجع null لقائمة فارغة أو undefined', () => {
      expect(pickDefaultRoleId([])).toBeNull();
      expect(pickDefaultRoleId(undefined as unknown as any[])).toBeNull();
    });
  });

  describe('buildUserPayload', () => {
    it('يبني payload بإزالة المسافات من الحقول النصية', () => {
      const form = {
        id: null,
        username: '  karim  ',
        full_name: ' كريم يحيى ',
        email: ' karim@x.com ',
        phone: ' 0100 ',
        role_id: 2,
        is_active: true,
        password: '',
      };
      expect(buildUserPayload(form)).toEqual({
        username: 'karim',
        full_name: 'كريم يحيى',
        email: 'karim@x.com',
        phone: '0100',
        role_id: 2,
        is_active: true,
      });
    });

    it('يحوّل الحقول الفارغة إلى null ولا يضيف كلمة مرور فارغة', () => {
      const payload = buildUserPayload(emptyUserForm());
      expect(payload.username).toBeNull();
      expect(payload.full_name).toBeNull();
      expect(payload.password).toBeUndefined();
    });

    it('يضيف كلمة المرور فقط إذا أُدخلت (مع trim)', () => {
      const form = emptyUserForm(1);
      form.password = '  Secret1!  ';
      const payload = buildUserPayload(form);
      expect(payload.password).toBe('Secret1!');
    });
  });

  describe('filterUsersByQuery', () => {
    const users = [
      { id: 1, username: 'karim', full_name: 'كريم يحيى', email: 'karim@x.com' },
      { id: 2, username: 'sara', full_name: 'سارة أحمد', email: 'sara@x.com' },
    ];

    it('يرجع كل المستخدمين عند بحث فارغ', () => {
      expect(filterUsersByQuery(users, '')).toHaveLength(2);
      expect(filterUsersByQuery(users, '   ')).toHaveLength(2);
    });

    it('يبحث بالاسم/البريد/الاسم الكامل مع تجاهل حالة الأحرف', () => {
      expect(filterUsersByQuery(users, 'KARIM').map((u) => u.id)).toEqual([1]);
      expect(filterUsersByQuery(users, 'سارة').map((u) => u.id)).toEqual([2]);
      expect(filterUsersByQuery(users, 'sara@x.com').map((u) => u.id)).toEqual([2]);
    });

    it('يرجع قائمة فارغة عند عدم وجود تطابق', () => {
      expect(filterUsersByQuery(users, 'zzz')).toHaveLength(0);
    });
  });

  describe('generateRestorePassword', () => {
    it('يولّد كلمة مرور تتضمن حرفًا كبيرًا ورقمًا ورمزًا (تصلح لكاشف القوة)', () => {
      for (let i = 0; i < 20; i++) {
        const pwd = generateRestorePassword();
        expect(pwd.length).toBeGreaterThanOrEqual(10);
        expect(pwd).toContain('!Aa');
        expect(/\d/.test(pwd)).toBe(true);
        expect(/[A-Z]/.test(pwd)).toBe(true);
      }
    });

    it('كل استدعاء يولّد قيمة مختلفة', () => {
      expect(generateRestorePassword()).not.toBe(generateRestorePassword());
    });
  });

  describe('userToForm', () => {
    it('يحوّل مستخدمًا من الـ API إلى نموذج قابل للتعديل', () => {
      const user = {
        id: 7,
        username: 'ali',
        full_name: 'علي حسن',
        email: 'ali@x.com',
        phone: '0123',
        role_id: 4,
        is_active: 1,
      };
      expect(userToForm(user)).toEqual({
        id: 7,
        username: 'ali',
        full_name: 'علي حسن',
        email: 'ali@x.com',
        phone: '0123',
        role_id: 4,
        is_active: true,
        password: '',
      });
    });

    it('يستخدم الدور الافتراضي إن لم يكن للمستخدم دور', () => {
      const user = { id: 8, username: 'n', full_name: 'ن' };
      expect(userToForm(user, 5).role_id).toBe(5);
      expect(userToForm(user, 5).is_active).toBe(false);
    });
  });
});

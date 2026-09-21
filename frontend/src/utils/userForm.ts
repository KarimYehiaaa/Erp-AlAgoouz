/**
 * أدوات خالصة لمنطق نموذج المستخدم وإدارة المستخدمين/الأدوار.
 * لا تلمس أي API أو UI — قابلة للاختبار المباشر (راجع __tests__/userForm.spec.ts).
 */

/**
 * نوع حقول نموذج المستخدم.
 */
export interface UserFormShape {
  id: number | null;
  username: string;
  full_name: string;
  email: string;
  phone: string;
  role_id: number | null;
  warehouse_id: number | null;
  is_active: boolean;
  password: string;
}

/**
 * نموذج فارغ لبدء إنشاء مستخدم جديد.
 * @param defaultRoleId الدور الافتراضي المختار (أول دور غير admin)
 */
export function emptyUserForm(defaultRoleId: number | null = null): UserFormShape {
  return {
    id: null,
    username: '',
    full_name: '',
    email: '',
    phone: '',
    role_id: defaultRoleId,
    warehouse_id: null,
    is_active: true,
    password: '',
  };
}

/**
 * اختيار الدور الافتراضي: أول دور غير admin، أو أول دور إن لم يوجد غيره.
 * @param roles قائمة الأدوار
 * @returns id الدور الافتراضي أو null
 */
export function pickDefaultRoleId(roles: any[]): number | null {
  if (!roles?.length) return null;
  const firstNonAdmin = roles.find((r: any) => r.name !== 'admin');
  return (firstNonAdmin || roles[0])?.id ?? null;
}

/**
 * بناء payload الإرسال إلى الـ API من النموذج.
 * يُنزع المسافات من الحقول النصية ويُضاف كلمة المرور فقط إذا أُدخلت.
 * @param form النموذج الحالي
 * @returns كائن payload جاهز لـ create/update
 */
export function buildUserPayload(form: UserFormShape): Record<string, any> {
  const payload: Record<string, any> = {
    username: form.username?.trim() || null,
    full_name: form.full_name?.trim() || null,
    email: form.email?.trim() || null,
    phone: form.phone?.trim() || null,
    role_id: form.role_id,
    warehouse_id: form.warehouse_id ?? null,
    is_active: form.is_active,
  };
  if (form.password?.trim()) {
    payload.password = form.password.trim();
  }
  return payload;
}

/**
 * فلترة المستخدمين حسب نص البحث (اسم الدخول/الاسم الكامل/البريد).
 * @param users قائمة المستخدمين
 * @param query نص البحث
 * @returns المستخدمون المطابقون (كلهم إذا كان البحث فارغًا)
 */
export function filterUsersByQuery(users: any[], query: string): any[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return users;
  return users.filter(
    (u: any) =>
      u.username?.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q),
  );
}

/**
 * توليد كلمة مرور عشوائية آمنة بدرجة معقولة لاستعادة مستخدم محذوف.
 * الصيغة: 8 أحرف عشوائية + "!Aa" + رقم (تضمن حرفًا كبيرًا ورقمًا ورمزًا).
 * @returns كلمة مرور عشوائية
 */
export function generateRestorePassword(): string {
  return Math.random().toString(36).slice(-8) + '!Aa' + Math.floor(Math.random() * 10);
}

/**
 * تحويل مستخدم (من الـ API أو من نسخة احتياطية) إلى نموذج قابل للتعديل.
 * @param user كائن المستخدم الخام
 * @param defaultRoleId الدور الافتراضي إن لم يكن للمستخدم دور
 */
export function userToForm(user: any, defaultRoleId: number | null = null): UserFormShape {
  return {
    id: user.id,
    username: user.username || '',
    full_name: user.full_name || '',
    email: user.email || '',
    phone: user.phone || '',
    role_id: user.role_id || defaultRoleId,
    warehouse_id: user.warehouse_id ?? null,
    is_active: !!user.is_active,
    password: '',
  };
}

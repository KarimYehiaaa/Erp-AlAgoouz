/**
 * shared/types.ts — الأنماط المشتركة بين الباكند والواجهة
 * ═══════════════════════════════════════════════════════
 * المصدر الموحد للأنماط التي يستهلكها الطرفان (المستخدم، الصلاحية...)
 * لتجنب تكرار التعريفات في backend/src وfrontend/src.
 *
 * ملاحظة: هذه ملفات أنواع فقط (بدون منطق تشغيل) — آمنة للاستيراد
 * من كلا الطرفين دون آثار جانبية.
 */

/** المستخدم المعرّف من قاعدة البيانات (users + roles). */
export interface User {
  id: number;
  uuid?: string;
  username: string;
  full_name?: string;
  email?: string;
  role_id?: number;
  role_name?: string;
  role_name_ar?: string;
  [key: string]: any;
}

/** صلاحية داخل النظام (permissions). */
export interface Permission {
  id?: number;
  code: string;
  name_ar?: string;
  module?: string;
}

/** دور مستخدم مع صلاحياته (لشاشات إدارة الأدوار). */
export interface Role {
  id: number;
  name: string;
  name_ar?: string;
  description?: string;
}

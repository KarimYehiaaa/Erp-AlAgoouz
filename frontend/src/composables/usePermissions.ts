/**
 * usePermissions — composable للتحقق من صلاحيات المستخدم في الـ template
 *
 * استخدام:
 * const { can, canAny } = usePermissions();
 * v-if="can('products.manage')"
 * v-if="canAny(['reports.view', 'dashboard.view'])"
 */
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';

/**
 * composable للتحقق من صلاحيات المستخدم في القوالب.
 * @returns {{ can: (permission: string) => boolean, canAny: (permissions?: string[]) => boolean, canAll: (permissions?: string[]) => boolean, isAdmin: import('vue').ComputedRef<boolean>, isAuthenticated: import('vue').ComputedRef<boolean>, currentUser: import('vue').ComputedRef<import('@/stores/auth').User | null> }}
 */
export function usePermissions() {
  const authStore = useAuthStore();

  /** تحقق من صلاحية واحدة */
  const can = (permission: any) => {
    if (!permission) return true;
    return authStore.hasPermission(permission);
  };

  /** تحقق من أي صلاحية في قائمة */
  const canAny = (permissions = []) => {
    return permissions.some((p: any) => authStore.hasPermission(p));
  };

  /** تحقق من جميع الصلاحيات في قائمة */
  const canAll = (permissions = []) => {
    return permissions.every((p: any) => authStore.hasPermission(p));
  };

  /** هل المستخدم ادمن؟ */
  const isAdmin = computed(
    () => authStore.user?.role === 'admin' || authStore.hasPermission('admin'),
  );

  /** هل المستخدم مسجل دخول؟ */
  const isAuthenticated = computed(() => authStore.isAuthenticated);

  /** اسم المستخدم الحالي */
  const currentUser = computed(() => authStore.user);

  return {
    can,
    canAny,
    canAll,
    isAdmin,
    isAuthenticated,
    currentUser,
  };
}

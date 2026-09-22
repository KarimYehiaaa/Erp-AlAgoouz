import type { NavigationGuard } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { ADMIN_ROLES } from '../../../shared/permissions.js';

/**
 * حارس التنقل المركزي: المصادقة، توجيه الكاشير، والصلاحيات.
 * مفصول عن تعريف الراوتر ليكون قابلاً للاختبار مباشرة.
 */
export const navigationGuard: NavigationGuard = async (to, _from, next) => {
  const auth = useAuthStore();
  const isNative =
    typeof window !== 'undefined' &&
    (!!(window as any).Capacitor?.isNativePlatform?.() ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:');

  if (auth.isAuthenticated && !auth.profileLoaded) {
    // لا نسمح أبداً لطلب profile عالق بمنع التنقل — مهلة قصوى 4 ثوانٍ
    await Promise.race([auth.fetchProfile(), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    // Preserve the protected destination so login returns the user to the
    // screen they originally requested (especially /mobile).
    return next({ path: '/login', query: { redirect: to.fullPath || to.path } });
  }
  if (to.meta.guest && auth.isAuthenticated) {
    if (isNative) return next('/mobile');
    return next(auth.isCashier ? '/pos' : '/');
  }

  // في تطبيق الموبايل الأصلي، نوجه الصفحة الرئيسية مباشرة إلى شاشة الموبايل
  if (isNative && (to.path === '/' || to.name === 'Dashboard')) {
    return next('/mobile');
  }

  // حماية وتوجيه الكاشير التلقائي
  if (auth.isAuthenticated && auth.isCashier) {
    if (to.path === '/' || to.name === 'Dashboard') {
      return next('/pos');
    }
    // السماح فقط لشاشة مبيعات المحل
    if (to.path !== '/pos') {
      return next('/pos');
    }
  }

  if (to.meta.permission && auth.isAuthenticated) {
    const required = Array.isArray(to.meta.permission) ? to.meta.permission : [to.meta.permission];
    const hasPerm = required.some((p: string) => auth.hasPermission(p));
    if (!hasPerm) {
      // A cashier without POS permission must not redirect to the denied route itself.
      if (auth.isCashier && to.path === '/pos') return next(false);
      return next(auth.isCashier ? '/pos' : '/');
    }
  }

  // صفحات المدير فقط
  if (to.meta.requireAdmin && auth.isAuthenticated) {
    const role = auth.user?.role_name || (auth.user as any)?.role;
    if (!role || !(ADMIN_ROLES as readonly string[]).includes(role)) {
      return next('/');
    }
  }

  next();
};

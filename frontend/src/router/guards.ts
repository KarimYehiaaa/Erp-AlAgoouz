import type { NavigationGuard } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

/**
 * حارس التنقل المركزي: المصادقة، توجيه الكاشير، والصلاحيات.
 * مفصول عن تعريف الراوتر ليكون قابلاً للاختبار مباشرة.
 */
export const navigationGuard: NavigationGuard = async (to, _from, next) => {
  const auth = useAuthStore();

  if (auth.isAuthenticated && !auth.profileLoaded) {
    // لا نسمح أبداً لطلب profile عالق بمنع التنقل — مهلة قصوى 4 ثوانٍ
    await Promise.race([auth.fetchProfile(), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) return next('/login');
  if (to.meta.guest && auth.isAuthenticated) {
    return next(auth.isCashier ? '/branch-sales' : '/');
  }

  // حماية وتوجيه الكاشير التلقائي
  if (auth.isAuthenticated && auth.isCashier) {
    if (to.path === '/' || to.name === 'Dashboard') {
      return next('/branch-sales');
    }
    // السماح فقط لشاشة مبيعات الفرع
    if (to.path !== '/branch-sales') {
      return next('/branch-sales');
    }
  }

  if (to.meta.permission && auth.isAuthenticated) {
    const required = Array.isArray(to.meta.permission) ? to.meta.permission : [to.meta.permission];
    const hasPerm = required.some((p: string) => auth.hasPermission(p));
    if (!hasPerm) {
      return next(auth.isCashier ? '/branch-sales' : '/');
    }
  }

  // صفحات المدير فقط
  if (to.meta.requireAdmin && auth.isAuthenticated) {
    if (auth.user?.role_name !== 'admin') {
      return next('/');
    }
  }

  next();
};

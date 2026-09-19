import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import PosLoginView from '../views/PosLoginView.vue';
import PosShiftOpenView from '../views/PosShiftOpenView.vue';
import PosSalesView from '../views/PosSalesView.vue';
import PosShiftCloseView from '../views/PosShiftCloseView.vue';
import PosSyncStatusView from '../views/PosSyncStatusView.vue';
import { usePosAuthStore } from '../stores/posAuth';
import { sessionService } from '../services/sessionService';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/sales' },
  { path: '/login', name: 'login', component: PosLoginView },
  { path: '/shift/open', name: 'shiftOpen', component: PosShiftOpenView },
  { path: '/sales', name: 'sales', component: PosSalesView },
  { path: '/shift/close', name: 'shiftClose', component: PosShiftCloseView },
  { path: '/sync', name: 'sync', component: PosSyncStatusView },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

let startupRestorationDone = false;

router.beforeEach(async (to, _from, next) => {
  const authStore = usePosAuthStore();

  // إذا كانت الجلسة قيد الاستعادة أو لم تُسترجع بعد عند أول انتقال
  if (!startupRestorationDone) {
    if (!sessionService.getAccessToken() && !authStore.token) {
      await authStore.restoreSession();
    }
    startupRestorationDone = true;
  }

  // انتظر إذا كانت عملية تهيئة الجلسة قيد التنفيذ
  if (sessionService.isSessionInitializing()) {
    let attempts = 0;
    while (sessionService.isSessionInitializing() && attempts < 20) {
      await new Promise((r) => setTimeout(r, 50));
      attempts++;
    }
  }

  const hasAuth = !!sessionService.getAccessToken() && (authStore.isAuthenticated || !!authStore.user);

  if (to.path === '/login') {
    if (hasAuth) {
      next('/sales');
    } else {
      next();
    }
  } else {
    if (!hasAuth) {
      next('/login');
    } else {
      next();
    }
  }
});

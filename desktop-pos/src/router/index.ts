import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import PosLoginView from '../views/PosLoginView.vue';
import PosShiftOpenView from '../views/PosShiftOpenView.vue';
import PosSalesView from '../views/PosSalesView.vue';
import PosShiftCloseView from '../views/PosShiftCloseView.vue';
import PosSyncStatusView from '../views/PosSyncStatusView.vue';

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

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('pos_token');
  if (to.path !== '/login' && !token) {
    next('/login');
  } else {
    next();
  }
});

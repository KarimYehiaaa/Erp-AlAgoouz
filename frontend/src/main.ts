import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import AppIcon from './components/AppIcon.vue';
import './styles/main.scss';
import './styles/mobile.scss';
import { initSentry } from './sentry';
import * as Sentry from '@sentry/vue';

import { permissionDirective } from './directives/permission';
import { spotlightDirective } from './directives/spotlight';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

initSentry(app, router);

app.component('AppIcon', AppIcon);
app.directive('permission', permissionDirective);
app.directive('spotlight', spotlightDirective);

app.config.errorHandler = (err: any, instance: any, info: any) => {
  console.error('[Global Vue ErrorHandler caught error]:', err, info);
  Sentry.captureException(err);
};

app.mount('#app');

//  Register PWA Service Worker
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err: any) => {
      console.error('ServiceWorker registration failed:', err);
    });
  });
}

//  Connect Real-time WebSocket Channel
// ── إصلاح التجمّد: نفس host الصفحة (يعمل DEV + PROD)، backoff تصاعدي،
//    إيقاف كامل عند إخفاء التبويب، وإزالة الإغلاق المزدوج في onerror.
import { useAppStore } from './stores/app';
const appStore = useAppStore(pinia);

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
// الباك يخدم الـ WebSocket على نفس host/port الصفحة — المصادقة عبر HttpOnly cookie
// المرفق تلقائياً مع ترقية الاتصال (نفس الأصل) — لا توكن في الـ URL.
const buildWsUrl = () => `${wsProtocol}//${window.location.host}/ws`;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 12;

const scheduleReconnect = () => {
  if (document.hidden || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
  // backoff تصاعدي: 5s → 10s → 20s → 40s (بحد أقصى 60s)
  const delay = Math.min(60_000, 5_000 * 2 ** reconnectAttempts);
  reconnectAttempts++;
  reconnectTimer = setTimeout(connectWebSocket, delay);
};

const connectWebSocket = () => {
  if (document.hidden) return; // لا نتواصل والتبويب مخفي
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(buildWsUrl());

  ws.onopen = () => {
    reconnectAttempts = 0; // اتصال ناجح — إعادة تعيين العدّاد
  };

  ws.onmessage = (event: any) => {
    try {
      const msg = JSON.parse(event.data);
      if (['sales_changed', 'expenses_changed'].includes(msg.event)) {
        appStore.triggerDataRefresh();
      }
    } catch {
      // تجاهل: فشل إشعار WebSocket غير حرج
    }
  };

  ws.onclose = () => {
    ws = null;
    scheduleReconnect();
  };

  // على الخطأ يغلق المتصفح الاتصال تلقائيًا ويُطلق onclose — لا حاجة لـ ws.close() المزدوج
  ws.onerror = () => {};
};

// إيقاف/استئناف عند إخفاء/إظهار التبويب — يمنع حلقة الاتصال أثناء عدم الاستخدام
const handleVisibility = () => {
  if (document.hidden) {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      try {
        ws.close();
      } catch {
        // تجاهل
      }
      ws = null;
    }
  } else if (!ws && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts = 0;
    connectWebSocket();
  }
};

document.addEventListener('visibilitychange', handleVisibility);

connectWebSocket();

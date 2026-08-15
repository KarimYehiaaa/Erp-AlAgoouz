import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import AppIcon from './components/AppIcon.vue';
import SkeletonLoader from './components/SkeletonLoader.vue';
import './styles/main.scss';
import { initSentry } from './sentry';

import { permissionDirective } from './directives/permission';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

initSentry(app, router);

app.component('AppIcon', AppIcon);
app.directive('permission', permissionDirective);

app.config.errorHandler = (err: any, instance: any, info: any) => {
  console.error('[Global Vue ErrorHandler caught error]:', err, info);
};

app.mount('#app');

// 📲 Register PWA Service Worker
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err: any) => {
      console.error('ServiceWorker registration failed:', err);
    });
  });
}

// 🔌 Connect Real-time WebSocket Channel
import { useAppStore } from './stores/app';
const appStore = useAppStore(pinia);

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = import.meta.env.DEV ? 'localhost:3000' : window.location.host;
const wsUrl = `${wsProtocol}//${wsHost}`;

let ws: WebSocket;
const connectWebSocket = () => {
  ws = new WebSocket(wsUrl);

  ws.onmessage = (event: any) => {
    try {
      const msg = JSON.parse(event.data);
      if (['sales_changed', 'expenses_changed'].includes(msg.event)) {
        appStore.triggerDataRefresh();
      }
    } catch (err: any) {}
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 5000);
  };

  ws.onerror = () => {
    ws.close();
  };
};

connectWebSocket();

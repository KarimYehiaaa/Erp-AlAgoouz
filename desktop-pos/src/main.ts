import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { initServerConfig } from './services/config';
import { usePosAuthStore } from './stores/posAuth';

async function bootstrap() {
  await initServerConfig();

  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);

  // Restore authenticated session securely before router & UI mount
  const authStore = usePosAuthStore(pinia);
  await authStore.restoreSession();

  app.use(router);
  app.mount('#app');
}

bootstrap();

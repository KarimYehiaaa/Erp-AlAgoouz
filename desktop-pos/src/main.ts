import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { initServerConfig } from './services/config';

async function bootstrap() {
  await initServerConfig();

  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.mount('#app');
}

bootstrap();

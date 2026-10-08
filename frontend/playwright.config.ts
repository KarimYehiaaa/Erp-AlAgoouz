import { defineConfig } from '@playwright/test';

/**
 * اختبارات المتصفح للإقلاع وواجهة الموبايل.
 * يتطلب تثبيت المتصفح مرة واحدة: npx playwright install chromium
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Own the server process on Windows and keep test assets separate from
    // local/mobile builds. PREBUILT requires a build into .playwright-dist.
    command:
      process.env.PLAYWRIGHT_PREBUILT === '1'
        ? 'node ../node_modules/vite/bin/vite.js preview --outDir .playwright-dist --host 127.0.0.1 --port 4173 --strictPort'
        : 'node ../node_modules/vite/bin/vite.js build --outDir .playwright-dist && node ../node_modules/vite/bin/vite.js preview --outDir .playwright-dist --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});

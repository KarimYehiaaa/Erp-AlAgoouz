import { defineConfig } from '@playwright/test';

/**
 * إعدادات Playwright المصغرة — اختبار دخان واحد للتأكد من صحة الإقلاع.
 * يتطلب تثبيت المتصفح مرة واحدة: npx playwright install chromium
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
  },
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});

import { test, expect } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const playwrightOutputDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  process.env.PLAYWRIGHT_OUTPUT_DIR || '.playwright-dist',
);

type CspTestWindow = Window & { __cspViolations: string[] };

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, (socket) => socket.close());
});

test('login page renders with credentials form', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // الحرس يوجّه غير المسجلين إلى /login
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
});

test('production CSP blocks foreign scripts and the saved theme loads before the app', async ({
  page,
}) => {
  await page.route('**/assets/index-*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.continue();
  });
  await page.addInitScript(() => {
    localStorage.setItem('darkMode', 'true');
    const testWindow = window as CspTestWindow;
    testWindow.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      testWindow.__cspViolations.push(event.violatedDirective);
    });
  });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#16100c');
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.evaluate(() => {
    const script = document.createElement('script');
    script.src = 'https://csp-probe.invalid/blocked.js';
    document.head.append(script);
  });
  await expect
    .poll(() => page.evaluate(() => (window as CspTestWindow).__cspViolations))
    .toContain('script-src-elem');
});

test('the production PDF export chunk still generates a valid PDF download', async ({ page }) => {
  const assets = await readdir(path.join(playwrightOutputDirectory, 'assets'));
  const pdfExportAsset = assets.find(
    (name) => name.startsWith('pdfExport-') && name.endsWith('.js'),
  );
  expect(pdfExportAsset).toBeTruthy();

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(async (assetName) => {
    const { e: exportElementToPdf } = await import(`/assets/${assetName}`);
    const content = document.createElement('div');
    content.textContent = 'PDF export production smoke test';
    Object.assign(content.style, {
      position: 'fixed',
      left: '16px',
      top: '16px',
      width: '320px',
      padding: '16px',
      background: '#ffffff',
      color: '#111111',
    });
    document.body.append(content);
    await exportElementToPdf({
      element: content,
      filename: 'erp-pdf-smoke.pdf',
      scale: 1,
      quality: 0.6,
    });
    content.remove();
  }, pdfExportAsset);
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('erp-pdf-smoke.pdf');
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const pdf = await readFile(downloadPath!);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
});

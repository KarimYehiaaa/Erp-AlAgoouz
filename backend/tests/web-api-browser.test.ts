import { expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import bcrypt from 'bcryptjs';
import app from '../src/app.ts';
import config from '../src/config/index.ts';
import { query } from '../src/database/pool.ts';
import { assertSafeTestDatabase } from '../scripts/testDatabaseSafety.ts';

// Explicit whole-system gate: requires a built frontend and its Chromium tools.
it.skipIf(process.env.ERP_WEB_API_BROWSER_TEST !== '1')(
  'real browser login and products work with actual API and PostgreSQL while external fonts are unavailable',
  async () => {
    assertSafeTestDatabase(config.db);
    const frontendRoot = fileURLToPath(new URL('../../frontend/', import.meta.url));
    const buildRoot = path.resolve(
      frontendRoot,
      process.env.ERP_WEB_API_BUILD_DIR || '.playwright-dist',
    );
    expect(existsSync(path.join(buildRoot, 'index.html')), 'Build the frontend first').toBe(true);
    const frontendRequire = createRequire(path.join(frontendRoot, 'package.json'));
    const { chromium } = (await import(
      pathToFileURL(frontendRequire.resolve('@playwright/test')).href
    )) as typeof import('@playwright/test');
    const id = randomUUID();
    const username = `browser-${id}`;
    const password = 'IsolatedBrowserFixture123!';
    const productName = `منتج اختبار المتصفح ${id}`;
    const role = (await query("SELECT id FROM roles WHERE name='admin' LIMIT 1")).rows[0];
    const user = (
      await query(
        'INSERT INTO users(username,password_hash,role_id,is_active,full_name) VALUES($1,$2,$3,TRUE,$4) RETURNING id',
        [username, await bcrypt.hash(password, 10), role.id, 'Isolated browser user'],
      )
    ).rows[0];
    const product = (
      await query(
        "INSERT INTO products(sku,name_ar,unit,purchase_price,sale_price,is_active) VALUES($1,$2,'count',100,123.45,TRUE) RETURNING id",
        [id, productName],
      )
    ).rows[0];
    const frontend = express();
    // The isolated build directory starts with a dot; allow only this fixture root.
    frontend.use(express.static(buildRoot, { dotfiles: 'allow' }));
    frontend.get('/{*path}', (_req, res) =>
      res.sendFile(path.join(buildRoot, 'index.html'), { dotfiles: 'allow' }),
    );
    const server = createServer((req, res) =>
      req.url?.startsWith('/api/') ? app(req, res) : frontend(req, res),
    );
    let browser: Browser | undefined;
    let page: Page | undefined;
    const browserErrors: string[] = [];
    const pageErrors: string[] = [];
    let blockedFontRequests = 0;
    const previousOrigins = config.corsOrigin;
    const base = 'http://127.0.0.1:4173';
    const foreignApiRequests: string[] = [];
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(4173, '127.0.0.1', resolve);
      });
      config.corsOrigin = [base];
      browser = await chromium.launch();
      page = await browser.newPage();
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
        browserErrors.push(error.message);
      });
      page.on('requestfailed', (request) =>
        browserErrors.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`),
      );
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.protocol.startsWith('http') && url.origin !== base) {
          if (url.hostname === 'fonts.googleapis.com') blockedFontRequests++;
          if (url.pathname.startsWith('/api/')) foreignApiRequests.push(url.origin);
          return route.abort();
        }
        return route.continue();
      });
      await page.routeWebSocket(/.*/, (socket) => socket.close());
      await page.goto(`${base}/login`);
      await page.locator('#login-username').fill(username);
      await page.locator('#login-password').fill(password);
      const loginResponse = page.waitForResponse((response) =>
        response.url().endsWith('/api/v1/auth/login'),
      );
      await page.locator('button[type="submit"]').click();
      expect((await loginResponse).status()).toBe(200);
      await page.waitForURL((url) => !url.pathname.startsWith('/login'));
      const profile = await page.evaluate(async () => (await fetch('/api/v1/auth/profile')).json());
      expect(profile.data.user.id).toBe(user.id);
      await page.goto(`${base}/products`);
      await page.getByText(productName, { exact: true }).first().waitFor();
      const persisted = await query('SELECT name_ar,sale_price FROM products WHERE id=$1', [
        product.id,
      ]);
      expect(persisted.rows[0]).toMatchObject({ name_ar: productName, sale_price: 123.45 });
      await page.reload();
      await page.getByText(productName, { exact: true }).first().waitFor();
      expect(foreignApiRequests).toEqual([]);
      expect(blockedFontRequests).toBeGreaterThan(0);
      expect(pageErrors).toEqual([]);
    } catch (error) {
      throw new Error(
        `Browser integration failed: ${error instanceof Error ? error.message : String(error)}; errors=${JSON.stringify(browserErrors.slice(0, 12))}; body=${await page
          ?.locator('body')
          .innerText()
          .catch(() => '')}`,
        { cause: error },
      );
    } finally {
      await browser?.close();
      config.corsOrigin = previousOrigins;
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
    }
  },
  90000,
);

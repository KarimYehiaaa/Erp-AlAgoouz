import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' });
const user = { id: 1, username: 'audit-manager', full_name: 'Audit manager', role_name: 'admin' };
const summary = (date: string, amount: number) => ({
  date,
  grandTotal: amount,
  totalCount: 1,
  yesterdayTotal: 0,
  growthPercent: 0,
  averageOrderValue: amount,
  retail: { total: amount, discount: 0, count: 1, cash: amount, instapay: 0, card: 0, other: 0 },
  wholesale: { total: 0, discount: 0, count: 0, cash: 0, instapay: 0, card: 0, other: 0 },
  paymentTotals: { cash: amount, instapay: 0, card: 0, other: 0 },
  expenses: { total: 0, count: 0 },
  netCashflow: amount,
  activeShift: null,
  recentSales: [],
  pendingApprovalsCount: 0,
});

async function prepare(
  page: Page,
  handleSummary: (date: string) => Promise<unknown>,
  denyInventory = false,
) {
  await page.clock.setFixedTime(new Date('2026-10-01T23:30:00Z')); // Cairo Oct 2, New York Oct 1.
  await page.addInitScript((user) => {
    localStorage.setItem('user', JSON.stringify(user));
  }, user);
  await page.routeWebSocket(/.*/, (socket) => socket.close());
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = {};
    let status = 200;
    if (url.pathname.endsWith('/auth/profile')) data = { user, permissions: [] };
    else if (url.pathname.endsWith('/manager-mobile/summary'))
      data = await handleSummary(url.searchParams.get('date') || '');
    else if (url.pathname.endsWith('/manager-mobile/inventory')) {
      status = denyInventory ? 403 : 200;
      data = {
        totalValuation: 500,
        totalRetailValue: 700,
        totalQuantity: 5,
        productsInStock: 1,
        categories: [],
        lowStockItems: [],
      };
    } else if (url.pathname.endsWith('/manager-mobile/approvals')) data = [];
    await route.fulfill({
      status,
      json: status === 403 ? { success: false, message: 'Forbidden' } : { success: true, data },
    });
  });
}

test('manager mobile uses Cairo business dates even on a phone in another timezone', async ({
  page,
}) => {
  const dates: string[] = [];
  await prepare(page, async (date) => {
    dates.push(date);
    return summary(date, 123.45);
  });
  await page.goto('/mobile');
  await expect(page.locator('.revenue-number')).toContainText('123');
  expect(dates).toContain('2026-10-02');
  await page.getByRole('button', { name: 'أمس', exact: true }).click();
  await expect.poll(() => dates.at(-1)).toBe('2026-10-01');
  await expect(page.locator('.revenue-number')).toContainText('123');
});

test('a forbidden inventory response preserves the successful sales summary and shows unavailable data', async ({
  page,
}) => {
  await prepare(page, async (date) => summary(date, 900), true);
  await page.goto('/mobile');
  await expect(page.locator('.revenue-number')).toContainText('900');
  await expect(
    page.getByText('بعض البيانات غير مصرح بها للجلسة الحالية؛ أعد تسجيل الدخول أو راجع الصلاحيات.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'المخزون', exact: true }).click();
  await expect(
    page.getByText('البيانات غير متاحة حاليًا. أعد المحاولة بعد التحقق من الاتصال والصلاحيات.'),
  ).toBeVisible();
});

test('a delayed response for today cannot replace the selected yesterday summary', async ({
  page,
}) => {
  let release!: () => void;
  let entered = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prepare(page, async (date) => {
    if (date === '2026-10-02') {
      entered = true;
      await held;
      return summary(date, 111);
    }
    return summary(date, 222);
  });
  try {
    await page.goto('/mobile');
    await expect.poll(() => entered).toBe(true);
    await page.getByRole('button', { name: 'أمس', exact: true }).click();
    await expect(page.locator('.revenue-number')).toContainText('222');
    const oldResponse = page.waitForResponse(
      (response) => new URL(response.url()).searchParams.get('date') === '2026-10-02',
    );
    release();
    await (await oldResponse).finished();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(page.locator('.revenue-number')).not.toContainText('111');
  } finally {
    release();
  }
});

test('mobile logout shows server failure, retains the session and succeeds on retry', async ({
  page,
}) => {
  await prepare(page, async (date) => summary(date, 900));
  let attempts = 0;
  await page.route('**/api/v1/auth/logout', (route) => {
    attempts++;
    return route.fulfill({
      status: attempts === 1 ? 500 : 200,
      json:
        attempts === 1
          ? { success: false, message: 'Isolated logout failure' }
          : { success: true, data: {} },
    });
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/mobile');
  await expect(page.locator('.revenue-number')).toContainText('900');
  await page.getByTitle('إعدادات النظام والحساب').click();
  await page.getByRole('button', { name: 'تسجيل الخروج من المنظومة', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('تعذر إتمام تسجيل الخروج');
  await expect(page).toHaveURL(/\/mobile/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('user') || 'null')?.id)).toBe(
    user.id,
  );
  await page.getByRole('button', { name: 'تسجيل الخروج من المنظومة', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
  expect(attempts).toBe(2);
});

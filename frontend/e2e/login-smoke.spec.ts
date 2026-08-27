import { test, expect } from '@playwright/test';

test('login page renders with credentials form', async ({ page }) => {
  await page.goto('/');
  // الحرس يوجّه غير المسجلين إلى /login
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
});

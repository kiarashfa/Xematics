import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`home page renders without accessibility violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('./');
    await expect(page).toHaveTitle(/Xematics/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Neural network figures');
    await expect(page.getByRole('img', { name: 'Neural network diagram' }).first()).toBeVisible();
    await expectAccessible(page);
  });
}

test('theme toggle switches and remembers the choice', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  const html = page.locator('html');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
});

test('unknown pages show the 404 page', async ({ page }) => {
  const response = await page.goto('./no-such-page/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'This page is not in the index.',
  );
  await expectAccessible(page);
});

test('fonts are self-hosted', async ({ page }) => {
  const hosts = new Set<string>();
  page.on('request', (request) => hosts.add(new URL(request.url()).host));
  await page.goto('./');
  await page.evaluate(() => document.fonts.ready);
  expect([...hosts]).toEqual([new URL(page.url()).host]);
});

import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

const GA = /googletagmanager\.com|google-analytics\.com/;

/** Records requests to Google and answers them locally, so tests never reach the network. */
async function watchGoogle(page: Page) {
  const urls: string[] = [];
  await page.route(GA, (route) => {
    urls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  });
  return urls;
}

test('nothing from Google loads before or after declining', async ({ page }) => {
  const google = await watchGoogle(page);
  await page.goto('./');
  const bar = page.getByRole('region', { name: 'Cookie consent' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Decline' }).click();
  await expect(bar).toBeHidden();
  await page.reload();
  await expect(bar).toBeHidden();
  expect(google).toEqual([]);
});

test('accepting loads analytics without the URL fragment', async ({ page }) => {
  const google = await watchGoogle(page);
  await page.goto('./#v1.private');
  await page
    .getByRole('region', { name: 'Cookie consent' })
    .getByRole('button', { name: 'Accept' })
    .click();
  await expect.poll(() => google.length).toBeGreaterThan(0);
  expect(google.every((url) => !url.includes('private'))).toBe(true);
  const location = await page.evaluate(() =>
    JSON.stringify((window as { dataLayer?: unknown }).dataLayer),
  );
  expect(location).toContain('"page_location"');
  expect(location).not.toContain('#');
});

test('cookie settings reopen the bar from the footer', async ({ page }) => {
  await watchGoogle(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Decline' }).click();
  await page.getByRole('button', { name: 'Cookie settings' }).click();
  await expect(page.getByRole('region', { name: 'Cookie consent' })).toBeVisible();
});

test('the About page explains privacy and reopens cookie settings', async ({ page }) => {
  await watchGoogle(page);
  await page.goto('./about/#privacy');
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
  await page.locator('#privacy + p').getByRole('button', { name: 'Cookie settings' }).click();
  await expect(page.getByRole('region', { name: 'Cookie consent' })).toBeVisible();
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => ({
      rule: v.id,
      targets: v.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
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

const PAGES = [
  ['./examples/', 'Ten networks to start from'],
  ['./guide/', 'Syntax and export guide'],
  ['./about/', 'About Xematics'],
  ['./credits/', 'Built on the work of others'],
] as const;

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [path, heading] of PAGES) {
    test(`${path} is accessible and within its security policy (${colorScheme})`, async ({
      page,
    }) => {
      const violations: string[] = [];
      page.on('console', (m) => {
        if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
      });
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expectAccessible(page);
      expect(violations).toEqual([]);
    });
  }
}

test('every example opens in the editor as shown', async ({ page }) => {
  await page.goto('./examples/');
  // The example's title is visually hidden text after the visible label.
  const links = page.getByRole('link', { name: /^Open in editor\s*:/ });
  await expect(links).toHaveCount(10);
  await page.getByRole('link', { name: /^Open in editor\s*: Iris classifier$/ }).click();
  await expect(page.getByRole('img', { name: 'Iris classifier' })).toBeVisible();
});

test('pages carry link-preview metadata and the preview image exists', async ({
  page,
  request,
}) => {
  await page.goto('./guide/');
  const image = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(image).toMatch(/\/og\.png$/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'Syntax and export guide · Xematics',
  );
  const png = await request.get('./og.png');
  expect(png.headers()['content-type']).toBe('image/png');
  expect((await png.body()).readUInt32BE(16)).toBe(1200);
});

test('masthead shows today as a dateline; footer shows the copyright years', async ({ page }) => {
  await page.goto('./');
  const today = page.locator('time[data-today]');
  await expect(today).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
  await expect(today).toHaveText(/\d{4}$/);
  const year = new Date().getFullYear();
  await expect(page.getByRole('contentinfo')).toContainText(
    year > 2026 ? `© 2026–${year} Kiarash Farajzadehahary` : '© 2026 Kiarash Farajzadehahary',
  );
});

test('guide contents mark the section being read', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The contents column is a sticky sidebar on wide screens');
  await page.goto('./guide/');
  const toc = page.getByRole('navigation', { name: 'Contents' });
  await expect(toc.getByRole('link', { name: 'Shorthand' })).toHaveAttribute(
    'aria-current',
    'location',
  );
  // Following a contents link puts its heading at the top, as a reader would.
  await toc.getByRole('link', { name: 'Exports' }).click();
  await expect(toc.getByRole('link', { name: 'Exports' })).toHaveAttribute(
    'aria-current',
    'location',
  );
  await expect(toc.locator('[aria-current]')).toHaveCount(1);
});

test('credits stay short and link the full notices', async ({ page, request }) => {
  await page.goto('./credits/');
  await expect(page.getByRole('table')).toHaveCount(3);
  await expect(page.getByText('Permission is hereby granted')).toHaveCount(0);
  const notices = await request.get('./third-party-notices.txt');
  expect(await notices.text()).toContain('Permission is hereby granted');
});

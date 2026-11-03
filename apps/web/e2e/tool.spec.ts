import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const GOLDEN = new URL('../../../packages/core/test/golden/', import.meta.url);
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function openEditor(page: Page) {
  await page.goto('./tool/');
  // Phones start on the document list.
  if ((page.viewportSize()?.width ?? 1280) <= 760) {
    await page
      .getByRole('button', { name: /MNIST classifier/ })
      .first()
      .click();
  }
  // The preview is an SVG labelled by the diagram title once fonts and HarfBuzz are ready.
  await expect(page.getByRole('img', { name: 'MNIST classifier' })).toBeVisible();
}

const source = (page: Page) => page.getByRole('textbox', { name: 'Source' });

test('editor renders the example and has no accessibility violations', async ({ page }) => {
  await openEditor(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => ({
      rule: v.id,
      targets: v.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
});

test.describe('desktop editor', () => {
  test.skip(({ isMobile }) => isMobile, 'Ribbon layout is desktop only');

  test('exported SVG is byte-identical to the Node golden files', async ({ page }) => {
    await openEditor(page);
    await source(page).fill('784-16-16-10');
    await expect(page.getByRole('img', { name: 'Neural network diagram' })).toBeVisible();

    const exportSvg = async () => {
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export SVG' }).click();
      const file = await (await download).path();
      return readFile(file, 'utf8');
    };
    expect(await exportSvg()).toBe(await readFile(new URL('mnist.svg', GOLDEN), 'utf8'));
    await page.getByRole('switch', { name: 'Editable text' }).check();
    expect(await exportSvg()).toBe(await readFile(new URL('mnist.live.svg', GOLDEN), 'utf8'));
  });

  test('shorthand bar changes sizes and keeps names', async ({ page }) => {
    await openEditor(page);
    const bar = page.getByRole('textbox', { name: /Layer sizes/ });
    await bar.fill('784-32:relu-16:relu-8-10');
    await bar.press('Enter');
    await expect(source(page)).toHaveValue(/units: 32, activation: relu/);
    await expect(source(page)).toHaveValue(/- \{ units: 10, name: Digits \}/);
    await expect(page.getByRole('navigation', { name: 'Layers' })).toContainText('Digits');
  });

  test('select, rename and undo', async ({ page }) => {
    await openEditor(page);
    await page
      .getByRole('navigation', { name: 'Layers' })
      .getByRole('button', { name: /Hidden 1/ })
      .click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Encoder');
    await expect(source(page)).toHaveValue(/units: 16, activation: relu, name: Encoder/);
    await page.getByRole('button', { name: 'Undo' }).first().click();
    await expect(source(page)).not.toHaveValue(/Encoder/);
    await page.getByRole('button', { name: 'Redo' }).first().click();
    await expect(source(page)).toHaveValue(/Encoder/);
  });

  test('ribbon style controls write minimal YAML', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('switch', { name: 'Neuron counts' }).uncheck();
    await expect(source(page)).toHaveValue(/style:\n {2}labels: \{ sizes: false \}/);
    await page.getByRole('switch', { name: 'Neuron counts' }).check();
    await expect(source(page)).not.toHaveValue(/style:/);
  });

  test('preset gallery switches the look and writes only the preset', async ({ page }) => {
    await openEditor(page);
    const style = page.getByRole('group', { name: 'Preset' });
    await style.getByRole('button', { name: 'Layer boxes' }).click();
    await expect(style.getByRole('button', { name: 'Layer boxes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(source(page)).toHaveValue(/style:\n {2}preset: boxes/);
    await expect(page.locator('#pv-box-0')).toBeAttached();
    await expect(page.locator('footer.status')).toContainText('Layer boxes');
    await style.getByRole('button', { name: 'Classic' }).click();
    await expect(source(page)).not.toHaveValue(/style:/);
    await expect(page.locator('#pv-node-1-0')).toBeAttached();
  });

  test('layer boxes export is byte-identical to the Node golden file', async ({ page }) => {
    await openEditor(page);
    await source(page).fill(
      await readFile(
        new URL('../../../packages/core/test/fixtures/boxes.yaml', import.meta.url),
        'utf8',
      ),
    );
    await expect(page.locator('#pv-box-3')).toBeAttached();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export SVG' }).click();
    const file = await (await download).path();
    expect(await readFile(file, 'utf8')).toBe(await readFile(new URL('boxes.svg', GOLDEN), 'utf8'));
  });

  test('errors show their position and keep the last figure', async ({ page }) => {
    await openEditor(page);
    await source(page).fill('784-16x');
    await expect(page.getByRole('button', { name: '1 error' })).toBeVisible();
    await expect(page.getByRole('button', { name: /1:7 Unexpected 'x' after 16/ })).toBeVisible();
    await expect(page.getByRole('img', { name: 'MNIST classifier' })).toBeVisible();
  });
});

test('editor loads only from its own origin', async ({ page }) => {
  const hosts = new Set<string>();
  page.on('request', (request) => hosts.add(new URL(request.url()).host));
  await openEditor(page);
  expect([...hosts]).toEqual([new URL(page.url()).host]);
});

test.describe('saving and sharing', () => {
  test.skip(({ isMobile }) => isMobile, 'Ribbon layout is desktop only');

  test('work is autosaved in the browser and survives a reload', async ({ page }) => {
    await openEditor(page);
    await source(page).fill('3-5-2');
    await expect(page.getByText('Saved in this browser')).toBeVisible();
    await page.reload();
    await expect(source(page)).toHaveValue('3-5-2');
  });

  test('a copied share link opens the same source in a fresh browser', async ({
    page,
    context,
    browser,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openEditor(page);
    await source(page).fill('title: Shared σ net\nlayers: [4, 3, 2]\n');
    await page.getByRole('button', { name: 'Copy share link' }).click();
    await expect(page.getByText('Link copied.')).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\/tool\/#v1\.[A-Za-z0-9_-]+$/);

    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await other.goto(link);
    await expect(other.getByRole('img', { name: 'Shared σ net' })).toBeVisible();
    await expect(source(other)).toHaveValue('title: Shared σ net\nlayers: [4, 3, 2]\n');
    await expect(other).toHaveURL(/\/tool\/$/);
    await fresh.close();
  });

  test('a saved workspace keeps every document and opens elsewhere', async ({ page, browser }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'File' }).click();
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(
      page.getByRole('combobox', { name: 'Open document' }).locator('option'),
    ).toHaveCount(2);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save workspace' }).click();
    const file = await (await download).path();

    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await openEditor(other);
    other.on('dialog', (dialog) => dialog.accept());
    await other.getByRole('tab', { name: 'File' }).click();
    await other.locator('input[type="file"][accept=".json"]').setInputFiles(file);
    await expect(
      other.getByRole('combobox', { name: 'Open document' }).locator('option'),
    ).toHaveCount(2);
    await expect(source(other)).toHaveValue('4-8-3');
    await fresh.close();
  });
});

test.describe('text and math', () => {
  test.skip(({ isMobile }) => isMobile, 'Ribbon layout is desktop only');
  const FIXTURES = new URL('../../../packages/core/test/fixtures/', import.meta.url);

  async function exportSvg(page: Page) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export SVG' }).click();
    return readFile(await (await download).path(), 'utf8');
  }

  // Fonts (Vazirmatn, Hebrew, CJK slices) and MathJax load on demand in the browser too, and the
  // result must match Node byte for byte.
  for (const [name, file, live] of [
    ['persian', 'persian.yaml', true],
    ['bidi', 'bidi.yaml', false],
    ['cjk', 'cjk.yaml', false],
    ['math', 'math.yaml', true],
    ['node-labels', 'node-labels.yaml', false],
    ['rtl-flow', 'rtl-flow.yaml', false],
    ['rtl-boxes', 'rtl-boxes.yaml', false],
  ] as const) {
    test(`${name} export is byte-identical to the Node golden file`, async ({ page }) => {
      await openEditor(page);
      await source(page).fill(await readFile(new URL(file, FIXTURES), 'utf8'));
      expect(await exportSvg(page)).toBe(await readFile(new URL(`${name}.svg`, GOLDEN), 'utf8'));
      if (live) {
        await page.getByRole('switch', { name: 'Editable text' }).check();
        expect(await exportSvg(page)).toBe(
          await readFile(new URL(`${name}.live.svg`, GOLDEN), 'utf8'),
        );
      }
    });
  }

  test('the preview loads fonts and math by itself, without an export', async ({ page }) => {
    await openEditor(page);
    await source(page).fill(
      'layers:\n  - { units: 2, name: سلام }\n  - { units: 2, name: "$h_1$" }\n',
    );
    await expect(page.locator('#pv-name-1-0')).toBeAttached();
    await expect(page.getByText(/cannot draw yet/)).toHaveCount(0);
  });

  test('right to left flow and node labels write minimal YAML', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('switch', { name: 'Right to left' }).check();
    await expect(source(page)).toHaveValue(/style:\n {2}direction: rtl/);
    await page
      .getByRole('navigation', { name: 'Layers' })
      .getByRole('button', { name: /Pixels/ })
      .click();
    await page.getByRole('textbox', { name: 'Node labels' }).fill('$x_{i}$');
    await expect(source(page)).toHaveValue(
      /nodeLabel: \$x_\{i\}\$|nodeLabel: "\$x_\{i\}\$"|nodeLabel: '\$x_\{i\}\$'/,
    );
    await expect(page.locator('#pv-nodelabel-0-0')).toBeAttached();
    await page.getByRole('switch', { name: 'Right to left' }).uncheck();
    await expect(source(page)).not.toHaveValue(/direction/);
  });
});

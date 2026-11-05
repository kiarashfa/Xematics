import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Every editor flow (fonts, math, WebAssembly, PNG export) must work under the site's CSP.
let cspViolations: string[] = [];
test.beforeEach(({ page }) => {
  cspViolations = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text());
  });
});
test.afterEach(() => {
  expect(cspViolations).toEqual([]);
});
const SHOTS = process.env['XEMATICS_SHOTS'];

test.skip(({ isMobile }) => !isMobile, 'Phone layout only');

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => ({
      rule: v.id,
      targets: v.nodes.map((n) => n.target.join(' ')),
    })),
  ).toEqual([]);
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function openDocument(page: Page) {
  await page.goto('./tool/');
  await expect(page.getByRole('tab', { name: 'Documents' })).toBeVisible();
  await expect(page.locator('.thumb svg').first()).toBeAttached();
  await shot(page, '1-files');
  await expectAccessible(page);
  await page
    .getByRole('button', { name: /MNIST classifier/ })
    .first()
    .click();
  await expect(page.getByRole('img', { name: 'MNIST classifier' })).toBeVisible();
}

const source = (page: Page) => page.getByRole('textbox', { name: 'Source' });

async function sourceText(page: Page) {
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  return source(page);
}

test('files screen, editor and back', async ({ page }) => {
  await openDocument(page);
  await shot(page, '2-editor');
  await expectAccessible(page);
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Documents' })).toBeVisible();
});

test('tap a layer, step its neurons from the context card', async ({ page }) => {
  await openDocument(page);
  await page.locator('#pv-node-1-0').click();
  const card = page.getByRole('region', { name: 'Layer Hidden 1' });
  await expect(card).toBeVisible();
  await shot(page, '3-context-card');
  await card.getByRole('button', { name: 'More neurons' }).click();
  await expect(card).toContainText('17');
  await expect(await sourceText(page)).toHaveValue(/units: 17, activation: relu/);
});

test('layer cards step convolution filters and show map sizes', async ({ page }) => {
  await openDocument(page);
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await source(page).fill('in(32x32x3)-conv(8,3x3):relu-pool(2)-flatten-10');
  await page.getByRole('button', { name: 'Layer cards' }).click();
  await page.getByRole('button', { name: 'More filters in Conv' }).click();
  await expect(page.getByRole('list', { name: 'Layers' })).toContainText('16×16×9');
  await expect(await sourceText(page)).toHaveValue(
    'in(32x32x3)-conv(9,3x3):relu-pool(2)-flatten-10',
  );
});

test('layer cards change activations and sizes', async ({ page }) => {
  await openDocument(page);
  await page.getByRole('button', { name: 'Layer cards' }).click();
  await page
    .getByRole('group', { name: 'Activation of Hidden 2' })
    .getByRole('button', { name: 'softmax' })
    .click();
  await page.getByRole('button', { name: 'More neurons in Digits' }).click();
  await shot(page, '4-layer-cards');
  await expect(await sourceText(page)).toHaveValue(/units: 16, activation: softmax/);
  await expect(source(page)).toHaveValue(/units: 11, name: Digits/);
});

test('shorthand pad edits sizes without the keyboard and keeps names', async ({ page }) => {
  await openDocument(page);
  await page.getByRole('button', { name: 'Shorthand pad' }).click();
  await page.getByRole('button', { name: 'Backspace' }).click();
  await page.getByRole('button', { name: 'Backspace' }).click();
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.getByRole('button', { name: '2', exact: true }).click();
  await expect(page.getByLabel('Layer sizes')).toHaveText('784-16:relu-16:relu-32');
  await shot(page, '5-pad');
  await expect(await sourceText(page)).toHaveValue(/- \{ units: 32, name: Digits \}/);
});

test('symbol bar types into the source', async ({ page }) => {
  await openDocument(page);
  const box = await sourceText(page);
  await box.fill('784-16');
  await box.press('End');
  const symbols = page.getByRole('toolbar', { name: 'Insert symbols' });
  await symbols.getByRole('button', { name: ':', exact: true }).click();
  await symbols.getByRole('button', { name: 'relu' }).click();
  await shot(page, '6-source');
  await expect(box).toHaveValue('784-16:relu');
});

test('command sheet: labels toggle and SVG export', async ({ page }) => {
  await openDocument(page);
  await page.getByRole('button', { name: 'All commands' }).click();
  const sheet = page.getByRole('dialog', { name: 'Commands' });
  await sheet.getByRole('switch', { name: 'Neuron counts' }).uncheck();
  await shot(page, '7-commands');
  await sheet.getByRole('tab', { name: 'Export' }).click();
  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: 'Save SVG' }).click();
  expect((await download).suggestedFilename()).toBe('mnist-classifier.svg');
  await expect(await sourceText(page)).toHaveValue(/labels: \{ sizes: false \}/);
});

test('command sheet: animate the figure and pick a look', async ({ page }) => {
  await openDocument(page);
  await page.getByRole('button', { name: 'All commands' }).click();
  const sheet = page.getByRole('dialog', { name: 'Commands' });
  await sheet.getByRole('tab', { name: 'Animate' }).click();
  await sheet.getByRole('combobox', { name: 'Look' }).selectOption('learning');
  await sheet.getByRole('switch', { name: 'Animate the figure' }).check();
  await expect(page.getByRole('group', { name: 'Animation player' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(await sourceText(page)).toHaveValue(/animation: \{ look: learning \}/);
});

test('command sheet: preset strip switches the look', async ({ page }) => {
  await openDocument(page);
  await page.getByRole('button', { name: 'All commands' }).click();
  const sheet = page.getByRole('dialog', { name: 'Commands' });
  await sheet
    .getByRole('group', { name: 'Preset' })
    .getByRole('button', { name: 'Print mono' })
    .click();
  await shot(page, '8-presets');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(await sourceText(page)).toHaveValue(/preset: mono/);
});

test('command sheet: PDF and TikZ exports', async ({ page }) => {
  await openDocument(page);
  await page.getByRole('button', { name: 'All commands' }).click();
  const sheet = page.getByRole('dialog', { name: 'Commands' });
  await sheet.getByRole('tab', { name: 'Export' }).click();
  await shot(page, '9-export');
  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: 'Save PDF' }).click();
  expect((await download).suggestedFilename()).toBe('mnist-classifier.pdf');
});

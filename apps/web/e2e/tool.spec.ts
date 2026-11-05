import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const GOLDEN = new URL('../../../packages/core/test/golden/', import.meta.url);
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

/** Opens the ribbon's Export tab and clicks one of its buttons. */
async function exportButton(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Export' }).click();
  await page.getByRole('button', { name, exact: true }).click();
}

/** Switches SVG export to editable text (Export tab, Options group). */
async function setEditableText(page: Page) {
  await page.getByRole('tab', { name: 'Export' }).click();
  await page.getByRole('switch', { name: 'Editable SVG text' }).check();
}

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

  test('the editor can be closed from the title bar and the File tab', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'File' }).click();
    await expect(page.getByRole('link', { name: 'Close editor' })).toBeVisible();
    await page.getByRole('link', { name: 'Close the editor' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Neural network figures');
  });

  test('exported SVG is byte-identical to the Node golden files', async ({ page }) => {
    await openEditor(page);
    await source(page).fill('784-16-16-10');
    await expect(page.getByRole('img', { name: 'Neural network diagram' })).toBeVisible();

    const exportSvg = async () => {
      const download = page.waitForEvent('download');
      await exportButton(page, 'Export SVG');
      const file = await (await download).path();
      return readFile(file, 'utf8');
    };
    expect(await exportSvg()).toBe(await readFile(new URL('mnist.svg', GOLDEN), 'utf8'));
    await setEditableText(page);
    expect(await exportSvg()).toBe(await readFile(new URL('mnist.live.svg', GOLDEN), 'utf8'));
  });

  test('convolutional networks export the same bytes as the Node golden', async ({ page }) => {
    await openEditor(page);
    const text = (await readFile(new URL('../fixtures/cnn-small.txt', GOLDEN), 'utf8')).trim();
    await source(page).fill(text);
    await expect(page.getByRole('img', { name: 'Neural network diagram' })).toBeVisible();
    await expect(page.locator('#pv-sheet-1-6')).toBeAttached();
    await expect(page.locator('#pv-window-1')).toBeAttached();
    const download = page.waitForEvent('download');
    await exportButton(page, 'Export SVG');
    const file = await (await download).path();
    expect(await readFile(file, 'utf8')).toBe(
      await readFile(new URL('cnn-small.svg', GOLDEN), 'utf8'),
    );
  });

  test('format pane edits convolution layers and changes layer types', async ({ page }) => {
    await openEditor(page);
    await source(page).fill('in(28x28x1)-conv(8,3x3):relu-pool(2)-flatten-10');
    const nav = page.getByRole('navigation', { name: 'Layers' });
    await expect(nav).toContainText('28×28×8');
    await nav.getByRole('button', { name: /Conv/ }).click();
    await page.getByRole('spinbutton', { name: 'Filters' }).fill('12');
    await page.getByRole('spinbutton', { name: 'Filters' }).press('Enter');
    await page.getByRole('spinbutton', { name: 'Stride height' }).fill('2');
    await page.getByRole('spinbutton', { name: 'Stride height' }).press('Enter');
    await page.getByRole('spinbutton', { name: 'Stride width' }).fill('2');
    await page.getByRole('spinbutton', { name: 'Stride width' }).press('Enter');
    await expect(source(page)).toHaveValue('in(28x28x1)-conv(12,3x3,s2):relu-pool(2)-flatten-10');
    await expect(page.getByText('Output 14×14×12')).toBeVisible();
    await nav.getByRole('button', { name: /Pool/ }).click();
    await page.getByRole('combobox', { name: 'Layer type' }).selectOption('conv');
    await expect(source(page)).toHaveValue(
      'in(28x28x1)-conv(12,3x3,s2):relu-conv(16,3x3)-flatten-10',
    );
    await page.getByRole('switch', { name: 'Operations' }).uncheck();
    await expect(source(page)).toHaveValue(/labels: { ops: false }/);
    await expect(page.locator('#pv-op-1')).not.toBeAttached();
  });

  test('Animate tab plays the preview and exports the same bytes as the Node golden', async ({
    page,
  }) => {
    await openEditor(page);
    const mlp = [
      'layers:',
      '  - { units: 3, name: Input }',
      '  - { units: 5, activation: relu }',
      '  - { units: 4, activation: relu }',
      '  - { units: 2, name: Output }',
      'animation: { look: training }',
    ].join('\n');
    await source(page).fill(`${mlp}\n`);
    await page.getByRole('tab', { name: 'Animate' }).click();
    await expect(page.getByRole('group', { name: 'Animation player' })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelector('.paper svg')!.getAnimations({ subtree: true }).length,
        ),
      )
      .toBeGreaterThan(50);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.getByRole('switch', { name: 'Hidden layers stay gray' }).check();
    await expect(source(page)).toHaveValue(/animation: \{ look: training, grayHidden: true \}/);
    await page.getByRole('switch', { name: 'Hidden layers stay gray' }).uncheck();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Animated SVG' }).click();
    const file = await (await download).path();
    expect(await readFile(file, 'utf8')).toBe(
      await readFile(new URL('anim-training.svg', GOLDEN), 'utf8'),
    );
    // Leaving the tab stops the animation and shows the still figure.
    await page.getByRole('tab', { name: 'Home' }).click();
    await expect(page.getByRole('group', { name: 'Animation player' })).toHaveCount(0);
  });

  test('animation exports a looping GIF', async ({ page }) => {
    await openEditor(page);
    await source(page).fill('layers: [3, 4, 2]\nanimation: { look: pulse, speed: 4 }\n');
    await page.getByRole('tab', { name: 'Animate' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'GIF', exact: true }).click();
    const gif = await (await download).path();
    const bytes = await readFile(gif);
    expect(bytes.subarray(0, 6).toString('ascii')).toBe('GIF89a');
    expect(bytes.includes(Buffer.from('NETSCAPE2.0'))).toBe(true);
    expect(bytes.at(-1)).toBe(0x3b);
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
    await exportButton(page, 'Export SVG');
    const file = await (await download).path();
    expect(await readFile(file, 'utf8')).toBe(await readFile(new URL('boxes.svg', GOLDEN), 'utf8'));
  });

  test('shorthand repeats layers and the bar keeps the repeat', async ({ page }) => {
    await openEditor(page);
    await source(page).fill('784-128*3-10');
    const nav = page.getByRole('navigation', { name: 'Layers' });
    await expect(nav.getByRole('button', { name: /Hidden 3/ })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Layer sizes/ })).toHaveValue('784-128*3-10');
    await nav.getByRole('button', { name: /Hidden 3/ }).click();
    await page.getByRole('spinbutton', { name: 'Neurons' }).fill('64');
    await page.getByRole('spinbutton', { name: 'Neurons' }).press('Enter');
    await expect(source(page)).toHaveValue('784-128*2-64-10');
  });

  test('keyboard shortcuts edit layers, save and undo', async ({ page }) => {
    await openEditor(page);
    await source(page).fill('3-5-2');
    const nav = page.getByRole('navigation', { name: 'Layers' });
    await nav.getByRole('button', { name: /^Hidden/ }).click();
    await page.keyboard.press('Control+Enter');
    await expect(source(page)).toHaveValue(/^3-5-\d+-2$/);
    await page.keyboard.press('Delete');
    await expect(source(page)).toHaveValue('3-5-2');
    // The selection moved to the output layer.
    await page.keyboard.press('Alt+ArrowUp');
    await expect(source(page)).toHaveValue('3-2-5');
    await page.keyboard.press('Control+z');
    await expect(source(page)).toHaveValue('3-5-2');
    await page.keyboard.press('Control+y');
    await expect(source(page)).toHaveValue('3-2-5');
    await page.keyboard.press('Escape');
    await expect(nav.getByRole('button', { name: /Diagram|Neural/ }).first()).toHaveAttribute(
      'aria-current',
      'true',
    );
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Every change is also saved by itself')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.keyboard.press('Control+e');
    expect((await download).suggestedFilename()).toMatch(/\.svg$/);
  });

  test('errors show their position and keep the last figure', async ({ page }) => {
    await openEditor(page);
    await source(page).fill('784-16x');
    await expect(page.getByRole('button', { name: '1 error' })).toBeVisible();
    await expect(page.getByRole('button', { name: /1:7 Unexpected 'x' after 16/ })).toBeVisible();
    await expect(page.getByRole('img', { name: 'MNIST classifier' })).toBeVisible();
  });
});

test('the YAML reader loads only when a source needs it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Ribbon layout is desktop only');
  // The first visit opens the MNIST example (YAML), so the reader's chunk shows up here.
  const yamlChunks = new Set<string>();
  page.on('response', async (response) => {
    if (!response.url().endsWith('.js')) return;
    if ((await response.text().catch(() => '')).includes('YAMLParseError'))
      yamlChunks.add(response.url());
  });
  await openEditor(page);
  await expect.poll(() => yamlChunks.size).toBeGreaterThan(0);
  await source(page).fill('784-128*2-10');
  await expect(page.getByText('Saved in this browser')).toBeVisible();
  // After a reload the open document is shorthand: nothing needs the YAML reader.
  let yamlLoaded = false;
  page.on('request', (request) => {
    if (yamlChunks.has(request.url())) yamlLoaded = true;
  });
  await page.reload();
  await expect(page.getByRole('img', { name: 'Neural network diagram' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Layer sizes/ })).toHaveValue('784-128*2-10');
  expect(yamlLoaded).toBe(false);
  // A style change turns shorthand into YAML, which loads the reader first.
  await page
    .getByRole('group', { name: 'Preset' })
    .getByRole('button', { name: 'Layer boxes' })
    .click();
  await expect(source(page)).toHaveValue(/preset: boxes/);
  await expect(page.locator('#pv-box-0')).toBeAttached();
  expect(yamlLoaded).toBe(true);
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

  test('a save file keeps every document and merges elsewhere', async ({ page, browser }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'File' }).click();
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(
      page.getByRole('combobox', { name: 'Open document' }).locator('option'),
    ).toHaveCount(2);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download save file' }).click();
    const file = await (await download).path();

    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await openEditor(other);
    await other.getByRole('tab', { name: 'File' }).click();
    await other.locator('input[type="file"][accept=".json"]').setInputFiles(file);
    // Merged with the document already there: nothing in either browser is lost.
    await expect(
      other.getByRole('combobox', { name: 'Open document' }).locator('option'),
    ).toHaveCount(3);
    await expect(source(other)).toHaveValue('4-8-3');
    await fresh.close();
  });
});

test.describe('text and math', () => {
  test.skip(({ isMobile }) => isMobile, 'Ribbon layout is desktop only');
  const FIXTURES = new URL('../../../packages/core/test/fixtures/', import.meta.url);

  async function exportSvg(page: Page) {
    const download = page.waitForEvent('download');
    await exportButton(page, 'Export SVG');
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
        await setEditableText(page);
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

test.describe('exports', () => {
  test.skip(({ isMobile }) => isMobile, 'Ribbon layout is desktop only');

  async function download(page: Page, button: string) {
    const file = page.waitForEvent('download');
    await exportButton(page, button);
    const done = await file;
    return { name: done.suggestedFilename(), bytes: await readFile(await done.path()) };
  }

  test('the Export tab sits between View and Help and is accessible', async ({ page }) => {
    await openEditor(page);
    const tabs = await page
      .getByRole('tablist', { name: 'Ribbon' })
      .getByRole('tab')
      .allInnerTexts();
    expect(tabs).toEqual(['File', 'Home', 'View', 'Animate', 'Export', 'Help']);
    await page.getByRole('tab', { name: 'Export' }).click();
    for (const group of ['Images', 'Documents', 'Share', 'Export options']) {
      await expect(page.getByRole('group', { name: group })).toBeVisible();
    }
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    // The Animate tab and its player are accessible too.
    await page.getByRole('tab', { name: 'Animate' }).click();
    await expect(page.getByRole('group', { name: 'Animation player' })).toBeVisible();
    const animate = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(animate.violations.map((v) => v.id)).toEqual([]);
  });

  test('PDF and TikZ match the Node golden files', async ({ page }) => {
    await openEditor(page);
    await source(page).fill('784-16-16-10');
    const pdf = await download(page, 'Export PDF');
    expect(pdf.name).toBe('diagram.pdf');
    expect(pdf.bytes.toString('latin1')).toBe(
      await readFile(new URL('mnist.pdf', GOLDEN), 'latin1'),
    );
    const tex = await download(page, 'Export TikZ');
    expect(tex.bytes.toString('utf8')).toBe(await readFile(new URL('mnist.tex', GOLDEN), 'utf8'));
  });

  test('PNG is 300 dpi by default, with the resolution saved in the file', async ({ page }) => {
    await openEditor(page);
    await source(page).fill('784-16-16-10');
    const png = await download(page, 'Export PNG');
    expect(png.bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
    // The figure is 411.07 x 410.25 px at 96 dpi.
    expect([png.bytes.readUInt32BE(16), png.bytes.readUInt32BE(20)]).toEqual([1285, 1282]);
    const phys = png.bytes.indexOf('pHYs');
    expect(png.bytes.readUInt32BE(phys + 4)).toBe(11811);
  });

  test('model JSON opens again as the same diagram', async ({ page }) => {
    await openEditor(page);
    const json = await download(page, 'Model file');
    expect(json.name).toBe('mnist-classifier.json');
    const model = JSON.parse(json.bytes.toString('utf8'));
    expect(model).toMatchObject({ version: 1, title: 'MNIST classifier' });
    expect(model.layers).toHaveLength(4);
  });

  test('ribbon options change the PNG size and the TikZ form', async ({ page }) => {
    await openEditor(page);
    await source(page).fill('784-16-16-10');
    await page.getByRole('tab', { name: 'Export' }).click();
    await page.getByRole('combobox', { name: 'PNG size' }).selectOption({ label: '2x' });
    await page.getByRole('combobox', { name: 'TikZ' }).selectOption({ label: 'tikzpicture only' });
    const png = await download(page, 'Export PNG');
    expect(png.bytes.readUInt32BE(16)).toBe(Math.round(411.07 * 2));
    const tex = await download(page, 'Export TikZ');
    expect(tex.bytes.toString('utf8')).not.toContain('\\documentclass');
  });

  test('embed code offers Markdown, HTML and a data URL', async ({ page }) => {
    await openEditor(page);
    await exportButton(page, 'Embed code');
    const dialog = page.getByRole('dialog', { name: 'Embed code' });
    await expect(dialog.getByRole('textbox', { name: 'Markdown' })).toHaveValue(
      /^!\[Fully connected neural network.*\]\(data:image\/svg\+xml;base64,/,
    );
    await expect(dialog.getByRole('textbox', { name: 'HTML' })).toHaveValue(/^<img src="data:/);
    const data = await dialog.getByRole('textbox', { name: 'Data URL' }).inputValue();
    const svg = Buffer.from(data.split(',')[1]!, 'base64').toString('utf8');
    expect(svg).toContain('<title id="xm-title">MNIST classifier</title>');
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

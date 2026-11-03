// Generates the brand assets from fonts, so the wordmark is exact outlines (no web font needed):
//   apps/web/src/components/Wordmark.astro   inline SVG, themed with currentColor and --mark-accent
//   apps/web/public/favicon.svg              the woven X mark, light and dark aware
// Run: node scripts/build-brand.ts            (or --variants to write a comparison page for review)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createTextEngine, type TextEngine } from '../packages/core/src/index.ts';

const require = createRequire(import.meta.url);
const FAMILY = 'EB Garamond';
const UNITS = 100; // font size in SVG user units; the SVG scales with CSS

interface Options {
  weight: 400 | 500 | 600;
  /** Mark height relative to the font's cap height. */
  markScale: number;
  /** Edge stroke relative to the font's cap height. */
  strokeRatio: number;
}

/** Chosen settings for the published assets. */
export const BRAND: Options = { weight: 600, markScale: 0.8, strokeRatio: 0.075 };

const f = (n: number) => String(Math.round(n * 100) / 100);

async function loadEngine(): Promise<TextEngine> {
  const faces = await Promise.all(
    ([400, 500, 600] as const).map(async (weight) => ({
      family: FAMILY,
      weight,
      data: new Uint8Array(
        await readFile(
          require.resolve(`@fontsource/eb-garamond/files/eb-garamond-latin-${weight}-normal.woff`),
        ),
      ),
    })),
  );
  return createTextEngine(faces);
}

/** Ink bounds of an outline path (coordinates only; good enough for glyph boxes). */
function bounds(d: string) {
  const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

type Pt = [number, number];
/** Splits a cubic Bezier at t (de Casteljau) and returns the [0, t] and [t, 1] halves. */
function split(p: [Pt, Pt, Pt, Pt], t: number): [[Pt, Pt, Pt, Pt], [Pt, Pt, Pt, Pt]] {
  const lerp = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const [p0, p1, p2, p3] = p;
  const a = lerp(p0, p1),
    b = lerp(p1, p2),
    c = lerp(p2, p3);
  const d = lerp(a, b),
    e = lerp(b, c),
    m = lerp(d, e);
  return [
    [p0, a, d, m],
    [m, e, c, p3],
  ];
}
const cubic = (c: [Pt, Pt, Pt, Pt]) =>
  `M${f(c[0][0])} ${f(c[0][1])}C${c
    .slice(1)
    .map((p) => `${f(p[0])} ${f(p[1])}`)
    .join(' ')}`;

/**
 * The woven X: two gently curved edges between four nodes. The rising edge passes over the
 * falling one; the gap is cut out of the path, so it works on any background.
 */
function wovenMark(height: number, width: number, stroke: number) {
  const r = stroke * 1.15;
  const [x0, x1] = [r, width - r];
  const [yTop, yBottom] = [-(height - r), -r];
  const dx = x1 - x0,
    dy = yBottom - yTop;
  const falling: [Pt, Pt, Pt, Pt] = [
    [x0, yTop],
    [x0 + 0.43 * dx, yTop + 0.28 * dy],
    [x0 + 0.57 * dx, yTop + 0.72 * dy],
    [x1, yBottom],
  ];
  const rising: [Pt, Pt, Pt, Pt] = [
    [x0, yBottom],
    [x0 + 0.43 * dx, yBottom - 0.28 * dy],
    [x0 + 0.57 * dx, yBottom - 0.72 * dy],
    [x1, yTop],
  ];
  const gap = Math.min(0.2, (stroke * 1.4) / Math.hypot(dx, dy));
  const [before] = split(falling, 0.5 - gap);
  const [, after] = split(falling, 0.5 + gap);
  return {
    lines: [cubic(before), cubic(after), cubic(rising)],
    inputs: [
      [x0, yTop],
      [x0, yBottom],
    ] as Pt[],
    outputs: [
      [x1, yTop],
      [x1, yBottom],
    ] as Pt[],
    r,
  };
}

async function wordmark(engine: TextEngine, o: Options) {
  const font = { family: FAMILY, weight: o.weight };
  const capHeight = -bounds(engine.outline(engine.shape('E', font, UNITS), 0, 0)).minY;
  const xGlyph = engine.shape('X', font, UNITS);
  const xInk = bounds(engine.outline(xGlyph, 0, 0));
  const height = capHeight * o.markScale;
  const width = (xInk.maxX - xInk.minX) * 0.86 * o.markScale;
  const stroke = capHeight * o.strokeRatio;
  const mark = wovenMark(height, width, stroke);
  // Same spacing the font gives a real "Xe": the X's right side bearing.
  const textX = width + (xGlyph.width - xInk.maxX);
  const rest = engine.shape('ematics', font, UNITS);
  const text = engine.outline(rest, textX, 0);
  const tb = bounds(text);
  const top = Math.min(-height, tb.minY) - 1;
  const bottom = Math.max(0, tb.maxY) + 1;
  const viewWidth = textX + rest.width;
  return {
    mark,
    text,
    stroke,
    viewBox: `0 ${f(top)} ${f(viewWidth)} ${f(bottom - top)}`,
    aspect: viewWidth / (bottom - top),
  };
}

function markSvgBody(
  mark: ReturnType<typeof wovenMark>,
  stroke: number,
  accent: string,
  ink: string,
) {
  const dots = (pts: Pt[], fill: string) =>
    pts
      .map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(mark.r)}" fill="${fill}"/>`)
      .join('');
  return (
    `<path d="${mark.lines.join('')}" fill="none" stroke="${ink}" stroke-width="${f(stroke)}" stroke-linecap="round"/>` +
    dots(mark.inputs, accent) +
    dots(mark.outputs, ink)
  );
}

async function wordmarkSvg(engine: TextEngine, o: Options, attrs = '') {
  const w = await wordmark(engine, o);
  return `<svg ${attrs} viewBox="${w.viewBox}" role="img" aria-label="Xematics">${markSvgBody(w.mark, w.stroke, 'var(--mark-accent, currentColor)', 'currentColor')}<path d="${w.text}" fill="currentColor"/></svg>`;
}

async function favicon(engine: TextEngine) {
  const w = await wordmark(engine, BRAND);
  // Mark only, centered in a square, slightly heavier so it survives 16 px.
  const mark = wovenMark(26, 22, 2.6);
  const body = markSvgBody(mark, 2.6, '#1f4e79', '#1d1a16')
    .replace(/#1d1a16/g, 'var(--ink)')
    .replace(/#1f4e79/g, 'var(--accent)');
  void w;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -29 32 32"><style>:root{--ink:#1d1a16;--accent:#1f4e79}@media (prefers-color-scheme: dark){:root{--ink:#ece5d8;--accent:#9cc3e6}}</style>${body}</svg>\n`;
}

const engine = await loadEngine();

if (process.argv.includes('--variants')) {
  const variants: [string, Options][] = [
    [
      'A. Medium, mark at cap height, medium edges',
      { weight: 500, markScale: 1, strokeRatio: 0.06 },
    ],
    [
      'B. SemiBold, mark at cap height, heavier edges',
      { weight: 600, markScale: 1, strokeRatio: 0.075 },
    ],
    [
      'C. Medium, mark 8% taller than caps (like an initial)',
      { weight: 500, markScale: 1.08, strokeRatio: 0.06 },
    ],
    [
      'D. Regular, mark at cap height, hairline edges',
      { weight: 400, markScale: 1, strokeRatio: 0.045 },
    ],
  ];
  const plain = async (weight: 400 | 500 | 600) => {
    const shaped = engine.shape('Xematics', { family: FAMILY, weight }, UNITS);
    const d = engine.outline(shaped, 0, 0);
    const b = bounds(d);
    return `<svg viewBox="0 ${f(b.minY - 1)} ${f(shaped.width)} ${f(b.maxY - b.minY + 2)}" style="height:1em"><path d="${d}" fill="currentColor"/></svg>`;
  };
  const rows = await Promise.all(
    variants.map(async ([label, o]) => {
      const svg = await wordmarkSvg(engine, o, 'style="height:1em"');
      return `<div class="row"><p>${label}</p><div class="pair"><span class="light">${svg}</span><span class="dark">${svg}</span></div><div class="pair small"><span class="light mast">${svg}</span><span class="dark mast">${svg}</span></div></div>`;
    }),
  );
  const html = `<!doctype html><meta charset="utf-8"><title>Wordmark variants</title><style>
body{font:14px/1.5 system-ui;background:#d7dbe1;margin:20px;color:#111}h1{font-size:18px;margin:0 0 4px}
.row{background:#fff;border-radius:10px;padding:12px 16px;margin:0 0 12px}.row p{margin:0 0 8px;font-weight:600}
.pair{display:flex;gap:12px}.pair span{flex:1;padding:18px 22px;border-radius:8px;font-size:64px;line-height:1;display:flex;align-items:center}
.pair.small span{font-size:30px;padding:10px 22px;margin-top:8px}
.light{background:#f6f2ea;color:#1d1a16;--mark-accent:#1f4e79}.dark{background:#141210;color:#ece5d8;--mark-accent:#9cc3e6}
.ref span{font-size:64px}</style>
<h1>Wordmark: woven X + "ematics" in EB Garamond (outlined, exact)</h1><p>Reference, the plain typed word: the mark replaces this X at the same cap height.</p>
<div class="row ref"><div class="pair"><span class="light">${await plain(500)}</span><span class="dark">${await plain(500)}</span></div></div>
${rows.join('')}`;
  await writeFile(new URL('../.internal/mocks/wordmark.html', import.meta.url), html);
  console.log('wrote .internal/mocks/wordmark.html');
} else {
  const svg = await wordmarkSvg(engine, BRAND, 'class:list={["wordmark", className]} {...rest}');
  const component = `---\n// Generated by scripts/build-brand.ts. Do not edit by hand.\nimport type { HTMLAttributes } from 'astro/types';\ntype Props = HTMLAttributes<'svg'>;\nconst { class: className, ...rest } = Astro.props;\n---\n\n${svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')}\n`;
  await mkdir(new URL('../apps/web/src/components/', import.meta.url), { recursive: true });
  await writeFile(new URL('../apps/web/src/components/Wordmark.astro', import.meta.url), component);
  await writeFile(
    new URL('../apps/web/public/favicon.svg', import.meta.url),
    await favicon(engine),
  );
  console.log('wrote Wordmark.astro and favicon.svg');
}

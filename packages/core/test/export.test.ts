// PDF and TikZ exports: goldens (both are deterministic text) plus checks on their structure.

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  embedSnippets,
  layoutModel,
  parseModel,
  pngSize,
  prepareModel,
  renderPdf,
  renderTikz,
  setPngDpi,
} from '../src/index.ts';
import { getEngine } from './helpers.ts';

const FIXTURES = new URL('./fixtures/', import.meta.url);

async function scene(file: string) {
  const engine = await getEngine();
  const model = parseModel(readFileSync(new URL(file, FIXTURES), 'utf8')).model!;
  await prepareModel(model, engine);
  return layoutModel(model, engine).scene;
}

const ascii = (bytes: Uint8Array) => {
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
};

describe('PDF export', () => {
  test.each(['mnist.txt', 'math.yaml', 'persian.yaml', 'rtl-boxes.yaml'])('%s', async (file) => {
    const pdf = ascii(renderPdf(await scene(file)));
    await expect(pdf).toMatchFileSnapshot(`./golden/${file.replace(/\.\w+$/, '')}.pdf`);
  });

  test('is a valid single-page file with a correct cross-reference table', async () => {
    const pdf = ascii(renderPdf(await scene('mnist.txt')));
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    const xref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, i) =>
      expect(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true),
    );
    // Page size in points: 0.75 pt per SVG px.
    expect(pdf).toMatch(/\/MediaBox \[0 0 308\.3 307\.687\]/);
    // Plain ASCII: printable characters and line breaks only.
    expect([...pdf].every((c) => c === '\n' || (c >= ' ' && c <= '~'))).toBe(true);
  });
});

describe('TikZ export', () => {
  test.each([
    'mnist.txt',
    'math.yaml',
    'node-labels.yaml',
    'rtl-boxes.yaml',
    'bundled.yaml',
    'persian.yaml',
  ])('%s', async (file) => {
    await expect(renderTikz(await scene(file))).toMatchFileSnapshot(
      `./golden/${file.replace(/\.\w+$/, '')}.tex`,
    );
  });

  test('snippets need only a tikzpicture and say which packages to load', async () => {
    const tex = renderTikz(await scene('math.yaml'), { standalone: false });
    expect(tex).not.toContain('\\documentclass');
    expect(tex).toContain(
      '% Needs in the preamble: \\usepackage{tikz} \\usepackage{amsmath, amssymb}',
    );
    expect(tex.trimEnd().endsWith('\\end{tikzpicture}')).toBe(true);
  });

  test('label text is escaped; only formulas MathJax accepted pass through', async () => {
    const engine = await getEngine();
    const model = parseModel(
      'layers:\n  - { units: 2, name: "50% & #1 {x}_y" }\n  - { units: 2, name: "$\\\\input{/etc/passwd}$" }',
    ).model!;
    await prepareModel(model, engine);
    const tex = renderTikz(layoutModel(model, engine).scene);
    expect(tex).toContain('{50\\% \\& \\#1 \\{x\\}\\_y}');
    expect(tex).not.toContain('\\input{');
    expect(tex).toContain('\\$\\textbackslash{}input\\{/etc/passwd\\}\\$');
  });

  test('non-ASCII labels note XeLaTeX or LuaLaTeX', async () => {
    const tex = renderTikz(await scene('persian.yaml'));
    expect(tex).toContain('compile with XeLaTeX or LuaLaTeX');
    expect(tex).toContain('\\usepackage{fontspec}');
  });
});

describe('embed snippets and PNG helpers', () => {
  test('data URL, Markdown and HTML', () => {
    const s = embedSnippets('<svg xmlns="http://www.w3.org/2000/svg"/>', 'A [net] "x"', {
      width: 10.4,
      height: 5,
    });
    expect(s.dataUrl).toBe(
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
    );
    expect(s.markdown).toBe(`![A net "x"](${s.dataUrl})`);
    expect(s.html).toBe(
      `<img src="${s.dataUrl}" alt="A [net] &quot;x&quot;" width="10" height="5">`,
    );
  });

  test('pngSize scales CSS px to the chosen dpi', () => {
    expect(pngSize({ width: 411, height: 410 }, 300)).toEqual({ width: 1284, height: 1281 });
    expect(pngSize({ width: 411, height: 410 }, 96)).toEqual({ width: 411, height: 410 });
  });

  test('setPngDpi writes one pHYs chunk right after IHDR', () => {
    // 1x1 transparent PNG.
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==',
      ),
      (c) => c.charCodeAt(0),
    );
    const out = setPngDpi(setPngDpi(png, 72), 300);
    const text = ascii(out);
    expect(text.split('pHYs').length).toBe(2);
    expect(text.indexOf('pHYs')).toBe(8 + 25 + 4);
    const view = new DataView(out.buffer, 8 + 25 + 8);
    expect(view.getUint32(0)).toBe(11811); // 300 dpi in pixels per metre
    expect(out.length).toBe(png.length + 21);
  });
});

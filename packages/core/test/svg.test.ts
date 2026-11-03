import { describe, expect, test } from 'vitest';
import { renderDiagram, renderSvg, type Scene } from '../src/index.ts';
import { getEngine } from './helpers.ts';

async function svg(text: string, options = {}) {
  const result = await renderDiagram(text, await getEngine(), options);
  if (!result.svg) throw new Error(result.diagnostics.map((d) => d.message).join('\n'));
  return result.svg;
}

describe('SVG renderer', () => {
  test('is a standalone, accessible, script-free document', async () => {
    const out = await svg('3-2');
    expect(out).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="[\d.]+" height="[\d.]+" viewBox="0 0 [\d.]+ [\d.]+" role="img" aria-labelledby="xm-title xm-desc">\n/,
    );
    expect(out).toContain('<title id="xm-title">Neural network diagram</title>');
    expect(out).toContain('<desc id="xm-desc">Fully connected neural network with 2 layers');
    expect(out).not.toMatch(/<script|on\w+=|javascript:|<foreignObject/i);
    expect(out.endsWith('</svg>\n')).toBe(true);
  });

  test('escapes user text and strips invalid XML characters', async () => {
    const out = await svg('title: "<b>&\\u0007"\nlayers:\n  - { units: 2, name: "<script>" }', {
      text: 'live',
    });
    expect(out).toContain('<title id="xm-title">&lt;b&gt;&amp;</title>');
    expect(out).toContain('>&lt;script&gt;</text>');
    expect(out).not.toContain('<script>');
  });

  test('outlined text by default, live text on request', async () => {
    expect(await svg('3-2')).not.toContain('<text');
    const plain = await svg('3-2', { text: 'live', embedFonts: false });
    expect(plain).not.toContain('@font-face');
    expect(plain).toContain(
      '<text id="xm-name-0" class="xm-label xm-label-name" x="37.82" y="137.59" text-anchor="middle" font-family="Inter, Vazirmatn, &#39;Noto Sans Hebrew&#39;, &#39;Noto Sans SC&#39;, &#39;Noto Sans JP&#39;, &#39;Noto Sans KR&#39;, &#39;Helvetica Neue&#39;, Arial, sans-serif" font-size="13" font-weight="500" fill="#1f2937">Input</text>',
    );
  });

  test('live text embeds subsets of the fonts it uses, named with the id prefix', async () => {
    const live = await svg('3-2', { text: 'live', prefix: 'fig-' });
    const faces = [
      ...live.matchAll(
        /@font-face\{font-family:'(fig-font-\d)';src:url\(data:font\/ttf;base64,([A-Za-z0-9+/=]+)\)\}/g,
      ),
    ];
    // Medium for names, regular for sizes; each holds only the characters used.
    expect(faces.map((f) => f[1])).toEqual(['fig-font-0', 'fig-font-1']);
    for (const [, , data] of faces) expect(data!.length).toBeLessThan(8000);
    expect(live).toContain('font-family="&#39;fig-font-1&#39;, Inter,');
    expect(live).not.toContain('xm-');
  });

  test('shared paint moves to the group', async () => {
    const out = await svg('3-2');
    expect(out).toContain(
      '<g id="xm-edges-0" class="xm-edges" stroke="#b8c0cc" stroke-width="0.8">',
    );
    expect(out).toMatch(
      /<line id="xm-edge-0-0-1-0" class="xm-edge" x1="[\d.]+" y1="[\d.]+" x2="[\d.]+" y2="[\d.]+"\/>/,
    );
  });

  test('prefix and background options', async () => {
    const out = await svg('layers: [3, 2]\nstyle: { background: transparent }', {
      prefix: 'fig1-',
    });
    expect(out).toContain('id="fig1-node-0-0" class="fig1-node fig1-node-input"');
    expect(out).not.toContain('background');
    const scene: Scene = {
      version: 1,
      width: 1,
      height: 1,
      background: null,
      title: 't',
      description: 'd',
      items: [],
    };
    expect(() => renderSvg(scene, { prefix: '"><script>' })).toThrow(/Invalid id prefix/);
    expect(renderSvg(scene, { prefix: '' })).toContain('<title id="title">');
  });

  test('numbers are rounded to two decimals', async () => {
    const out = await svg('784-16-16-10');
    expect(out).not.toMatch(/\d\.\d{3}/);
    // "-0" as a number (after a quote, space or path command), not inside ids like node-0-0.
    expect(out).not.toMatch(/(?:="|[ A-Z])-0(?:[ "A-Z])/);
  });
});

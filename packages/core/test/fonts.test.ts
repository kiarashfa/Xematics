// The label font option (style.font): Latin Modern Roman and Sans next to Inter.

import { describe, expect, test } from 'vitest';
import { layoutModel, parseModel, prepareModel, renderTikz, resolveTheme } from '../src/index.ts';
import { getEngine } from './helpers.ts';

describe('label fonts', () => {
  test('every label style takes the chosen family', () => {
    const theme = resolveTheme({ font: 'latin-modern-roman' });
    for (const style of [theme.nameText, theme.sizeText, theme.nodeText, theme.maps.opText])
      expect(style.family).toBe('Latin Modern Roman');
    expect(resolveTheme(undefined).nameText.family).toBe('Inter');
  });

  test('labels are shaped with Latin Modern and TikZ uses lmodern', async () => {
    const engine = await getEngine();
    const model = parseModel('style: { font: latin-modern-roman }\nlayers: [4, 3]').model!;
    await prepareModel(model, engine);
    const scene = layoutModel(model, engine).scene;
    const text = scene.items.find((i) => i.kind === 'text');
    expect(text?.kind === 'text' && text.font.family).toBe('Latin Modern Roman');
    const tex = renderTikz(scene);
    expect(tex).toContain(String.raw`\usepackage{lmodern}`);
    expect(tex).toContain(String.raw`\rmfamily`);
    expect(parseModel('style: { font: comic }\nlayers: [2]').diagnostics[0]?.severity).toBe(
      'error',
    );
  });
});

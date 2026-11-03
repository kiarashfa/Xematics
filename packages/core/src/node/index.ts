// Node-only helpers (file system access). Browser code imports '@xematics/core' instead.

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createTextEngine, type FontFaceData, type TextEngine } from '../text/engine.ts';
import { BUNDLED_FONTS, FONT_PACKAGE } from '../text/fonts.ts';

const require = createRequire(import.meta.url);

export async function loadBundledFonts(): Promise<FontFaceData[]> {
  return Promise.all(
    BUNDLED_FONTS.map(async (font) => {
      const file = require.resolve(`${FONT_PACKAGE}/files/${font.file}`);
      return {
        family: font.family,
        weight: font.weight,
        data: new Uint8Array(await readFile(file)),
      };
    }),
  );
}

export async function createNodeTextEngine(): Promise<TextEngine> {
  return createTextEngine(await loadBundledFonts());
}

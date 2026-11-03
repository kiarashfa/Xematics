// Node-only helpers (file system access). Browser code imports '@xematics/core' instead.

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createTextEngine, type FontFile, type TextEngine } from '../text/engine.ts';

const require = createRequire(import.meta.url);

/** Reads a bundled font file from its npm package. */
export async function readBundledFont(font: FontFile): Promise<Uint8Array> {
  return new Uint8Array(await readFile(require.resolve(`${font.package}/files/${font.file}`)));
}

export async function createNodeTextEngine(): Promise<TextEngine> {
  return createTextEngine({
    loadFont: readBundledFont,
    importMath: (specifier) => import(specifier),
    loadSubsetter: async () =>
      new Uint8Array(await readFile(require.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm'))),
  });
}

// Loads the text engine in the browser: the same Inter files and HarfBuzz build as in Node, so the
// preview and exports here are identical to the CLI and the build-time figures.

import { BUNDLED_FONTS, createTextEngine, type TextEngine } from '@xematics/core';
import greek400 from '@fontsource/inter/files/inter-greek-400-normal.woff?url';
import greek500 from '@fontsource/inter/files/inter-greek-500-normal.woff?url';
import latinExt400 from '@fontsource/inter/files/inter-latin-ext-400-normal.woff?url';
import latinExt500 from '@fontsource/inter/files/inter-latin-ext-500-normal.woff?url';
import latin400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import latin500 from '@fontsource/inter/files/inter-latin-500-normal.woff?url';

const FONT_URLS: Readonly<Record<string, string>> = {
  'inter-latin-400-normal.woff': latin400,
  'inter-latin-ext-400-normal.woff': latinExt400,
  'inter-greek-400-normal.woff': greek400,
  'inter-latin-500-normal.woff': latin500,
  'inter-latin-ext-500-normal.woff': latinExt500,
  'inter-greek-500-normal.woff': greek500,
};

let loading: Promise<TextEngine> | undefined;

export function loadEngine(): Promise<TextEngine> {
  loading ??= (async () => {
    const faces = await Promise.all(
      BUNDLED_FONTS.map(async (font) => {
        const url = FONT_URLS[font.file];
        if (!url) throw new Error(`No URL for bundled font ${font.file}.`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load ${font.file} (${response.status}).`);
        return {
          family: font.family,
          weight: font.weight,
          data: new Uint8Array(await response.arrayBuffer()),
        };
      }),
    );
    return createTextEngine(faces);
  })();
  return loading;
}

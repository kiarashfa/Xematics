// "Export all" on the profile page: every diagram shown, in one format, as one ZIP download.
// Loaded on demand; each figure is made exactly like the editor's own export.

import {
  layoutModel,
  parseModel,
  pngSize,
  prepareModel,
  renderPdf,
  renderScene,
  renderTikz,
  setPngDpi,
} from '@xematics/core';
import { downloadBytes, rasterize } from '../tool/browser.ts';
import { loadEngine } from '../tool/engine.ts';
import { MAX_PNG_PIXELS } from '../tool/formats.ts';
import { zip, type ZipEntry } from './zip.ts';

export type BulkFormat = 'svg' | 'png' | 'pdf' | 'tex' | 'source';

export interface BulkOptions {
  format: BulkFormat;
  pngDpi: number;
  liveText: boolean;
  tikzStandalone: boolean;
}

export interface BulkResult {
  /** Diagrams in the ZIP. */
  count: number;
  /** Names of diagrams left out (errors in the source, or a PNG too large for the browser). */
  skipped: string[];
}

const SOURCE_EXTENSION = { shorthand: 'txt', yaml: 'yaml', json: 'json' } as const;

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'diagram'
  );
}

/** Renders the diagrams and downloads them as one ZIP file. */
export async function exportAll(
  diagrams: readonly { name: string; text: string }[],
  options: BulkOptions,
  progress: (done: number, total: number) => void,
): Promise<BulkResult> {
  const engine = await loadEngine();
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];
  const skipped: string[] = [];
  const used = new Set<string>();

  for (const [index, { name, text }] of diagrams.entries()) {
    progress(index, diagrams.length);
    const parsed = parseModel(text);
    const model = parsed.model;
    if (!model) {
      skipped.push(name);
      continue;
    }
    const extension =
      options.format === 'source' ? SOURCE_EXTENSION[parsed.format] : options.format;
    const base = slug(name);
    let file = `${base}.${extension}`;
    for (let n = 2; used.has(file); n++) file = `${base}-${n}.${extension}`;

    let data: Uint8Array;
    if (options.format === 'source') {
      data = encoder.encode(text);
    } else {
      await prepareModel(model, engine);
      const scene = layoutModel(model, engine).scene;
      if (options.format === 'svg') {
        const svg = await renderScene(scene, engine, {
          text: options.liveText ? 'live' : 'outline',
        });
        data = encoder.encode(svg);
      } else if (options.format === 'pdf') {
        data = renderPdf(scene);
      } else if (options.format === 'tex') {
        data = encoder.encode(renderTikz(scene, { standalone: options.tikzStandalone }));
      } else {
        const size = pngSize(scene, options.pngDpi);
        if (size.width * size.height > MAX_PNG_PIXELS) {
          skipped.push(name);
          continue;
        }
        const svg = await renderScene(scene, engine);
        data = setPngDpi(await rasterize(svg, size.width, size.height), options.pngDpi);
      }
    }
    used.add(file);
    entries.push({ name: file, data });
  }

  progress(diagrams.length, diagrams.length);
  if (entries.length > 0) {
    const day = new Date().toISOString().slice(0, 10);
    downloadBytes(`xematics-diagrams-${day}.zip`, zip(entries), 'application/zip');
  }
  return { count: entries.length, skipped };
}

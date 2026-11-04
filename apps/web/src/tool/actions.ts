// Editor commands shared by the ribbon, the title bar and the phone layout.

import {
  pngSize,
  renderPdf,
  renderScene,
  renderTikz,
  serializeWorkspace,
  setPngDpi,
  toJsonText,
} from '@xematics/core';
import { copyText, downloadBytes, downloadText, rasterize } from './browser.ts';
import { MAX_PNG_PIXELS, type ExportFormat } from './formats.ts';
import { tool } from './state.svelte.ts';
import { browserStore } from '../user/store.ts';

const MAX_SOURCE_BYTES = 400_000;
const MAX_WORKSPACE_BYTES = 60_000_000;

export async function exportSvg(): Promise<void> {
  const svg = await tool.exportSvg();
  if (svg) downloadText(tool.fileName('svg'), svg, 'image/svg+xml');
}

/** Runs one export format; the Export button then repeats it. */
export async function exportAs(format: ExportFormat): Promise<void> {
  tool.exportFormat = format;
  if (format === 'embed') {
    tool.dialog = 'embed';
    return;
  }
  if (format === 'svg') return exportSvg();
  if (format === 'json') {
    if (tool.model) downloadText(tool.fileName('json'), toJsonText(tool.model), 'application/json');
    return;
  }
  const ready = await tool.exportScene();
  if (!ready) return;
  const { scene, engine } = ready;
  if (format === 'pdf') {
    downloadBytes(tool.fileName('pdf'), renderPdf(scene), 'application/pdf');
  } else if (format === 'tex') {
    const tex = renderTikz(scene, { standalone: tool.tikzStandalone });
    downloadText(tool.fileName('tex'), tex, 'application/x-tex');
  } else {
    const size = pngSize(scene, tool.pngDpi);
    if (size.width * size.height > MAX_PNG_PIXELS) {
      tool.flash(
        'That PNG would be too large for the browser. Pick a smaller size in Export options.',
      );
      return;
    }
    try {
      // Outlined text, so the image looks the same whatever fonts this device has.
      const svg = await renderScene(scene, engine);
      const png = setPngDpi(await rasterize(svg, size.width, size.height), tool.pngDpi);
      downloadBytes(tool.fileName('png'), png, 'image/png');
    } catch (error) {
      tool.flash(error instanceof Error ? error.message : 'The PNG image could not be made.');
    }
  }
}

export async function copyTikz(): Promise<void> {
  const ready = await tool.exportScene();
  if (!ready) return;
  const tex = renderTikz(ready.scene, { standalone: tool.tikzStandalone });
  tool.flash((await copyText(tex)) ? 'TikZ code copied.' : 'Copying is blocked in this browser.');
}

export async function copySvg(): Promise<void> {
  const svg = await tool.exportSvg();
  if (svg)
    tool.flash(
      (await copyText(svg))
        ? 'SVG copied to the clipboard.'
        : 'Copying is blocked in this browser.',
    );
}

export function downloadSource(): void {
  const format = tool.parsed.format;
  const [extension, type] =
    format === 'json'
      ? ['json', 'application/json']
      : format === 'yaml'
        ? ['yaml', 'application/yaml']
        : ['txt', 'text/plain'];
  downloadText(tool.fileName(extension), tool.text, type);
}

/** Copies a link that carries the diagram in its fragment; very large diagrams get a file instead. */
export async function copyShareLink(): Promise<void> {
  const link = await tool.shareLink();
  if (!link) {
    downloadSource();
    tool.flash('This diagram is too large for a link, so its source file was saved instead.');
    return;
  }
  tool.flash(
    (await copyText(link))
      ? 'Link copied. Anyone with the link can open this diagram.'
      : 'Copying is blocked in this browser.',
  );
}

export async function openSourceFile(file: File): Promise<void> {
  if (file.size > MAX_SOURCE_BYTES) {
    tool.flash('That file is too large for a diagram source.');
    return;
  }
  tool.newDocument(await file.text());
  tool.flash(`Opened ${file.name} as a new document.`);
}

/** Downloads the save file: what this browser stores (with the profile), after the latest edits. */
export async function saveWorkspace(): Promise<void> {
  let workspace = tool.snapshot();
  try {
    workspace = await browserStore.save(workspace);
  } catch {
    // Storage is blocked: the file still carries the documents open here.
  }
  downloadText('xematics-save.json', serializeWorkspace(workspace), 'application/json');
}

/** Opens a save file: its documents and profile are merged with this browser's (newer edits win). */
export async function openWorkspaceFile(file: File): Promise<void> {
  if (file.size > MAX_WORKSPACE_BYTES) {
    tool.flash('That save file is too large.');
    return;
  }
  tool.flash(await tool.openWorkspace(await file.text(), file.name));
}

export function deleteDocument(): void {
  const current = tool.documents.find((d) => d.id === tool.currentId);
  if (
    current &&
    confirm(
      `Delete "${tool.documentName(current)}"? You can restore it from your profile for 30 days.`,
    )
  )
    tool.deleteCurrent();
}

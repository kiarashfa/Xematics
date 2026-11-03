// Editor commands shared by the ribbon, the title bar and the phone layout.

import { serializeWorkspace } from '@xematics/core';
import { copyText, downloadText } from './browser.ts';
import { tool } from './state.svelte.ts';

const MAX_SOURCE_BYTES = 400_000;
const MAX_WORKSPACE_BYTES = 60_000_000;

export function exportSvg(): void {
  const svg = tool.exportSvg();
  if (svg) downloadText(tool.fileName('svg'), svg, 'image/svg+xml');
}

export async function copySvg(): Promise<void> {
  const svg = tool.exportSvg();
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

export function saveWorkspace(): void {
  downloadText('xematics-workspace.json', serializeWorkspace(tool.snapshot()), 'application/json');
}

export async function openWorkspaceFile(file: File): Promise<void> {
  if (file.size > MAX_WORKSPACE_BYTES) {
    tool.flash('That workspace file is too large.');
    return;
  }
  const replace = confirm(
    'Opening a workspace replaces the documents saved in this browser. Save the current workspace first if you still need it. Continue?',
  );
  if (!replace) return;
  const error = tool.openWorkspace(await file.text());
  tool.flash(error ?? `Opened the workspace ${file.name}.`);
}

export function deleteDocument(): void {
  const current = tool.documents.find((d) => d.id === tool.currentId);
  if (current && confirm(`Delete "${tool.documentName(current)}"? This cannot be undone.`))
    tool.deleteCurrent();
}

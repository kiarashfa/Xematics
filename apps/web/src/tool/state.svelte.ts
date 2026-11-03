// Editor state. The source text is the document; everything else (model, layout, preview) is
// derived from it. Form and ribbon edits change the model and are written back into the text,
// so undo and redo only ever need to track text. Documents live in a workspace that is autosaved
// to the browser and can be saved to and opened from a file.

import {
  applyStructure,
  autoName,
  createWorkspace,
  decodeShare,
  encodeShare,
  insertLayer,
  isShareFragment,
  layoutModel,
  moveLayer,
  parseModel,
  parseShorthand,
  parseWorkspace,
  patchStyle,
  PRESETS,
  removeLayer,
  renderSvg,
  SHARE_SOFT_LIMIT,
  structureOf,
  updateText,
  type Diagnostic,
  type Model,
  type PresetId,
  type TextEngine,
  type Workspace,
  type WorkspaceDocument,
} from '@xematics/core';
import type { WorkspaceStore } from './storage.ts';

export const EXAMPLES = [
  { name: 'Perceptron', text: '3-1' },
  { name: 'Two-layer MLP', text: '3-5-4-2' },
  {
    name: 'MNIST classifier',
    text: 'title: MNIST classifier\nlayers:\n  - { units: 784, name: Pixels }\n  - { units: 16, activation: relu }\n  - { units: 16, activation: relu }\n  - { units: 10, name: Digits }\n',
  },
  { name: 'Autoencoder', text: '8-4-2-4-8' },
] as const;

export type SaveStatus = 'saved' | 'saving' | 'error';
export type Selection = { kind: 'diagram' } | { kind: 'layer'; index: number };

const DEFAULTS = PRESETS.classic;
const HISTORY_LIMIT = 200;
/** Keystrokes closer together than this become one undo step. */
const COALESCE_MS = 800;
const SAVE_DELAY_MS = 400;
const NEW_DOCUMENT = '4-8-3';

const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export class ToolState {
  text = $state<string>('');
  engine = $state.raw<TextEngine | undefined>(undefined);
  engineError = $state<string | undefined>(undefined);
  selection = $state<Selection>({ kind: 'diagram' });
  /** Export outlined text (default) or live, editable text. */
  liveText = $state(false);
  showNavigator = $state(true);
  showFormat = $state(true);
  canUndo = $state(false);
  canRedo = $state(false);
  notice = $state('');
  /** 'fit' follows the canvas size; a number is a fixed zoom factor. */
  zoom = $state<number | 'fit'>('fit');
  /** The zoom actually applied, published by the canvas. */
  scale = $state(1);
  documents = $state<WorkspaceDocument[]>([]);
  currentId = $state('');
  /** True once the workspace is loaded; nothing is saved before that. */
  ready = $state(false);
  saveStatus = $state<SaveStatus>('saved');
  /** True when the editor was opened from a share link (the phone then skips the file list). */
  openedFromLink = $state(false);

  #past: string[] = [];
  #future: string[] = [];
  #lastEdit = 0;
  #typing = false;
  #lastModel: Model | undefined;
  #noticeTimer: ReturnType<typeof setTimeout> | undefined;
  #store: WorkspaceStore | undefined;
  #saveTimer: ReturnType<typeof setTimeout> | undefined;

  parsed = $derived(parseModel(this.text));
  /** The last valid model, so the preview stays visible while the text has errors. */
  model = $derived.by(() => {
    const model = this.parsed.model;
    if (model) this.#lastModel = model;
    return model ?? this.#lastModel;
  });
  valid = $derived(this.parsed.model !== undefined);
  errors = $derived(this.parsed.diagnostics.filter((d) => d.severity === 'error'));
  layout = $derived(this.engine && this.model ? layoutModel(this.model, this.engine) : undefined);
  warnings = $derived<Diagnostic[]>([
    ...this.parsed.diagnostics.filter((d) => d.severity === 'warning'),
    ...(this.layout?.diagnostics ?? []),
  ]);
  preview = $derived(this.layout ? renderSvg(this.layout.scene, { prefix: 'pv-' }) : '');
  structure = $derived(this.model ? structureOf(this.model) : '');
  stats = $derived.by(() => {
    const layers = this.model?.layers ?? [];
    const items = this.layout?.scene.items ?? [];
    return {
      layers: layers.length,
      neurons: layers.reduce((sum, layer) => sum + layer.units, 0),
      edges: items.filter((item) => item.kind === 'line' && item.classes?.includes('edge')).length,
    };
  });

  /** Display name of a layer: its own name, or the automatic one. */
  layerName(index: number): string {
    const layers = this.model?.layers ?? [];
    const name = layers[index]?.name?.trim();
    return name || autoName(index, layers.length);
  }

  setText(next: string, typing = false): void {
    if (next === this.text) return;
    const now = Date.now();
    const merge = typing && this.#typing && now - this.#lastEdit < COALESCE_MS;
    if (!merge) {
      this.#past.push(this.text);
      if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
    }
    this.#typing = typing;
    this.#lastEdit = now;
    this.#future = [];
    this.text = next;
    this.#afterChange();
  }

  undo(): void {
    const previous = this.#past.pop();
    if (previous === undefined) return;
    this.#future.push(this.text);
    this.text = previous;
    this.#typing = false;
    this.#afterChange();
  }

  redo(): void {
    const next = this.#future.pop();
    if (next === undefined) return;
    this.#past.push(this.text);
    this.text = next;
    this.#typing = false;
    this.#afterChange();
  }

  /** Applies a model edit and writes it back into the source text. */
  edit(change: (model: Model) => Model, typing = false): boolean {
    const before = this.parsed.model;
    if (!before) {
      this.flash('Fix the errors in the source first.');
      return false;
    }
    const after = change(before);
    if (after === before) return false;
    this.setText(updateText(this.text, this.parsed.format, before, after).text, typing);
    return true;
  }

  /** Applies a structure shorthand (sizes and activations) from the shorthand bar. */
  setStructure(shorthand: string): readonly Diagnostic[] {
    const result = parseShorthand(shorthand);
    if (result.diagnostics.length > 0) return result.diagnostics;
    this.edit((model) => applyStructure(model, result.layers), true);
    return [];
  }

  select(selection: Selection): void {
    this.selection = selection;
  }

  addLayer(): void {
    const count = this.model?.layers.length ?? 0;
    const at = this.selection.kind === 'layer' ? this.selection.index + 1 : Math.max(1, count - 1);
    if (this.edit((model) => insertLayer(model, at))) this.select({ kind: 'layer', index: at });
  }

  removeSelectedLayer(): void {
    if (this.selection.kind !== 'layer') return;
    const index = this.selection.index;
    this.edit((model) => removeLayer(model, index));
  }

  moveSelectedLayer(delta: -1 | 1): void {
    if (this.selection.kind !== 'layer') return;
    const index = this.selection.index;
    if (this.edit((model) => moveLayer(model, index, delta)))
      this.select({ kind: 'layer', index: index + delta });
  }

  /** Effective style settings, with preset defaults filled in. */
  labels = $derived({
    names: this.model?.style?.labels?.names ?? DEFAULTS.labels.names,
    sizes: this.model?.style?.labels?.sizes ?? DEFAULTS.labels.sizes,
  });
  collapse = $derived({
    above: this.model?.style?.collapse?.above ?? DEFAULTS.collapse.above,
    first: this.model?.style?.collapse?.first ?? DEFAULTS.collapse.first,
    last: this.model?.style?.collapse?.last ?? DEFAULTS.collapse.last,
  });
  transparent = $derived(this.model?.style?.background === 'transparent');
  preset = $derived<PresetId>(this.model?.style?.preset ?? 'classic');

  // Settings equal to the preset default are removed, so the source stays short.
  setLabel(key: 'names' | 'sizes', on: boolean): void {
    this.edit((model) =>
      patchStyle(model, { labels: { [key]: on === DEFAULTS.labels[key] ? undefined : on } }),
    );
  }

  setCollapse(key: 'above' | 'first' | 'last', value: number): void {
    this.edit((model) =>
      patchStyle(model, {
        collapse: { [key]: value === DEFAULTS.collapse[key] ? undefined : value },
      }),
    );
  }

  setPreset(id: PresetId): void {
    this.edit((model) => patchStyle(model, { preset: id === 'classic' ? undefined : id }));
  }

  setTransparent(on: boolean): void {
    this.edit((model) => patchStyle(model, { background: on ? 'transparent' : undefined }));
  }

  zoomBy(factor: number): void {
    this.zoom = Math.min(4, Math.max(0.1, Math.round(this.scale * factor * 100) / 100));
  }

  /** Loads the saved workspace, then opens a share link from the URL fragment, if any. */
  async init(store: WorkspaceStore, fragment: string): Promise<void> {
    this.#store = store;
    let workspace: Workspace | undefined;
    try {
      workspace = await store.load();
    } catch {
      this.saveStatus = 'error';
    }
    this.#apply(
      workspace ?? createWorkspace({ id: newId(), text: EXAMPLES[2].text, updatedAt: now() }),
    );
    if (isShareFragment(fragment)) {
      const shared = await decodeShare(fragment);
      if (shared.ok) {
        this.newDocument(shared.text);
        this.openedFromLink = true;
        this.flash('Opened a shared diagram as a new document.');
      } else {
        this.flash(shared.error);
      }
    }
    this.ready = true;
  }

  /** The workspace as stored and saved to files. */
  snapshot(): Workspace {
    return {
      ...createWorkspace(this.documents[0]!),
      current: this.currentId,
      documents: this.documents.map((d) => ({ ...d })),
      settings: { liveText: this.liveText },
    };
  }

  scheduleSave(): void {
    if (!this.ready || !this.#store) return;
    const store = this.#store;
    this.saveStatus = 'saving';
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      store.save(this.snapshot()).then(
        () => (this.saveStatus = 'saved'),
        () => (this.saveStatus = 'error'),
      );
    }, SAVE_DELAY_MS);
  }

  /** A short name for a document: its title, or the start of its source. */
  documentName(document: WorkspaceDocument): string {
    const title = /^\s*title:\s*['"]?(.+?)['"]?\s*$/m.exec(document.text)?.[1];
    const first = document.text.trim().split('\n')[0] ?? '';
    return (title ?? first).slice(0, 48) || 'Untitled';
  }

  newDocument(text = NEW_DOCUMENT): void {
    const document = { id: newId(), text, updatedAt: now() };
    this.documents.push(document);
    this.switchTo(document.id);
  }

  switchTo(id: string): void {
    const document = this.documents.find((d) => d.id === id);
    if (!document) return;
    this.currentId = id;
    this.text = document.text;
    this.#past = [];
    this.#future = [];
    this.#typing = false;
    this.selection = { kind: 'diagram' };
    this.#afterChange();
  }

  /** Deletes the current document; the workspace always keeps at least one. */
  deleteCurrent(): void {
    const index = this.documents.findIndex((d) => d.id === this.currentId);
    if (index === -1) return;
    this.documents.splice(index, 1);
    if (this.documents.length === 0) this.newDocument();
    else this.switchTo(this.documents[Math.max(0, index - 1)]!.id);
  }

  /** Replaces the workspace with one from a file. Returns an error message, if any. */
  openWorkspace(json: string): string | undefined {
    const result = parseWorkspace(json);
    if (!result.ok) return result.error;
    this.#apply(result.workspace);
    return undefined;
  }

  /** A link that opens the current source, or undefined when it would be too long to share. */
  async shareLink(): Promise<string | undefined> {
    const fragment = await encodeShare(this.text);
    const link = `${location.origin}${location.pathname}#${fragment}`;
    return link.length > SHARE_SOFT_LIMIT ? undefined : link;
  }

  #apply(workspace: Workspace): void {
    this.documents = workspace.documents.map((d) => ({ ...d }));
    this.liveText = workspace.settings?.liveText ?? false;
    this.switchTo(workspace.current);
  }

  /** The figure as exported: default ids, outlined or live text. */
  exportSvg(): string | undefined {
    return this.layout
      ? renderSvg(this.layout.scene, { text: this.liveText ? 'live' : 'outline' })
      : undefined;
  }

  fileName(extension: string): string {
    const title = this.model?.title ?? '';
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${slug || 'diagram'}.${extension}`;
  }

  flash(message: string): void {
    this.notice = message;
    clearTimeout(this.#noticeTimer);
    this.#noticeTimer = setTimeout(() => (this.notice = ''), 3200);
  }

  #afterChange(): void {
    const document = this.documents.find((d) => d.id === this.currentId);
    if (document && document.text !== this.text) {
      document.text = this.text;
      document.updatedAt = now();
    }
    this.canUndo = this.#past.length > 0;
    this.canRedo = this.#future.length > 0;
    const count = this.parsed.model?.layers.length;
    if (count !== undefined && this.selection.kind === 'layer' && this.selection.index >= count) {
      this.selection = { kind: 'layer', index: count - 1 };
    }
  }
}

export const tool = new ToolState();

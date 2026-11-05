// Editor state. The source text is the document; everything else (model, layout, preview) is
// derived from it. Form and ribbon edits change the model and are written back into the text,
// so undo and redo only ever need to track text. Documents live in a workspace that is autosaved
// to the browser and can be saved to and opened from a file.

import {
  animatedScene,
  applyStructure,
  buildTimeline,
  patchAnimation,
  resolveAnimation,
  resolveTheme,
  type AnimationPatch,
  type Timeline,
  autoNames,
  createWorkspace,
  defaultLayer,
  decodeShare,
  encodeShare,
  inferShapes,
  insertLayer,
  isYamlLoaded,
  loadYaml,
  YamlNotLoadedError,
  isShareFragment,
  labelContent,
  layoutModel,
  mergeWorkspaces,
  moveLayer,
  parseModel,
  parseShorthand,
  parseWorkspace,
  patchStyle,
  prepareModel,
  PRESETS,
  removeLayer,
  renderScene,
  renderSvg,
  SHARE_SOFT_LIMIT,
  structureOf,
  updateText,
  type Diagnostic,
  type Model,
  type Scene,
  type PresetId,
  type RemovedDocument,
  type TextEngine,
  type Workspace,
  type WorkspaceDocument,
  type WorkspaceSettings,
} from '@xematics/core';
import { DEFAULT_PNG_DPI, isExportFormat, PNG_SIZES, type ExportFormat } from './formats.ts';
import { describeMerge, type WorkspaceStore } from '../user/store.ts';
import { documentName, EXAMPLES, isPresetChoice, starterText } from './documents.ts';

export { EXAMPLES };

export type SaveStatus = 'saved' | 'saving' | 'error';
export type Selection = { kind: 'diagram' } | { kind: 'layer'; index: number };

const DEFAULTS = PRESETS.classic;
const HISTORY_LIMIT = 200;
/** Keystrokes closer together than this become one undo step. */
const COALESCE_MS = 800;
const SAVE_DELAY_MS = 400;

const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export class ToolState {
  text = $state<string>('');
  engine = $state.raw<TextEngine | undefined>(undefined);
  engineError = $state<string | undefined>(undefined);
  selection = $state<Selection>({ kind: 'diagram' });
  /** Export outlined text (default) or live, editable text. */
  liveText = $state(false);
  /** The format the Export button repeats. */
  exportFormat = $state<ExportFormat>('svg');
  pngDpi = $state(DEFAULT_PNG_DPI);
  tikzStandalone = $state(true);
  /** Style preset for new diagrams (set on the profile page). */
  defaultPreset = $state<string | undefined>(undefined);
  /** The open editor dialog, if any. */
  dialog = $state<'export-options' | 'embed' | undefined>(undefined);
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
  /** Bumped when fonts or formulas finish loading, so the layout picks them up. */
  textVersion = $state(0);

  #past: string[] = [];
  #future: string[] = [];
  #lastEdit = 0;
  #typing = false;
  #lastModel: Model | undefined;
  #noticeTimer: ReturnType<typeof setTimeout> | undefined;
  #store: WorkspaceStore | undefined;
  /** Documents deleted here or on another device, so merges do not bring them back. */
  #removed: RemovedDocument[] = [];
  /** The settings as last stored or changed here, and when they changed. */
  #settingsKey = '';
  #settingsAt: string | undefined;
  #saveTimer: ReturnType<typeof setTimeout> | undefined;

  /** The YAML reader loads on first need: shorthand-only sessions never fetch it. */
  yamlReady = $state(isYamlLoaded());
  yamlError = $state(false);
  parsed = $derived.by(() => {
    void this.yamlReady;
    const parsed = parseModel(this.text);
    if (!parsed.pending) return parsed;
    if (!this.yamlError) {
      void this.loadYaml();
      return parsed;
    }
    const message = 'The YAML reader could not load. Check the connection and reload the page.';
    return { ...parsed, diagnostics: [{ severity: 'error' as const, code: 'yaml.load', message }] };
  });
  /** The last valid model, so the preview stays visible while the text has errors. */
  model = $derived.by(() => {
    const model = this.parsed.model;
    if (model) this.#lastModel = model;
    return model ?? this.#lastModel;
  });
  valid = $derived(this.parsed.model !== undefined);
  errors = $derived(this.parsed.diagnostics.filter((d) => d.severity === 'error'));
  layout = $derived.by(() => {
    void this.textVersion;
    return this.engine && this.model ? layoutModel(this.model, this.engine) : undefined;
  });
  warnings = $derived<Diagnostic[]>([
    ...this.parsed.diagnostics.filter((d) => d.severity === 'warning'),
    ...(this.layout?.diagnostics ?? []),
  ]);
  /** The Animate tab (or the phone's animation sheet) is open: the preview shows the animation. */
  playerOpen = $state(false);
  playing = $state(false);
  /** Position in the animation loop, in ms (kept while the preview redraws). */
  time = $state(0);
  animation = $derived(resolveAnimation(this.model?.animation));
  timeline = $derived<Timeline | undefined>(
    this.playerOpen && this.layout
      ? buildTimeline(this.layout.scene, resolveTheme(this.model?.style), this.model?.animation)
      : undefined,
  );
  preview = $derived(
    this.layout
      ? renderSvg(
          this.timeline ? animatedScene(this.layout.scene, this.timeline) : this.layout.scene,
          { prefix: 'pv-' },
        )
      : '',
  );
  /** The shorthand bar keeps repeats like 128*3 while the source uses them. */
  structure = $derived(
    this.model ? structureOf(this.model, { repeat: this.text.includes('*') }) : '',
  );
  /** What each layer outputs (28×28×8 for feature maps, 784 for vectors). */
  shapes = $derived(this.model ? inferShapes(this.model).shapes : []);
  autoNames = $derived(this.model ? autoNames(this.model) : []);
  stats = $derived.by(() => {
    const layers = this.model?.layers ?? [];
    const items = this.layout?.scene.items ?? [];
    return {
      layers: layers.length,
      neurons: layers.reduce((sum, layer) => sum + (layer.type === 'dense' ? layer.units : 0), 0),
      edges: items.filter((item) => item.kind === 'line' && item.classes?.includes('edge')).length,
    };
  });

  /** Display name of a layer: its own name, or the automatic one. */
  layerName(index: number): string {
    const layers = this.model?.layers ?? [];
    const name = layers[index]?.name?.trim();
    return name || this.autoNames[index] || `Layer ${index + 1}`;
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
    let text: string;
    try {
      text = updateText(this.text, this.parsed.format, before, after).text;
    } catch (error) {
      // Shorthand that turns into YAML needs the YAML writer: apply the edit once it is here.
      if (!(error instanceof YamlNotLoadedError)) throw error;
      void this.loadYaml().then((ok) => ok && this.edit(change, typing));
      return true;
    }
    this.setText(text, typing);
    return true;
  }

  /** Loads the YAML reader once; resolves false (and shows an error) when it cannot load. */
  loadYaml(): Promise<boolean> {
    return loadYaml().then(
      () => (this.yamlReady = true),
      () => {
        this.yamlError = true;
        return false;
      },
    );
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
    // Between feature maps a new layer starts as a convolution, elsewhere as a dense layer.
    const map = this.shapes[at - 1]?.kind === 'map' && this.shapes[at]?.kind === 'map';
    const layer = map ? defaultLayer('conv') : undefined;
    if (this.edit((model) => insertLayer(model, at, layer)))
      this.select({ kind: 'layer', index: at });
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
    ops: this.model?.style?.labels?.ops ?? DEFAULTS.labels.ops,
  });
  collapse = $derived({
    above: this.model?.style?.collapse?.above ?? DEFAULTS.collapse.above,
    first: this.model?.style?.collapse?.first ?? DEFAULTS.collapse.first,
    last: this.model?.style?.collapse?.last ?? DEFAULTS.collapse.last,
  });
  transparent = $derived(this.model?.style?.background === 'transparent');
  rightToLeft = $derived(this.model?.style?.direction === 'rtl');
  weights = $derived(this.model?.style?.weights === true);
  preset = $derived<PresetId>(this.model?.style?.preset ?? 'classic');

  // Settings equal to the preset default are removed, so the source stays short.
  setLabel(key: 'names' | 'sizes' | 'ops', on: boolean): void {
    this.edit((model) =>
      patchStyle(model, { labels: { [key]: on === DEFAULTS.labels[key] ? undefined : on } }),
    );
  }

  setWeights(on: boolean): void {
    this.edit((model) => patchStyle(model, { weights: on ? true : undefined }));
  }

  /** Changes animation settings in the source (defaults are left out). */
  setAnimation(patch: AnimationPatch): void {
    this.edit((model) => patchAnimation(model, patch));
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

  setRightToLeft(on: boolean): void {
    this.edit((model) => patchStyle(model, { direction: on ? 'rtl' : undefined }));
  }

  setTransparent(on: boolean): void {
    this.edit((model) => patchStyle(model, { background: on ? 'transparent' : undefined }));
  }

  zoomBy(factor: number): void {
    this.zoom = Math.min(4, Math.max(0.1, Math.round(this.scale * factor * 100) / 100));
  }

  /** Loads the saved workspace, then opens a share link from the URL fragment, if any, or the
   * document named by `?doc=` (links from the profile gallery). */
  async init(store: WorkspaceStore, fragment: string, openId?: string | null): Promise<void> {
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
    if (openId && this.documents.some((d) => d.id === openId)) {
      this.switchTo(openId);
      // Like a share link, a gallery link goes straight to the diagram on phones.
      this.openedFromLink = true;
    }
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
    const workspace: Workspace = {
      ...createWorkspace(this.documents[0]!),
      current: this.currentId,
      documents: this.documents.map((d) => ({ ...d })),
      settings: this.#settings(),
    };
    if (this.#removed.length > 0) workspace.removed = this.#removed.map((r) => ({ ...r }));
    return workspace;
  }

  /** The settings with the time they last changed here, so the newest settings win a merge. */
  #settings(): WorkspaceSettings {
    const values = this.#settingValues();
    const key = JSON.stringify(values);
    if (key !== this.#settingsKey) {
      this.#settingsKey = key;
      this.#settingsAt = now();
    }
    return this.#settingsAt ? { ...values, updatedAt: this.#settingsAt } : values;
  }

  #settingValues(): WorkspaceSettings {
    const values: WorkspaceSettings = {
      liveText: this.liveText,
      exportFormat: this.exportFormat,
      pngDpi: this.pngDpi,
      tikzStandalone: this.tikzStandalone,
    };
    if (this.defaultPreset) values.defaultPreset = this.defaultPreset;
    return values;
  }

  #applySettings(settings: WorkspaceSettings | undefined): void {
    this.liveText = settings?.liveText ?? false;
    this.exportFormat = isExportFormat(settings?.exportFormat) ? settings.exportFormat : 'svg';
    this.pngDpi = PNG_SIZES.some((s) => s.dpi === settings?.pngDpi)
      ? settings!.pngDpi!
      : DEFAULT_PNG_DPI;
    this.tikzStandalone = settings?.tikzStandalone ?? true;
    this.defaultPreset = isPresetChoice(settings?.defaultPreset)
      ? settings.defaultPreset
      : undefined;
    this.#settingsKey = JSON.stringify(this.#settingValues());
    this.#settingsAt = settings?.updatedAt;
  }

  /**
   * Takes in documents saved elsewhere (another tab, a save file, the cloud) without losing edits
   * made here: the newer edit of each document wins. The open document, settings and undo history
   * stay unless the open document itself changed or was deleted elsewhere.
   */
  absorb(incoming: Workspace): void {
    if (!this.ready) return;
    const merged = mergeWorkspaces(this.snapshot(), incoming);
    this.#removed = merged.removed ?? [];
    // Settings changed later elsewhere (the profile page, another device) apply here too.
    const settings = merged.settings;
    if (settings?.updatedAt && settings.updatedAt > (this.#settingsAt ?? ''))
      this.#applySettings(settings);
    const mine = Object.fromEntries(this.documents.map((d) => [d.id, d]));
    const same =
      merged.documents.length === this.documents.length &&
      merged.documents.every((d) => {
        const m = mine[d.id];
        return m && m.text === d.text && m.updatedAt === d.updatedAt;
      });
    if (same) return;
    this.documents = merged.documents.map((d) => ({ ...d }));
    const open = this.documents.find((d) => d.id === this.currentId);
    if (!open) {
      this.switchTo(merged.current);
    } else if (open.text !== this.text) {
      this.text = open.text;
      this.#past = [];
      this.#future = [];
      this.#afterChange();
    }
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

  /** Saves right away (Ctrl+S); every change is saved shortly after anyway. */
  async saveNow(): Promise<void> {
    if (!this.ready || !this.#store) return;
    clearTimeout(this.#saveTimer);
    this.saveStatus = 'saving';
    try {
      await this.#store.save(this.snapshot());
      this.saveStatus = 'saved';
      this.flash('Saved. Every change is also saved by itself.');
    } catch {
      this.saveStatus = 'error';
      this.flash('This browser blocks storage. Use Download save file in the File tab.');
    }
  }

  /** A short name for a document: its title, or the start of its source. */
  documentName(document: WorkspaceDocument): string {
    return documentName(document.text);
  }

  newDocument(text = starterText(this.defaultPreset)): void {
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
    // The text stays with the record, so the profile can restore it for a while.
    this.#removed.push({ id: this.currentId, at: now(), text: this.text });
    this.documents.splice(index, 1);
    if (this.documents.length === 0) this.newDocument();
    else this.switchTo(this.documents[Math.max(0, index - 1)]!.id);
  }

  /** Merges a save file into this browser (documents, profile and all). Returns a message. */
  async openWorkspace(json: string, fileName: string): Promise<string> {
    const result = parseWorkspace(json);
    if (!result.ok) return result.error;
    const before = this.snapshot();
    if (this.#store) {
      // The file goes through the store, so its profile is kept too.
      await this.#store.save(this.snapshot());
      this.absorb(await this.#store.save(result.workspace));
    } else {
      this.absorb(result.workspace);
    }
    if (this.documents.some((d) => d.id === result.workspace.current))
      this.switchTo(result.workspace.current);
    const brought = describeMerge(before, this.snapshot());
    return brought
      ? `Opened ${fileName}: ${brought}.`
      : `Everything in ${fileName} was already here.`;
  }

  /** A link that opens the current source, or undefined when it would be too long to share. */
  async shareLink(): Promise<string | undefined> {
    const fragment = await encodeShare(this.text);
    const link = `${location.origin}${location.pathname}#${fragment}`;
    return link.length > SHARE_SOFT_LIMIT ? undefined : link;
  }

  #apply(workspace: Workspace): void {
    this.documents = workspace.documents.map((d) => ({ ...d }));
    this.#removed = workspace.removed ? workspace.removed.map((r) => ({ ...r })) : [];
    this.#applySettings(workspace.settings);
    this.switchTo(workspace.current);
  }

  /** Loads the fonts and formulas the current model needs (Persian, CJK, math, ...). */
  async prepareText(): Promise<void> {
    const { engine, model } = this;
    if (!engine || !model) return;
    // Fonts are quick; the first formula waits for MathJax. Each redraws as soon as it is ready.
    const { text, math } = labelContent(model);
    const redraw = (changed: boolean) => {
      if (changed) this.textVersion++;
    };
    await Promise.all([
      engine.load(text).then(redraw),
      math.length > 0
        ? engine
            .loadMath(math)
            .then(redraw, () => this.flash('Math could not be loaded. Check your connection.'))
        : undefined,
    ]);
  }

  /** The figure as exported: default ids, outlined or live text (with its fonts embedded). */
  async exportSvg(): Promise<string | undefined> {
    const ready = await this.exportScene();
    return ready
      ? renderScene(ready.scene, ready.engine, { text: this.liveText ? 'live' : 'outline' })
      : undefined;
  }

  /** The figure as every exporter sees it, laid out once its fonts and formulas have arrived. */
  async exportScene(): Promise<{ scene: Scene; engine: TextEngine } | undefined> {
    const { engine, model } = this;
    if (!engine || !model) return undefined;
    await prepareModel(model, engine);
    return { scene: layoutModel(model, engine).scene, engine };
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

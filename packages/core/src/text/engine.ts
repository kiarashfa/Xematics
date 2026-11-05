// Text shaping, measuring and outlining with HarfBuzz (WASM). The same bundled fonts and the same
// shaper run in Node and in browsers, so layout and outlines are identical in both.
//
// Fonts load lazily: `load` fetches the faces a set of labels needs (Persian, Hebrew, CJK slices),
// then `shape` and `outline` run synchronously. Labels are split into bidi runs (Unicode UAX #9,
// via bidi-js), each run is shaped in its own direction, and runs are placed in visual order.

import bidiFactory from 'bidi-js';
import type * as HarfBuzz from 'harfbuzzjs';
import { num } from '../util/format.ts';
import { base64Encode } from '../util/web.ts';
import { CJK_FAMILIES, FACES } from './catalog/faces.ts';
import type { CatalogFace } from './catalog/types.ts';
import { createMathRenderer, type MathRenderer, type MathResult } from './math.ts';
import { createSubsetter, type Subsetter } from './subset.ts';
import { toSfnt } from './woff.ts';

export interface FontSpec {
  readonly family: string;
  readonly weight: number;
}

export interface FontFaceData extends FontSpec {
  /** Raw font file (TTF, OTF or WOFF). */
  readonly data: Uint8Array | ArrayBuffer;
}

/** A bundled font file: `files/<file>` inside an npm package. */
export interface FontFile {
  readonly package: string;
  readonly file: string;
}

export interface TextRequest {
  readonly text: string;
  readonly font: FontSpec;
}

export interface ShapedGlyph {
  /** Index of the loaded face that provides this glyph. */
  readonly face: number;
  readonly glyph: number;
  /** Pen position relative to the text origin, in px, y pointing down. */
  readonly x: number;
  readonly y: number;
}

export interface ShapedText {
  readonly text: string;
  readonly font: FontSpec;
  readonly size: number;
  /** Base direction, from the first strong character (UAX #9 rules P2 and P3). */
  readonly direction: 'ltr' | 'rtl';
  /** Advance width in px. */
  readonly width: number;
  /** Distance from baseline to the top and bottom of the line box, in px (both positive). */
  readonly ascent: number;
  readonly descent: number;
  readonly glyphs: readonly ShapedGlyph[];
  /** Characters no bundled face covers; they render as the font's missing-glyph box. */
  readonly missing: readonly string[];
  /** Characters a bundled face covers but that face is not loaded yet (call `load`). */
  readonly pending: readonly string[];
}

/** A subset of one loaded face, ready to embed in a live-text SVG. */
export interface EmbeddedFace {
  /** Key for this face, unique within one EmbeddedFonts (the SVG adds its id prefix). */
  readonly key: string;
  readonly type: 'font/ttf' | 'font/otf';
  /** Font bytes, base64. */
  readonly data: string;
}

export interface EmbeddedFonts {
  readonly faces: readonly EmbeddedFace[];
  /** Embedded face keys per "family weight", in fallback order. */
  readonly stacks: Readonly<Record<string, readonly string[]>>;
}

export interface TextEngine {
  shape(text: string, font: FontSpec, size: number): ShapedText;
  /** SVG path data for shaped text whose baseline starts at (x, y). */
  outline(shaped: ShapedText, x: number, y: number): string;
  /** Loads every bundled face these texts need. Resolves true when anything new was loaded. */
  load(requests: readonly TextRequest[]): Promise<boolean>;
  /** Typesets TeX (MathJax, loaded on first use). Resolves true when anything new was typeset. */
  loadMath(tex: readonly string[]): Promise<boolean>;
  /** A typeset formula, or undefined when `loadMath` has not seen it yet. */
  math(tex: string): MathResult | undefined;
  /** Subsets the faces these texts use, for embedding in live-text SVG. */
  embed(requests: readonly TextRequest[]): Promise<EmbeddedFonts>;
}

export interface TextEngineOptions {
  /** Faces available from the start (for example a font the caller loaded itself). */
  readonly faces?: readonly FontFaceData[];
  /** Fetches a bundled font file. Without it only `faces` are available. */
  readonly loadFont?: (file: FontFile) => Promise<Uint8Array | ArrayBuffer>;
  /** Imports one of MathJax's lazily loaded font modules by its package path. */
  readonly importMath?: (specifier: string) => Promise<unknown>;
  /** Fetches harfbuzz-subset.wasm, used by `embed`. */
  readonly loadSubsetter?: () => Promise<Uint8Array | ArrayBuffer>;
}

interface LoadedFace {
  readonly family: string;
  readonly weight: number;
  readonly upem: number;
  readonly font: HarfBuzz.Font;
  readonly coverage: ReadonlySet<number>;
  readonly ascender: number;
  readonly descender: number;
  readonly sfnt: Uint8Array;
}

type CjkKey = keyof typeof CJK_FAMILIES;

/** One place a character can come from, in fallback order. */
type Slot =
  | { readonly kind: 'face'; readonly entry: CatalogEntry }
  | { readonly kind: 'cjk'; readonly key: CjkKey; readonly weight: number }
  | { readonly kind: 'loaded'; readonly face: number };

interface CatalogEntry extends CatalogFace {
  readonly ranges32: Uint32Array;
}

const FALLBACK_FAMILIES = ['Inter', 'Vazirmatn', 'Noto Sans Hebrew'] as const;
const CATALOG: readonly CatalogEntry[] = FACES.map((face) => ({
  ...face,
  ranges32: parseRanges(face.ranges),
}));
/** Initial faces when bundled fonts are available: Latin covers most labels. */
const PRELOAD = ['inter-latin-400-normal.woff', 'inter-latin-500-normal.woff'];

const bidi = bidiFactory();

/**
 * Creates a text engine. With `loadFont`, the bundled catalog is available and the Latin Inter
 * faces are loaded up front; everything else loads on demand through `load`.
 * HarfBuzz is imported on first call, so importing this module stays cheap.
 */
export async function createTextEngine(options: TextEngineOptions): Promise<TextEngine> {
  const hb = await import('harfbuzzjs');
  const loaded: LoadedFace[] = [];
  const byFile = new Map<string, Promise<number | undefined>>();
  const cjkTables = new Map<CjkKey, Promise<CjkTable>>();
  const cjkReady = new Map<CjkKey, CjkTable>();
  let shapes = new Map<string, ShapedText>();
  let chains = new Map<string, readonly Slot[]>();
  const glyphPaths = new Map<string, readonly HarfBuzz.SvgPathCommand[]>();
  const fileOf = new Map<number, string>();
  /** Files that could not be fetched; the chain skips them. */
  const failed = new Set<string>();

  function addFace(family: string, weight: number, sfnt: Uint8Array): number {
    const face = new hb.Face(new hb.Blob(sfnt));
    const unicodes = face.collectUnicodes();
    if (unicodes.length === 0) {
      throw new Error(`Font ${family} ${weight} could not be read (no characters found).`);
    }
    const font = new hb.Font(face);
    const extents = font.hExtents();
    loaded.push({
      family,
      weight,
      upem: face.upem,
      font,
      coverage: new Set(unicodes),
      ascender: extents.ascender,
      descender: extents.descender,
      sfnt,
    });
    // New faces can change every shaping result and fallback chain.
    shapes = new Map();
    chains = new Map();
    return loaded.length - 1;
  }

  function loadFile(family: string, weight: number, file: FontFile): Promise<number | undefined> {
    const key = `${file.package}/${file.file}`;
    let pending = byFile.get(key);
    if (!pending) {
      const loadFont = options.loadFont;
      pending = loadFont
        ? (async () => {
            try {
              const raw = await loadFont(file);
              const index = addFace(
                family,
                weight,
                await toSfnt(raw instanceof Uint8Array ? raw : new Uint8Array(raw)),
              );
              fileOf.set(index, key);
              return index;
            } catch {
              // An unreachable font is reported as missing characters, not as a crash.
              failed.add(key);
              chains = new Map();
              shapes = new Map();
              return undefined;
            }
          })()
        : Promise.resolve(undefined);
      byFile.set(key, pending);
    }
    return pending;
  }

  const fileLoaded = (file: FontFile) => {
    for (const [index, key] of fileOf) if (key === `${file.package}/${file.file}`) return index;
    return undefined;
  };

  for (const source of options.faces ?? []) {
    const data = source.data instanceof Uint8Array ? source.data : new Uint8Array(source.data);
    addFace(source.family, source.weight, await toSfnt(data));
  }
  if (options.loadFont) {
    await Promise.all(
      CATALOG.filter((entry) => PRELOAD.includes(entry.file)).map((entry) =>
        loadFile(entry.family, entry.weight, entry),
      ),
    );
  }
  if (loaded.length === 0) throw new Error('createTextEngine needs fonts: pass faces or loadFont.');

  /** Nearest available weight of a family; ties go to the lighter one. */
  function nearestWeight(family: string, weight: number): number | undefined {
    const name = family.toLowerCase();
    const weights = new Set<number>();
    for (const face of loaded) if (face.family.toLowerCase() === name) weights.add(face.weight);
    if (options.loadFont) {
      for (const entry of CATALOG)
        if (entry.family.toLowerCase() === name) weights.add(entry.weight);
      if (Object.values(CJK_FAMILIES).some((c) => c.family.toLowerCase() === name)) {
        weights.add(400).add(500);
      }
    }
    let best: number | undefined;
    for (const w of weights) {
      if (best === undefined) best = w;
      const better = Math.abs(w - weight) - Math.abs(best - weight);
      if (better < 0 || (better === 0 && w < best)) best = w;
    }
    return best;
  }

  function chainFor(spec: FontSpec, cjk: CjkKey): readonly Slot[] {
    const key = `${spec.family}\u0000${spec.weight}\u0000${cjk}`;
    const cached = chains.get(key);
    if (cached) return cached;
    const order: CjkKey[] = [cjk, ...(['sc', 'jp', 'kr'] as const).filter((k) => k !== cjk)];
    const families = [
      ...new Set(
        [spec.family, loaded[0]!.family, ...FALLBACK_FAMILIES].map((f) => f.toLowerCase()),
      ),
    ];
    const slots: Slot[] = [];
    const seen = new Set<number>();
    for (const family of families) {
      const weight = nearestWeight(family, spec.weight);
      if (weight === undefined) continue;
      // Loaded faces first (in load order), then catalog faces not loaded yet.
      const fromCatalog = options.loadFont
        ? CATALOG.filter((e) => e.family.toLowerCase() === family && e.weight === weight)
        : [];
      for (const entry of fromCatalog) {
        if (failed.has(`${entry.package}/${entry.file}`)) continue;
        const index = fileLoaded(entry);
        if (index === undefined) slots.push({ kind: 'face', entry });
        else if (!seen.has(index)) {
          seen.add(index);
          slots.push({ kind: 'loaded', face: index });
        }
      }
      loaded.forEach((face, index) => {
        if (face.family.toLowerCase() !== family || face.weight !== weight || seen.has(index))
          return;
        seen.add(index);
        slots.push({ kind: 'loaded', face: index });
      });
    }
    if (options.loadFont) {
      for (const key of order) {
        const weight = nearestWeight(CJK_FAMILIES[key].family, spec.weight) ?? 400;
        slots.push({ kind: 'cjk', key, weight });
      }
    }
    chains.set(key, slots);
    return slots;
  }

  function cjkFile(key: CjkKey, slice: number, weight: number): FontFile {
    const family = CJK_FAMILIES[key];
    return { package: family.package, file: `${family.prefix}-${slice}-${weight}-normal.woff` };
  }

  /**
   * The loaded face for a character, or 'pending' when the first face in the chain that may cover
   * it is not loaded yet (a later, already loaded face must not win over it), or undefined.
   */
  function faceFor(code: number, chain: readonly Slot[]): number | 'pending' | undefined {
    for (const slot of chain) {
      if (slot.kind === 'loaded') {
        if (loaded[slot.face]!.coverage.has(code)) return slot.face;
      } else if (slot.kind === 'face') {
        if (inRanges(slot.entry.ranges32, code)) return 'pending';
      } else if (isCjk(code)) {
        const table = cjkReady.get(slot.key);
        if (!table) return 'pending';
        const slice = table.sliceOf(code);
        if (slice === undefined) continue;
        const file = cjkFile(slot.key, slice, slot.weight);
        if (failed.has(`${file.package}/${file.file}`)) continue;
        const index = fileLoaded(file);
        if (index === undefined) return 'pending';
        if (loaded[index]!.coverage.has(code)) return index;
      }
    }
    return undefined;
  }

  function cjkTable(key: CjkKey): Promise<CjkTable> {
    let table = cjkTables.get(key);
    if (!table) {
      table = importCjk(key).then((slices) => {
        const ready = new CjkTable(slices);
        cjkReady.set(key, ready);
        chains = new Map();
        shapes = new Map();
        return ready;
      });
      cjkTables.set(key, table);
    }
    return table;
  }

  async function load(requests: readonly TextRequest[]): Promise<boolean> {
    const before = loaded.length + cjkReady.size;
    for (const request of requests) {
      const chain = () => chainFor(request.font, cjkKeyOf(request.text));
      for (const code of new Set(codePoints(request.text))) {
        if (typeof faceFor(code, chain()) === 'number') continue;
        for (const slot of chain()) {
          if (slot.kind === 'face' && inRanges(slot.entry.ranges32, code)) {
            const index = await loadFile(slot.entry.family, slot.entry.weight, slot.entry);
            if (index !== undefined && loaded[index]!.coverage.has(code)) break;
          } else if (slot.kind === 'cjk' && isCjk(code)) {
            const slice = (await cjkTable(slot.key)).sliceOf(code);
            if (slice === undefined) continue;
            const family = CJK_FAMILIES[slot.key].family;
            const index = await loadFile(
              family,
              slot.weight,
              cjkFile(slot.key, slice, slot.weight),
            );
            if (index !== undefined && loaded[index]!.coverage.has(code)) break;
          } else if (slot.kind === 'loaded' && loaded[slot.face]!.coverage.has(code)) break;
        }
      }
    }
    return loaded.length + cjkReady.size > before;
  }

  interface Run {
    face: number;
    level: number;
    text: string;
  }

  /** Splits text into runs of one face and one bidi level, in logical order. */
  function itemize(text: string, spec: FontSpec) {
    const chain = chainFor(spec, cjkKeyOf(text));
    const primary =
      chain.find((s): s is Extract<Slot, { kind: 'loaded' }> => s.kind === 'loaded')?.face ?? 0;
    const { levels, paragraphs } = bidi.getEmbeddingLevels(text);
    const runs: Run[] = [];
    const missing = new Set<string>();
    const pending = new Set<string>();
    for (let i = 0; i < text.length;) {
      const code = text.codePointAt(i)!;
      const char = String.fromCodePoint(code);
      const level = levels[i] ?? 0;
      const last = runs.at(-1);
      // Marks, joiners, spaces and punctuation stay with the run before them when its face has
      // them, so a word is never split between fonts (for example ZWNJ inside a Persian word).
      let face: number;
      if (
        last &&
        last.level === level &&
        !STRONG.test(char) &&
        loaded[last.face]!.coverage.has(code)
      ) {
        face = last.face;
      } else {
        const found = faceFor(code, chain);
        if (typeof found === 'number') face = found;
        else {
          (found === 'pending' ? pending : missing).add(char);
          face = last?.face ?? primary;
        }
      }
      if (last && last.face === face && last.level === level) last.text += char;
      else runs.push({ face, level, text: char });
      i += char.length;
    }
    const baseLevel = paragraphs[0]?.level ?? 0;
    const direction: 'ltr' | 'rtl' = baseLevel % 2 === 1 ? 'rtl' : 'ltr';
    return { runs, missing, pending, direction, primary };
  }

  function shape(text: string, spec: FontSpec, size: number): ShapedText {
    const key = `${spec.family}\u0000${spec.weight}\u0000${size}\u0000${text}`;
    const cached = shapes.get(key);
    if (cached) return cached;

    const { runs, missing, pending, direction, primary } = itemize(text, spec);
    const shapedRuns = runs.map((run) => {
      const face = loaded[run.face]!;
      const scale = size / face.upem;
      const buffer = new hb.Buffer();
      buffer.addText(run.text);
      buffer.setDirection(run.level % 2 === 1 ? hb.Direction.RTL : hb.Direction.LTR);
      buffer.guessSegmentProperties();
      hb.shape(face.font, buffer);
      // HarfBuzz returns glyphs in visual order for both directions.
      const positions = buffer.getGlyphPositions();
      const glyphs = buffer.getGlyphInfos().map((info, i) => {
        const p = positions[i]!;
        return {
          glyph: info.codepoint,
          dx: p.xOffset * scale,
          dy: -p.yOffset * scale,
          advance: p.xAdvance * scale,
        };
      });
      return { face: run.face, level: run.level, glyphs };
    });

    const glyphs: ShapedGlyph[] = [];
    let x = 0;
    for (const run of visualOrder(shapedRuns)) {
      for (const g of run.glyphs) {
        glyphs.push({ face: run.face, glyph: g.glyph, x: x + g.dx, y: g.dy });
        x += g.advance;
      }
    }

    const main = loaded[primary]!;
    const shaped: ShapedText = {
      text,
      font: { family: spec.family, weight: spec.weight },
      size,
      direction,
      width: x,
      ascent: (main.ascender * size) / main.upem,
      descent: (-main.descender * size) / main.upem,
      glyphs,
      missing: [...missing],
      pending: [...pending],
    };
    shapes.set(key, shaped);
    return shaped;
  }

  function commandsFor(face: number, glyph: number): readonly HarfBuzz.SvgPathCommand[] {
    const key = `${face}:${glyph}`;
    let commands = glyphPaths.get(key);
    if (!commands) {
      commands = loaded[face]!.font.glyphToJson(glyph);
      glyphPaths.set(key, commands);
    }
    return commands;
  }

  function outline(shaped: ShapedText, x: number, y: number): string {
    let d = '';
    for (const glyph of shaped.glyphs) {
      const face = loaded[glyph.face]!;
      const scale = shaped.size / face.upem;
      const ox = x + glyph.x;
      const oy = y + glyph.y;
      for (const command of commandsFor(glyph.face, glyph.glyph)) {
        d += command.type;
        const values = command.values;
        for (let i = 0; i + 1 < values.length; i += 2) {
          // Font units point up; SVG points down.
          d += `${i > 0 ? ' ' : ''}${num(ox + values[i]! * scale)} ${num(oy - values[i + 1]! * scale)}`;
        }
      }
    }
    return d;
  }

  // ---- math ----
  let mathRenderer: Promise<MathRenderer> | undefined;
  const formulas = new Map<string, MathResult>();

  async function loadMath(tex: readonly string[]): Promise<boolean> {
    const todo = [...new Set(tex)].filter((t) => !formulas.has(t));
    if (todo.length === 0) return false;
    mathRenderer ??= createMathRenderer(
      options.importMath ?? ((specifier) => import(/* @vite-ignore */ specifier)),
    );
    const render = await mathRenderer;
    for (const t of todo) formulas.set(t, await render(t));
    return true;
  }

  // ---- embedding ----
  let subsetter: Promise<Subsetter> | undefined;

  async function embed(requests: readonly TextRequest[]): Promise<EmbeddedFonts> {
    const used = new Map<number, Set<number>>();
    const order = new Map<string, number[]>();
    for (const request of requests) {
      const { runs } = itemize(request.text, request.font);
      const key = `${request.font.family} ${request.font.weight}`;
      const faces = order.get(key) ?? [];
      order.set(key, faces);
      for (const run of runs) {
        const set = used.get(run.face) ?? new Set<number>();
        used.set(run.face, set);
        for (const code of codePoints(run.text)) set.add(code);
        if (!faces.includes(run.face)) faces.push(run.face);
      }
    }
    if (used.size === 0) return { faces: [], stacks: {} };
    const load = options.loadSubsetter;
    if (!load) throw new Error('Embedding fonts needs loadSubsetter.');
    subsetter ??= load().then(createSubsetter);
    const subset = await subsetter;
    // Fonts load in parallel, so load order is a race: name them by a stable key instead (the
    // bundled file, or the order faces were given in), so output never depends on timing.
    const stable = (face: number) => fileOf.get(face) ?? `\u0000${String(face).padStart(6, '0')}`;
    const indices = [...used.keys()].sort((a, b) =>
      stable(a) < stable(b) ? -1 : stable(a) > stable(b) ? 1 : 0,
    );
    const name = (face: number) => `font-${indices.indexOf(face)}`;
    const faces = indices.map((face): EmbeddedFace => {
      const bytes = subset(loaded[face]!.sfnt, used.get(face)!);
      const cff = bytes[0] === 0x4f && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4f;
      return { key: name(face), type: cff ? 'font/otf' : 'font/ttf', data: base64Encode(bytes) };
    });
    const stacks: Record<string, string[]> = {};
    const rank = (face: number) => indices.indexOf(face);
    for (const [key, list] of order)
      stacks[key] = [...list].sort((a, b) => rank(a) - rank(b)).map(name);
    return { faces, stacks };
  }

  return {
    shape,
    outline,
    load,
    loadMath,
    math: (tex) => formulas.get(tex),
    embed,
  };
}

/** Letters and numbers pick their own face; everything else may stay with the previous run. */
const STRONG = /[\p{L}\p{N}]/u;

function* codePoints(text: string): Generator<number> {
  for (const char of text) yield char.codePointAt(0)!;
}

/** UAX #9 rule L2: from the highest level down to the lowest odd one, reverse runs at or above it. */
function visualOrder<T extends { level: number }>(runs: readonly T[]): T[] {
  const result = [...runs];
  if (result.length < 2) return result;
  const levels = result.map((r) => r.level);
  const highest = Math.max(...levels);
  const lowestOdd = Math.min(...levels.filter((l) => l % 2 === 1), highest + 1);
  for (let level = highest; level >= lowestOdd; level--) {
    for (let i = 0; i < result.length;) {
      if (result[i]!.level < level) {
        i++;
        continue;
      }
      let j = i;
      while (j < result.length && result[j]!.level >= level) j++;
      result.splice(i, j - i, ...result.slice(i, j).reverse());
      i = j;
    }
  }
  return result;
}

function parseRanges(text: string): Uint32Array {
  const pairs: number[] = [];
  for (const part of text.split(',')) {
    const [start, end] = part.split('-');
    const a = parseInt(start!, 16);
    pairs.push(a, end === undefined ? a : parseInt(end, 16));
  }
  return Uint32Array.from(pairs);
}

function inRanges(ranges: Uint32Array, code: number): boolean {
  for (let i = 0; i < ranges.length; i += 2) {
    if (code >= ranges[i]! && code <= ranges[i + 1]!) return true;
  }
  return false;
}

/** Blocks the CJK slices cover: Han, kana, Hangul, CJK symbols and full-width forms. */
function isCjk(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7ff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x20000 && code <= 0x3134f)
  );
}

/** Han characters look different per language: kana means Japanese, Hangul Korean, else Chinese. */
function cjkKeyOf(text: string): CjkKey {
  if (/[぀-ヿㇰ-ㇿ]/.test(text)) return 'jp';
  if (/[ᄀ-ᇿ㄰-㆏가-힯]/.test(text)) return 'kr';
  return 'sc';
}

class CjkTable {
  /** Sorted [start, end, slice] triples. */
  readonly #entries: Uint32Array;

  constructor(slices: string) {
    const triples: [number, number, number][] = [];
    for (const entry of slices.split(';')) {
      const [slice, ranges] = entry.split(':');
      const pairs = parseRanges(ranges!);
      for (let i = 0; i < pairs.length; i += 2)
        triples.push([pairs[i]!, pairs[i + 1]!, Number(slice)]);
    }
    triples.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    this.#entries = Uint32Array.from(triples.flat());
  }

  sliceOf(code: number): number | undefined {
    const e = this.#entries;
    let lo = 0;
    let hi = e.length / 3 - 1;
    // Last range starting at or before code.
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (e[mid * 3]! <= code) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    // Ranges can overlap across slices, so scan back over ranges that may still contain code.
    for (let i = found; i >= 0 && i > found - 64; i--) {
      if (code <= e[i * 3 + 1]!) return e[i * 3 + 2];
    }
    return undefined;
  }
}

async function importCjk(key: CjkKey): Promise<string> {
  switch (key) {
    case 'sc':
      return (await import('./catalog/cjk-sc.ts')).SLICES;
    case 'jp':
      return (await import('./catalog/cjk-jp.ts')).SLICES;
    case 'kr':
      return (await import('./catalog/cjk-kr.ts')).SLICES;
  }
}

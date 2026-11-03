// Text shaping, measuring and outlining with HarfBuzz (WASM). The same bundled fonts and the same
// shaper run in Node and in browsers, so layout and outlines are identical in both.

import type * as HarfBuzz from 'harfbuzzjs';
import { num } from '../util/format.ts';
import { toSfnt } from './woff.ts';

export interface FontSpec {
  readonly family: string;
  readonly weight: number;
}

export interface FontFaceData extends FontSpec {
  /** Raw font file (TTF, OTF or WOFF). */
  readonly data: Uint8Array | ArrayBuffer;
}

export interface ShapedGlyph {
  /** Index of the face (in the list given to createTextEngine) that provides this glyph. */
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
  /** Advance width in px. */
  readonly width: number;
  /** Distance from baseline to the top and bottom of the line box, in px (both positive). */
  readonly ascent: number;
  readonly descent: number;
  readonly glyphs: readonly ShapedGlyph[];
  /** Characters no bundled face covers; they render as the font's missing-glyph box. */
  readonly missing: readonly string[];
}

export interface TextEngine {
  shape(text: string, font: FontSpec, size: number): ShapedText;
  /** SVG path data for shaped text whose baseline starts at (x, y). */
  outline(shaped: ShapedText, x: number, y: number): string;
}

interface LoadedFace {
  readonly family: string;
  readonly weight: number;
  readonly upem: number;
  readonly font: HarfBuzz.Font;
  readonly coverage: ReadonlySet<number>;
  readonly ascender: number;
  readonly descender: number;
}

/**
 * Creates a text engine over the given faces. Faces with the same family and weight form a
 * fallback chain (for example Latin, Latin Extended and Greek subsets of one font).
 * HarfBuzz is loaded on first call, so importing this module stays cheap.
 */
export async function createTextEngine(faces: readonly FontFaceData[]): Promise<TextEngine> {
  if (faces.length === 0) throw new Error('createTextEngine needs at least one font face.');
  const hb = await import('harfbuzzjs');
  const files = await Promise.all(
    faces.map((source) =>
      toSfnt(source.data instanceof Uint8Array ? source.data : new Uint8Array(source.data)),
    ),
  );

  const loaded: LoadedFace[] = faces.map((source, i) => {
    const face = new hb.Face(new hb.Blob(files[i]!));
    if (face.collectUnicodes().length === 0) {
      throw new Error(
        `Font ${source.family} ${source.weight} could not be read (no characters found).`,
      );
    }
    const font = new hb.Font(face);
    const extents = font.hExtents();
    return {
      family: source.family,
      weight: source.weight,
      upem: face.upem,
      font,
      coverage: new Set(face.collectUnicodes()),
      ascender: extents.ascender,
      descender: extents.descender,
    };
  });

  const chains = new Map<string, readonly number[]>();
  const shapes = new Map<string, ShapedText>();
  const glyphPaths = new Map<string, readonly HarfBuzz.SvgPathCommand[]>();

  function chainFor(spec: FontSpec): readonly number[] {
    const key = `${spec.family}\u0000${spec.weight}`;
    const cached = chains.get(key);
    if (cached) return cached;
    const family = spec.family.toLowerCase();
    let candidates = loaded
      .map((_, i) => i)
      .filter((i) => loaded[i]!.family.toLowerCase() === family);
    if (candidates.length === 0)
      candidates = loaded.map((_, i) => i).filter((i) => loaded[i]!.family === loaded[0]!.family);
    // Nearest available weight; ties go to the lighter one.
    let weight = loaded[candidates[0]!]!.weight;
    for (const i of candidates) {
      const w = loaded[i]!.weight;
      const better = Math.abs(w - spec.weight) - Math.abs(weight - spec.weight);
      if (better < 0 || (better === 0 && w < weight)) weight = w;
    }
    const chain = candidates.filter((i) => loaded[i]!.weight === weight);
    chains.set(key, chain);
    return chain;
  }

  function shape(text: string, spec: FontSpec, size: number): ShapedText {
    const key = `${spec.family}\u0000${spec.weight}\u0000${size}\u0000${text}`;
    const cached = shapes.get(key);
    if (cached) return cached;

    const chain = chainFor(spec);
    const primary = chain[0]!;

    // Split the text into runs that one face can draw, then shape each run with HarfBuzz.
    const runs: { face: number; text: string }[] = [];
    const missing = new Set<string>();
    for (const char of text) {
      const code = char.codePointAt(0)!;
      let face = chain.find((i) => loaded[i]!.coverage.has(code));
      if (face === undefined) {
        missing.add(char);
        face = primary;
      }
      const last = runs.at(-1);
      if (last && last.face === face) last.text += char;
      else runs.push({ face, text: char });
    }

    const glyphs: ShapedGlyph[] = [];
    let x = 0;
    for (const run of runs) {
      const face = loaded[run.face]!;
      const scale = size / face.upem;
      const buffer = new hb.Buffer();
      buffer.addText(run.text);
      buffer.guessSegmentProperties();
      hb.shape(face.font, buffer);
      const infos = buffer.getGlyphInfos();
      const positions = buffer.getGlyphPositions();
      infos.forEach((info, i) => {
        const p = positions[i]!;
        glyphs.push({
          face: run.face,
          glyph: info.codepoint,
          x: x + p.xOffset * scale,
          y: -p.yOffset * scale,
        });
        x += p.xAdvance * scale;
      });
    }

    const main = loaded[primary]!;
    const shaped: ShapedText = {
      text,
      font: { family: spec.family, weight: spec.weight },
      size,
      width: x,
      ascent: (main.ascender * size) / main.upem,
      descent: (-main.descender * size) / main.upem,
      glyphs,
      missing: [...missing],
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

  return { shape, outline };
}

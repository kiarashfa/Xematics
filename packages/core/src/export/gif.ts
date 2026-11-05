// Animated GIF writer (GIF89a). Diagrams use few colors, so one palette for the whole animation,
// built from the frames' own colors, looks clean without dithering. Transparent pixels are laid on
// white. Pure and deterministic: the same frames always give the same bytes.

export interface GifOptions {
  readonly width: number;
  readonly height: number;
  /** Time each frame shows, in milliseconds (GIF stores hundredths of a second). */
  readonly delay: number;
  /** Repeat forever (default) or play once. */
  readonly loop?: boolean;
}

const BUCKETS = 1 << 15; // 5 bits per channel

class ByteWriter {
  private chunks: Uint8Array[] = [];
  private current = new Uint8Array(1 << 16);
  private length = 0;
  byte(value: number): void {
    if (this.length === this.current.length) {
      this.chunks.push(this.current);
      this.current = new Uint8Array(1 << 16);
      this.length = 0;
    }
    this.current[this.length++] = value & 0xff;
  }
  word(value: number): void {
    this.byte(value);
    this.byte(value >> 8);
  }
  bytes(values: ArrayLike<number>): void {
    for (let i = 0; i < values.length; i++) this.byte(values[i]!);
  }
  text(value: string): void {
    for (let i = 0; i < value.length; i++) this.byte(value.charCodeAt(i));
  }
  result(): Uint8Array {
    const parts = [...this.chunks, this.current.subarray(0, this.length)];
    const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/** A pixel laid on white, as [r, g, b]. */
function opaque(rgba: Uint8Array, i: number): [number, number, number] {
  const a = rgba[i + 3]!;
  if (a === 255) return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!];
  const blend = (c: number) => Math.round((c * a + 255 * (255 - a)) / 255);
  return [blend(rgba[i]!), blend(rgba[i + 1]!), blend(rgba[i + 2]!)];
}

const bucketOf = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/** Up to 256 colors: the most used 5-bit buckets over the frames, each its average color. */
function buildPalette(frames: readonly Uint8Array[]): { palette: Uint8Array; size: number } {
  const count = new Float64Array(BUCKETS);
  const sum = new Float64Array(BUCKETS * 3);
  for (let f = 0; f < frames.length; f++) {
    const rgba = frames[f]!;
    for (let i = 0; i < rgba.length; i += 4) {
      const [r, g, b] = opaque(rgba, i);
      const k = bucketOf(r, g, b);
      count[k]!++;
      sum[k * 3] = sum[k * 3]! + r;
      sum[k * 3 + 1] = sum[k * 3 + 1]! + g;
      sum[k * 3 + 2] = sum[k * 3 + 2]! + b;
    }
  }
  const used: number[] = [];
  for (let k = 0; k < BUCKETS; k++) if (count[k]! > 0) used.push(k);
  used.sort((a, b) => count[b]! - count[a]! || a - b);
  const palette = new Uint8Array(256 * 3);
  const chosen = used.slice(0, 256);
  chosen.forEach((k, i) => {
    for (let c = 0; c < 3; c++) palette[i * 3 + c] = Math.round(sum[k * 3 + c]! / count[k]!);
  });
  return { palette, size: chosen.length };
}

function indexer(palette: Uint8Array, size: number): (r: number, g: number, b: number) => number {
  const cache = new Int16Array(BUCKETS).fill(-1);
  return (r, g, b) => {
    const k = bucketOf(r, g, b);
    const hit = cache[k]!;
    if (hit >= 0) return hit;
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < size; i++) {
      const dr = palette[i * 3]! - r;
      const dg = palette[i * 3 + 1]! - g;
      const db = palette[i * 3 + 2]! - b;
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    cache[k] = best;
    return best;
  };
}

/** GIF's LZW with an 8-bit start, packed into 255-byte sub-blocks. */
function lzw(indices: Uint8Array, out: ByteWriter): void {
  const MIN = 8;
  const CLEAR = 1 << MIN;
  const END = CLEAR + 1;
  out.byte(MIN);
  const block: number[] = [];
  let bits = 0;
  let buffer = 0;
  const flush = () => {
    if (block.length === 0) return;
    out.byte(block.length);
    out.bytes(block);
    block.length = 0;
  };
  let size = MIN + 1;
  const emit = (code: number) => {
    buffer |= code << bits;
    bits += size;
    while (bits >= 8) {
      block.push(buffer & 0xff);
      buffer >>>= 8;
      bits -= 8;
      if (block.length === 255) flush();
    }
  };
  let table = new Map<number, number>();
  let next = END + 1;
  emit(CLEAR);
  let prefix = indices[0]!;
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i]!;
    const key = (prefix << 8) | c;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      table.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      emit(CLEAR);
      table = new Map();
      next = END + 1;
      size = MIN + 1;
    }
    prefix = c;
  }
  emit(prefix);
  emit(END);
  if (bits > 0) block.push(buffer & 0xff);
  flush();
  out.byte(0);
}

/**
 * Writes an animated GIF one frame at a time, so long animations never hold every frame in
 * memory. The palette comes from `samples`, a few representative frames.
 */
export class GifWriter {
  readonly #options: GifOptions;
  readonly #out = new ByteWriter();
  readonly #nearest: (r: number, g: number, b: number) => number;
  readonly #indices: Uint8Array;
  readonly #delay: number;
  #frames = 0;

  constructor(options: GifOptions, samples: readonly Uint8Array[]) {
    this.#options = options;
    const { width, height } = options;
    if (samples.length === 0) throw new Error('A GIF palette needs at least one sample frame.');
    samples.forEach((frame) => this.#check(frame));
    const { palette, size } = buildPalette(samples);
    this.#nearest = indexer(palette, size);
    this.#indices = new Uint8Array(width * height);
    this.#delay = Math.max(2, Math.round(options.delay / 10));
    const out = this.#out;
    out.text('GIF89a');
    out.word(width);
    out.word(height);
    out.byte(0xf7); // global color table of 256 entries, 8 bits per channel
    out.byte(0);
    out.byte(0);
    out.bytes(palette);
    if (options.loop !== false) {
      out.bytes([0x21, 0xff, 11]);
      out.text('NETSCAPE2.0');
      out.bytes([3, 1, 0, 0, 0]);
    }
  }

  #check(frame: Uint8Array): void {
    if (frame.length !== this.#options.width * this.#options.height * 4) {
      throw new Error('Frame size does not match.');
    }
  }

  add(rgba: Uint8Array): void {
    this.#check(rgba);
    const { width, height } = this.#options;
    const indices = this.#indices;
    for (let p = 0, i = 0; p < indices.length; p++, i += 4) {
      const [r, g, b] = opaque(rgba, i);
      indices[p] = this.#nearest(r, g, b);
    }
    const out = this.#out;
    out.bytes([0x21, 0xf9, 4, 0x04, this.#delay & 0xff, this.#delay >> 8, 0, 0]); // keep frame
    out.byte(0x2c);
    out.word(0);
    out.word(0);
    out.word(width);
    out.word(height);
    out.byte(0);
    lzw(indices, out);
    this.#frames++;
  }

  finish(): Uint8Array {
    if (this.#frames === 0) throw new Error('A GIF needs at least one frame.');
    this.#out.byte(0x3b);
    return this.#out.result();
  }
}

/** Encodes RGBA frames (width × height × 4 bytes each) as an animated GIF. */
export function encodeGif(frames: readonly Uint8Array[], options: GifOptions): Uint8Array {
  const step = Math.max(1, Math.floor(frames.length / 24));
  const writer = new GifWriter(
    options,
    frames.filter((_, i) => i % step === 0),
  );
  for (const frame of frames) writer.add(frame);
  return writer.finish();
}

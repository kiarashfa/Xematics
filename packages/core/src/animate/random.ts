// Seeded numbers for animations and the weights style. Only integer math (Math.imul, shifts), so
// every JavaScript engine produces the same sequence and exports stay byte-identical.

/** mulberry32: a small seeded generator returning numbers in [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string, so every scene id gets its own stable stream of numbers. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface EdgeWeight {
  /** Small random weight at the start of training. */
  readonly start: number;
  /** The weight the network ends up with: mostly weak, a few strong, in [-1, 1]. */
  readonly learned: number;
  /** More numbers from the same stream (for wobble while training). */
  readonly next: () => number;
}

export function edgeWeight(id: string): EdgeWeight {
  const next = seeded(hash(id));
  const u = next() * 2 - 1;
  const learned = Math.sign(u) * u * u * u * u;
  const start = (next() * 2 - 1) * 0.12;
  return { start, learned, next };
}

/** How a connection with weight w is drawn: sign picks the color, strength the opacity and width. */
export function weightPaint(
  w: number,
  positive: string,
  negative: string,
): { stroke: string; opacity: number; strokeWidth: number } {
  const s = Math.min(1, Math.abs(w));
  return {
    stroke: w >= 0 ? positive : negative,
    opacity: Math.round((0.05 + 0.92 * s) * 1000) / 1000,
    strokeWidth: Math.round((0.45 + 2.3 * s) * 100) / 100,
  };
}

/** Linear blend of two #rrggbb colors (t = 0 gives a, t = 1 gives b). */
export function mixColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1, 7);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const [x, y] = [parse(a), parse(b)];
  return `#${x
    .map((v, i) =>
      Math.round(v + (y[i]! - v) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

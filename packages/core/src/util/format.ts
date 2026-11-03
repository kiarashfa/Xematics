/**
 * Formats a coordinate for SVG output: at most two decimals, no trailing zeros, never "-0".
 * Fixed precision keeps output byte-identical across JavaScript engines.
 */
export function num(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Cannot format non-finite number ${value}.`);
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

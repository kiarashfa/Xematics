// Font names the TikZ export accepts, in a module of its own so pages that only check a setting
// do not load the exporter.

export const TIKZ_FONT_NAME = /^[\p{L}\p{N} ._-]{1,64}$/u;

/** True for a font name renderTikz accepts (letters, digits, spaces, '.', '_' and '-'). */
export function isTikzFont(name: string): boolean {
  return TIKZ_FONT_NAME.test(name);
}

// Mounts renderer output without innerHTML: the SVG is parsed as XML, reduced to the element and
// attribute kinds the renderer emits, and imported as nodes. The renderer already escapes all
// text; this is a second line of defense for content that comes from untrusted input.

const ELEMENTS = new Set(['svg', 'g', 'title', 'desc', 'rect', 'circle', 'line', 'path', 'text']);
const ATTRIBUTE =
  /^(?:xmlns|id|class|role|aria-[a-z]+|width|height|viewBox|x|y|x1|y1|x2|y2|cx|cy|r|rx|d|fill|stroke|stroke-width|opacity|font-family|font-size|font-weight|text-anchor|direction)$/;

export function parseSafeSvg(markup: string): SVGSVGElement | undefined {
  if (!markup) return undefined;
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length > 0)
    return undefined;
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (!ELEMENTS.has(element.localName)) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      if (!ATTRIBUTE.test(attribute.name)) element.removeAttribute(attribute.name);
    }
  }
  return document.importNode(root, true) as unknown as SVGSVGElement;
}

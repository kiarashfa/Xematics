import type { Paint, Scene, SceneItem } from '../scene.ts';
import type { EmbeddedFonts } from '../text/engine.ts';
import { CSS_FONT_STACKS } from '../text/fonts.ts';
import { num } from '../util/format.ts';
import { escapeXml } from '../util/xml.ts';

export interface SvgOptions {
  /** 'outline' (default) draws text as paths so it looks identical everywhere; 'live' keeps editable text. */
  readonly text?: 'outline' | 'live';
  /** Prefix for every id and class, so several diagrams can share one HTML page. Default 'xm-'. */
  readonly prefix?: string;
  /** Font subsets to embed for live text (from TextEngine.embed). */
  readonly fonts?: EmbeddedFonts;
}

const PREFIX_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Renders a scene to a standalone, script-free SVG document. */
export function renderSvg(scene: Scene, options: SvgOptions = {}): string {
  const mode = options.text ?? 'outline';
  const prefix = options.prefix ?? 'xm-';
  if (prefix !== '' && !PREFIX_PATTERN.test(prefix)) {
    throw new Error(
      `Invalid id prefix '${prefix}'. Use letters, digits, '_' or '-', starting with a letter.`,
    );
  }

  const children = new Map<string | undefined, SceneItem[]>();
  for (const item of scene.items) {
    const siblings = children.get(item.parent);
    if (siblings) siblings.push(item);
    else children.set(item.parent, [item]);
  }

  const w = num(scene.width);
  const h = num(scene.height);
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${prefix}title ${prefix}desc">`,
    `  <title id="${prefix}title">${escapeXml(scene.title)}</title>`,
    `  <desc id="${prefix}desc">${escapeXml(scene.description)}</desc>`,
  ];
  const fonts = mode === 'live' ? options.fonts : undefined;
  if (fonts && fonts.faces.length > 0) {
    const rules = fonts.faces.map(
      (face) =>
        `@font-face{font-family:'${prefix}${face.key}';src:url(data:${face.type};base64,${face.data})}`,
    );
    out.push(`  <defs><style>${rules.join('')}</style></defs>`);
  }
  if (scene.background !== null) {
    out.push(
      `  <rect id="${prefix}background" width="${w}" height="${h}" fill="${escapeXml(scene.background)}"/>`,
    );
  }

  const emit = (item: SceneItem, depth: number, paintOnParent: boolean): void => {
    const pad = '  '.repeat(depth);
    const attrs = [`id="${prefix}${item.id}"`];
    if (item.classes && item.classes.length > 0) {
      attrs.push(`class="${item.classes.map((c) => escapeXml(prefix + c)).join(' ')}"`);
    }

    if (item.kind === 'group') {
      const kids = children.get(item.id) ?? [];
      const shared = sharedPaint(kids);
      if (shared) attrs.push(...paintAttrs(shared));
      if (kids.length === 0) {
        out.push(`${pad}<g ${attrs.join(' ')}/>`);
        return;
      }
      out.push(`${pad}<g ${attrs.join(' ')}>`);
      for (const kid of kids) emit(kid, depth + 1, shared !== undefined);
      out.push(`${pad}</g>`);
      return;
    }

    const paint = paintOnParent ? [] : paintAttrs(item.paint);
    switch (item.kind) {
      case 'circle':
        out.push(
          `${pad}<circle ${[...attrs, `cx="${num(item.cx)}"`, `cy="${num(item.cy)}"`, `r="${num(item.r)}"`, ...paint].join(' ')}/>`,
        );
        return;
      case 'rect': {
        const rx = item.rx === undefined ? [] : [`rx="${num(item.rx)}"`];
        out.push(
          `${pad}<rect ${[...attrs, `x="${num(item.x)}"`, `y="${num(item.y)}"`, `width="${num(item.width)}"`, `height="${num(item.height)}"`, ...rx, ...paint].join(' ')}/>`,
        );
        return;
      }
      case 'line':
        out.push(
          `${pad}<line ${[...attrs, `x1="${num(item.x1)}"`, `y1="${num(item.y1)}"`, `x2="${num(item.x2)}"`, `y2="${num(item.y2)}"`, ...paint].join(' ')}/>`,
        );
        return;
      case 'math':
        // Formulas are always outlines; the TeX source stays in the scene for other exporters.
        out.push(
          `${pad}<path ${[...attrs, `d="${escapeXml(item.outline)}"`, ...paint].join(' ')}/>`,
        );
        return;
      case 'path':
        out.push(
          `${pad}<path ${[...attrs, `d="${escapeXml(roundPath(item.d))}"`, ...paint].join(' ')}/>`,
        );
        return;
      case 'text': {
        if (mode === 'outline') {
          out.push(
            `${pad}<path ${[...attrs, `d="${escapeXml(item.outline)}"`, ...paint].join(' ')}/>`,
          );
          return;
        }
        const font = [
          `font-family="${escapeXml(fontFamily(item.font, prefix, fonts))}"`,
          `font-size="${num(item.font.size)}"`,
          `font-weight="${item.font.weight}"`,
        ];
        const anchor = item.anchor === 'start' ? [] : [`text-anchor="${item.anchor}"`];
        const direction = item.direction === 'rtl' ? ['direction="rtl"'] : [];
        out.push(
          `${pad}<text ${[...attrs, `x="${num(item.x)}"`, `y="${num(item.y)}"`, ...anchor, ...direction, ...font, ...paint].join(' ')}>${escapeXml(item.text)}</text>`,
        );
        return;
      }
    }
  };

  for (const item of children.get(undefined) ?? []) emit(item, 1, false);
  out.push('</svg>');
  return `${out.join('\n')}\n`;
}

function fontFamily(
  font: { readonly family: string; readonly weight: number },
  prefix: string,
  fonts: EmbeddedFonts | undefined,
): string {
  const fallback = CSS_FONT_STACKS[font.family] ?? font.family;
  const embedded = fonts?.stacks[`${font.family} ${font.weight}`];
  if (!embedded || embedded.length === 0) return fallback;
  return [...embedded.map((key) => `'${prefix}${key}'`), fallback].join(', ');
}

function paintAttrs(paint: Paint): string[] {
  const attrs: string[] = [];
  if (paint.fill !== undefined) attrs.push(`fill="${escapeXml(paint.fill)}"`);
  if (paint.stroke !== undefined) attrs.push(`stroke="${escapeXml(paint.stroke)}"`);
  if (paint.strokeWidth !== undefined) attrs.push(`stroke-width="${num(paint.strokeWidth)}"`);
  if (paint.opacity !== undefined) attrs.push(`opacity="${num(paint.opacity)}"`);
  return attrs;
}

const paintKey = (p: Paint) => `${p.fill}|${p.stroke}|${p.strokeWidth}|${p.opacity}`;

/** When every child of a group is a leaf with the same paint, the paint moves to the group. */
function sharedPaint(kids: readonly SceneItem[]): Paint | undefined {
  const first = kids[0];
  if (!first || first.kind === 'group') return undefined;
  const key = paintKey(first.paint);
  return kids.every((kid) => kid.kind !== 'group' && paintKey(kid.paint) === key)
    ? first.paint
    : undefined;
}

/** Rounds every number in layout-built path data to the output precision. */
function roundPath(d: string): string {
  return d.replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g, (n) => num(Number(n)));
}

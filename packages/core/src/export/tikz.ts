// TikZ export: rebuilds a laid-out scene as readable LaTeX. Positions are the layout's own (in px,
// scaled to pt like the PDF), so the figure matches the SVG; every neuron is a named node and edges
// connect nodes by name, so the code is easy to restyle by hand.
//
// Safety: label text is escaped. Formulas pass through as LaTeX only when they are scene math
// items, that is, when MathJax accepted them with its base and AMS packages (no \input, \write,
// \def or similar); anything else is already plain text in the scene and gets escaped.

import type { MathItem, Paint, Scene, SceneItem, TextItem } from '../scene.ts';

export interface TikzOptions {
  /** A complete document for the standalone class (default), or only the tikzpicture. */
  readonly standalone?: boolean;
}

const PT_PER_PX = 0.75;

export function renderTikz(scene: Scene, options: TikzOptions = {}): string {
  const standalone = options.standalone ?? true;
  const byId = new Map(scene.items.map((item) => [item.id, item]));
  const children = new Map<string, SceneItem[]>();
  for (const item of scene.items) {
    if (!item.parent) continue;
    const list = children.get(item.parent) ?? [];
    list.push(item);
    children.set(item.parent, list);
  }

  const colors = new Map<string, string>();
  const color = (hex: string) => {
    const key = normalizeHex(hex);
    let name = colors.get(key);
    if (!name) {
      name = `xm${colors.size + 1}`;
      colors.set(key, name);
    }
    return name;
  };
  const styles = new Map<string, string>();
  const style = (name: string, body: string) => {
    if (!styles.has(name)) styles.set(name, body);
    return name;
  };
  const paintStyle = (p: Paint) => {
    const parts: string[] = [];
    if (p.fill) parts.push(`fill=${color(p.fill)}`);
    if (p.stroke)
      parts.push(`draw=${color(p.stroke)}`, `line width=${n((p.strokeWidth ?? 1) * PT_PER_PX)}pt`);
    if (p.opacity !== undefined && p.opacity < 1) parts.push(`opacity=${n(p.opacity)}`);
    return parts.join(', ');
  };
  const roleOf = (item: SceneItem, prefix: string) =>
    item.classes?.find((c) => c.startsWith(`${prefix}-`))?.slice(prefix.length + 1) ?? 'other';
  const font = (size: number) =>
    `font=\\sffamily\\fontsize{${n(size * PT_PER_PX)}}{${n(size * PT_PER_PX * 1.2)}}\\selectfont`;

  const body: string[] = [];
  let usesArrows = false;
  let unicode = false;
  let usesMath = false;

  if (scene.background !== null) {
    body.push(
      `  \\fill[${color(scene.background)}] (0,0) rectangle (${n(scene.width)},${n(scene.height)});`,
    );
  }

  // Nodes first (edges refer to them by name); TikZ then draws edges between their borders.
  const nodes = scene.items.filter((i) => i.kind === 'circle' && i.id.startsWith('node-'));
  if (nodes.length > 0) body.push('  % Neurons');
  for (const item of nodes) {
    if (item.kind !== 'circle') continue;
    const role = roleOf(item, 'node');
    const s = style(
      `xm ${role}`,
      `circle, minimum size=${n(2 * item.r * PT_PER_PX)}pt, inner sep=0, outer sep=0, ${paintStyle(item.paint)}`,
    );
    body.push(`  \\node[${s}] (${nodeName(item.id)}) at (${n(item.cx)},${n(item.cy)}) {};`);
  }

  for (const item of scene.items) {
    if (item.kind === 'group' && item.id.startsWith('edges-')) {
      const kids = children.get(item.id) ?? [];
      body.push(`  % Connections ${item.id.slice('edges-'.length)}`);
      for (const kid of kids) {
        if (kid.kind === 'line' && kid.id.startsWith('edge-')) {
          const [, a, i, b, j] = kid.id.split('-');
          const s = style('xm edge', paintStyle(kid.paint));
          body.push(`  \\draw[${s}] (n-${a}-${i}) -- (n-${b}-${j});`);
        } else if (kid.kind === 'line' && kid.id.startsWith('fan-')) {
          // From a point on a feature map to a neuron of the next layer.
          const [, a, , j] = kid.id.split('-');
          const s = style('xm edge', paintStyle(kid.paint));
          body.push(`  \\draw[${s}] (${n(kid.x1)},${n(kid.y1)}) -- (n-${Number(a) + 1}-${j});`);
        } else if (kid.kind === 'path' && kid.id.startsWith('bundle-')) {
          const s = style('xm bundle', paintStyle(kid.paint));
          body.push(`  \\fill[${s}] ${tikzPath(kid.d)};`);
        } else if (kid.kind === 'line' && kid.id.startsWith('arrow-')) {
          const head = kids.find((k) => k.id === `${kid.id}-head` && k.kind === 'path');
          const tip = head && head.kind === 'path' ? firstPoint(head.d) : [kid.x2, kid.y2];
          usesArrows = true;
          const s = style(
            'xm arrow',
            `${paintStyle(kid.paint)}, -{Triangle[length=${n(8 * PT_PER_PX)}pt, width=${n(9 * PT_PER_PX)}pt]}`,
          );
          body.push(`  \\draw[${s}] (${n(kid.x1)},${n(kid.y1)}) -- (${n(tip[0]!)},${n(tip[1]!)});`);
        }
      }
    }
  }

  // The front sheet of each feature map has the heaviest outline; the sheets behind it are lighter.
  const frontStroke = new Map<string, number>();
  for (const item of scene.items) {
    if (item.kind !== 'path' || !item.id.startsWith('sheet-') || !item.parent) continue;
    const w = item.paint.strokeWidth ?? 0;
    frontStroke.set(item.parent, Math.max(w, frontStroke.get(item.parent) ?? 0));
  }
  const extras: string[] = [];
  for (const item of scene.items) {
    if (item.kind === 'rect' && item.id.startsWith('box-')) {
      const role = roleOf(item, 'box');
      const s = style(
        `xm box ${role}`,
        `${paintStyle(item.paint)}, rounded corners=${n((item.rx ?? 0) * PT_PER_PX)}pt`,
      );
      extras.push(
        `  \\draw[${s}] (${n(item.x)},${n(item.y)}) rectangle ++(${n(item.width)},${n(item.height)});`,
      );
    } else if (item.kind === 'path' && item.id.startsWith('sheet-')) {
      const front = item.paint.strokeWidth === frontStroke.get(item.parent ?? '');
      const s = style(
        `xm map ${roleOf(item, 'map')}${front ? '' : ' back'}`,
        `${paintStyle(item.paint)}, line join=round`,
      );
      extras.push(`  \\draw[${s}] ${tikzPath(item.d)};`);
    } else if (item.kind === 'path' && item.id.startsWith('window-')) {
      const s = style('xm window', `${paintStyle(item.paint)}, line join=round`);
      extras.push(`  \\draw[${s}] ${tikzPath(item.d)};`);
    } else if (item.kind === 'line' && item.id.startsWith('ray-')) {
      const s = style('xm ray', paintStyle(item.paint));
      extras.push(`  \\draw[${s}] (${n(item.x1)},${n(item.y1)}) -- (${n(item.x2)},${n(item.y2)});`);
    } else if (item.kind === 'circle' && item.id.startsWith('raydot-')) {
      const s = style('xm ray end', paintStyle(item.paint));
      extras.push(`  \\fill[${s}] (${n(item.cx)},${n(item.cy)}) circle[radius=${n(item.r)}];`);
    } else if (item.kind === 'circle' && item.parent?.startsWith('ellipsis-')) {
      const s = style('xm dots', paintStyle(item.paint));
      extras.push(`  \\fill[${s}] (${n(item.cx)},${n(item.cy)}) circle[radius=${n(item.r)}];`);
    }
  }
  if (extras.length > 0) body.push('  % Layers', ...extras);

  // Labels: one TikZ node per label, at the label's baseline center (or the neuron's center).
  const labels: string[] = [];
  for (const item of scene.items) {
    const isLabel = /^(name|size|op)-\d+$/.test(item.id);
    const isNodeLabel = /^nodelabel-\d+-\d+$/.test(item.id);
    if (!isLabel && !isNodeLabel) continue;
    const parts = labelParts(item, children.get(item.id) ?? []);
    if (parts.length === 0) continue;
    const content = parts
      .map((p) => {
        if (p.kind === 'math') {
          usesMath = true;
          return `$${p.tex}$`;
        }
        // The multiplication sign of map sizes (28×28×8) needs no Unicode engine.
        if (/[^\x20-\x7e×]/.test(p.text)) unicode = true;
        return escapeLatex(p.text).replaceAll('×', '\\ensuremath{\\times}');
      })
      .join('');
    const first = parts[0]!;
    const size = first.kind === 'math' ? first.size / 1.1 : first.font.size;
    const fill = first.paint.fill ?? '#000000';
    const kind = item.id.split('-')[0]!;
    const s = style(`xm ${kind} ${color(fill)}`, `text=${color(fill)}, inner sep=0, ${font(size)}`);
    if (isNodeLabel) {
      const neuron = byId.get(item.id.replace('nodelabel-', 'node-'));
      const at = neuron && neuron.kind === 'circle' ? `${n(neuron.cx)},${n(neuron.cy)}` : '0,0';
      labels.push(`  \\node[${s}, anchor=center] at (${at}) {${content}};`);
    } else {
      const [x, y] = labelAnchor(item, parts);
      labels.push(`  \\node[${s}, anchor=base] at (${n(x)},${n(y)}) {${content}};`);
    }
  }
  if (labels.length > 0) body.push('  % Labels', ...labels);

  const definitions = [...colors].map(([hex, name]) => `\\definecolor{${name}}{HTML}{${hex}}`);
  const picture = [
    `\\begin{tikzpicture}[x=${PT_PER_PX}pt, y=-${PT_PER_PX}pt]`,
    '  \\tikzset{',
    ...[...styles].map(([name, value]) => `    ${name}/.style={${value}},`),
    '  }',
    ...body,
    '\\end{tikzpicture}',
  ];

  const header = [
    `% ${scene.title.replace(/[\r\n]+/g, ' ')}`,
    '% Made with Xematics. Positions are in px (1 px = 0.75 pt), as in the SVG export.',
    ...(unicode
      ? [
          '% Labels use characters beyond ASCII: compile with XeLaTeX or LuaLaTeX and pick a font that covers them.',
        ]
      : []),
  ];
  const libraries = usesArrows ? ['\\usetikzlibrary{arrows.meta}'] : [];
  // MathJax accepts AMS macros (\mathbb, \boldsymbol, ...), so math labels need these packages.
  const packages = usesMath ? ['\\usepackage{amsmath, amssymb}'] : [];
  if (!standalone) {
    const needs = ['\\usepackage{tikz}', ...libraries, ...packages].join(' ');
    return `${[...header, `% Needs in the preamble: ${needs}`, ...definitions, ...picture].join('\n')}\n`;
  }
  return `${[
    ...header,
    '\\documentclass[tikz, border=4pt]{standalone}',
    ...(unicode ? ['\\usepackage{fontspec}'] : []),
    ...packages,
    ...libraries,
    ...definitions,
    '\\begin{document}',
    ...picture,
    '\\end{document}',
  ].join('\n')}\n`;
}

type Part = TextItem | MathItem;

/** A label's text and math parts in reading (logical) order. */
function labelParts(item: SceneItem, kids: readonly SceneItem[]): Part[] {
  if (item.kind === 'text') return [item];
  if (item.kind !== 'group') return [];
  const parts = kids.filter((k): k is Part => k.kind === 'text' || k.kind === 'math');
  // Parts are stored in visual order; right-to-left labels read the other way.
  const rtl = parts.some((p) => p.kind === 'text' && p.direction === 'rtl');
  return rtl ? [...parts].reverse() : parts;
}

/** Baseline center of a label. */
function labelAnchor(item: SceneItem, parts: readonly Part[]): [number, number] {
  if (item.kind === 'text') return [item.x, item.y];
  const lefts = parts.map((p) => (p.kind === 'math' ? p.x : p.x - p.width / 2));
  const rights = parts.map((p) => (p.kind === 'math' ? p.x + p.width : p.x + p.width / 2));
  return [(Math.min(...lefts) + Math.max(...rights)) / 2, parts[0]!.y];
}

/** node-2-5 becomes n-2-5. */
function nodeName(id: string): string {
  return `n-${id.slice('node-'.length)}`;
}

function escapeLatex(text: string): string {
  return text.replace(/[\\{}$&#^_%~]/g, (c) => {
    switch (c) {
      case '\\':
        return '\\textbackslash{}';
      case '^':
        return '\\textasciicircum{}';
      case '~':
        return '\\textasciitilde{}';
      default:
        return `\\${c}`;
    }
  });
}

/** Converts layout path data (M, L, Z only) to a TikZ path. */
function tikzPath(d: string): string {
  const out: string[] = [];
  for (const [, op, x, y] of d.matchAll(/([MLZ])\s*(-?[\d.]+)?[\s,]*(-?[\d.]+)?/g)) {
    if (op === 'Z') out.push('cycle');
    else out.push(`(${n(Number(x))},${n(Number(y))})`);
  }
  return out.join(' -- ');
}

function firstPoint(d: string): [number, number] {
  const m = /M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(d);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

function normalizeHex(hex: string): string {
  let h = hex.replace('#', '').toUpperCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return h;
}

function n(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

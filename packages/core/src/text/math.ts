// TeX to vector outlines with MathJax 4 (SVG output, New Computer Modern font), loaded on first use.
// MathJax's SVG is never passed through: only path geometry is read from it, so labels cannot
// inject markup. Only the base and AMS packages are enabled (no \href, \style, \class or \require).

/** A typeset formula in em units (1 = font size), origin at the baseline's left end, y down. */
export interface MathBox {
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  readonly commands: readonly PathCommand[];
}

export interface PathCommand {
  readonly type: 'M' | 'L' | 'Q' | 'C' | 'Z';
  readonly values: readonly number[];
}

export type MathResult = { readonly box: MathBox } | { readonly error: string };
export type MathRenderer = (tex: string) => Promise<MathResult>;

/** MathJax lays out in thousandths of an em. */
const UNITS = 1000;

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export async function createMathRenderer(
  importModule: (specifier: string) => Promise<unknown>,
): Promise<MathRenderer> {
  const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, , , font] =
    await Promise.all([
      import('@mathjax/src/js/mathjax.js'),
      import('@mathjax/src/js/input/tex.js'),
      import('@mathjax/src/js/output/svg.js'),
      import('@mathjax/src/js/adaptors/liteAdaptor.js'),
      import('@mathjax/src/js/handlers/html.js'),
      import('@mathjax/src/js/input/tex/base/BaseConfiguration.js'),
      import('@mathjax/src/js/input/tex/ams/AmsConfiguration.js'),
      import('@mathjax/mathjax-newcm-font/js/svg.js'),
    ]);
  // Glyph ranges outside the core set (bold, double-struck, ...) load through this hook.
  mathjax.asyncLoad = importModule;
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({
    packages: ['base', 'ams'],
    formatError: (_jax: unknown, error: { message: string }) => {
      throw new Error(error.message);
    },
  });
  // One drawing per formula: MathJax 4 would otherwise split inline math at relations like \in.
  const svg = new SVG({
    fontData: font.MathJaxNewcmFont,
    fontCache: 'none',
    linebreaks: { inline: false },
  } as ConstructorParameters<typeof SVG>[0]);
  const doc = mathjax.document('', { InputJax: tex, OutputJax: svg });

  // The lite DOM is read through a minimal view of the adaptor (elements and text nodes alike).
  type Node = object;
  const tree = adaptor as unknown as {
    kind(node: Node): string;
    childNodes(node: Node): Node[];
    getAttribute(node: Node, name: string): string | null | undefined;
  };

  return async (source: string): Promise<MathResult> => {
    let container: Node;
    try {
      container = (await mathjax.handleRetriesFor(() =>
        doc.convert(source, { display: false }),
      )) as Node;
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    const drawings = tree.childNodes(container).filter((n) => tree.kind(n) === 'svg');
    if (drawings.length > 1) return { error: 'The formula could not be drawn as one piece.' };
    const root = drawings[0];
    const viewBox =
      root &&
      tree
        .getAttribute(root, 'viewBox')
        ?.split(/[\s,]+/)
        .map(Number);
    if (!root || !viewBox || viewBox.length !== 4 || viewBox.some((n) => !Number.isFinite(n))) {
      return { error: 'MathJax returned no drawing.' };
    }
    const [minX, minY, width, height] = viewBox as [number, number, number, number];
    const commands: PathCommand[] = [];
    // Shift so the box starts at x = 0; scale thousandths of an em to em.
    const base: Matrix = [1 / UNITS, 0, 0, 1 / UNITS, -minX / UNITS, 0];
    let unsupported: string | undefined;

    const walk = (node: Node, matrix: Matrix): void => {
      const kind = tree.kind(node);
      if (kind === '#text' || kind === '#comment' || kind === 'title' || kind === 'desc') return;
      const local = multiply(matrix, parseTransform(tree.getAttribute(node, 'transform') ?? ''));
      switch (kind) {
        case 'svg':
        case 'g': {
          const x = Number(tree.getAttribute(node, 'x') ?? 0) || 0;
          const y = Number(tree.getAttribute(node, 'y') ?? 0) || 0;
          const inner = x || y ? multiply(local, [1, 0, 0, 1, x, y]) : local;
          for (const child of tree.childNodes(node)) walk(child, inner);
          return;
        }
        case 'path':
          commands.push(...transformPath(parsePath(tree.getAttribute(node, 'd') ?? ''), local));
          return;
        case 'rect': {
          const n = (name: string) => Number(tree.getAttribute(node, name) ?? 0) || 0;
          const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
          const corners: [number, number][] = [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
          ];
          corners.forEach(([cx, cy], i) =>
            commands.push({ type: i === 0 ? 'M' : 'L', values: apply(local, cx, cy) }),
          );
          commands.push({ type: 'Z', values: [] });
          return;
        }
        case 'text':
          unsupported = 'a character the math font does not have';
          return;
        default:
          unsupported = `an unsupported construct (${kind})`;
      }
    };
    for (const child of tree.childNodes(root)) walk(child, base);
    if (unsupported) return { error: `The formula uses ${unsupported}.` };
    return {
      box: {
        width: width / UNITS,
        ascent: -minY / UNITS,
        descent: (minY + height) / UNITS,
        commands,
      },
    };
  };
}

/** SVG path data for a formula at `size` px whose baseline starts at (x, y). */
export function mathOutline(
  box: MathBox,
  x: number,
  y: number,
  size: number,
  round: (n: number) => string,
): string {
  let d = '';
  for (const command of box.commands) {
    d += command.type;
    const v = command.values;
    for (let i = 0; i + 1 < v.length; i += 2) {
      d += `${i > 0 ? ' ' : ''}${round(x + v[i]! * size)} ${round(y + v[i + 1]! * size)}`;
    }
  }
  return d;
}

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Parses an SVG transform list (translate, scale, matrix). */
function parseTransform(text: string): Matrix {
  let m: Matrix = IDENTITY;
  for (const [, name, args] of text.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const n = args!
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (name === 'translate') m = multiply(m, [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]);
    else if (name === 'scale') m = multiply(m, [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]);
    else if (name === 'matrix' && n.length === 6) m = multiply(m, n as unknown as Matrix);
  }
  return m;
}

/** Parses path data into absolute M, L, Q, C and Z commands (H, V, S, T and relatives expanded). */
export function parsePath(d: string): PathCommand[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const out: PathCommand[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastControl: [number, number] | undefined;
  let lastQuad: [number, number] | undefined;
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        x = ox + next();
        y = oy + next();
        startX = x;
        startY = y;
        out.push({ type: 'M', values: [x, y] });
        cmd = rel ? 'l' : 'L';
        lastControl = lastQuad = undefined;
        break;
      }
      case 'L':
        x = ox + next();
        y = oy + next();
        out.push({ type: 'L', values: [x, y] });
        lastControl = lastQuad = undefined;
        break;
      case 'H':
        x = (rel ? x : 0) + next();
        out.push({ type: 'L', values: [x, y] });
        lastControl = lastQuad = undefined;
        break;
      case 'V':
        y = (rel ? y : 0) + next();
        out.push({ type: 'L', values: [x, y] });
        lastControl = lastQuad = undefined;
        break;
      case 'C': {
        const v = [ox + next(), oy + next(), ox + next(), oy + next(), ox + next(), oy + next()];
        out.push({ type: 'C', values: v });
        lastControl = [v[2]!, v[3]!];
        x = v[4]!;
        y = v[5]!;
        lastQuad = undefined;
        break;
      }
      case 'S': {
        const [cx, cy] = lastControl ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y];
        const v = [cx, cy, ox + next(), oy + next(), ox + next(), oy + next()];
        out.push({ type: 'C', values: v });
        lastControl = [v[2]!, v[3]!];
        x = v[4]!;
        y = v[5]!;
        lastQuad = undefined;
        break;
      }
      case 'Q': {
        const v = [ox + next(), oy + next(), ox + next(), oy + next()];
        out.push({ type: 'Q', values: v });
        lastQuad = [v[0]!, v[1]!];
        x = v[2]!;
        y = v[3]!;
        lastControl = undefined;
        break;
      }
      case 'T': {
        const [cx, cy] = lastQuad ? [2 * x - lastQuad[0], 2 * y - lastQuad[1]] : [x, y];
        const v = [cx, cy, ox + next(), oy + next()];
        out.push({ type: 'Q', values: v });
        lastQuad = [cx, cy];
        x = v[2]!;
        y = v[3]!;
        lastControl = undefined;
        break;
      }
      case 'Z':
        out.push({ type: 'Z', values: [] });
        x = startX;
        y = startY;
        lastControl = lastQuad = undefined;
        break;
      default:
        // Arcs and anything unknown: MathJax glyphs do not use them; stop rather than guess.
        return out;
    }
  }
  return out;
}

function transformPath(commands: readonly PathCommand[], m: Matrix): PathCommand[] {
  return commands.map((c) => {
    const values: number[] = [];
    for (let i = 0; i + 1 < c.values.length; i += 2)
      values.push(...apply(m, c.values[i]!, c.values[i + 1]!));
    return { type: c.type, values };
  });
}

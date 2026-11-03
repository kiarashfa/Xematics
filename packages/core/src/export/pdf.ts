// PDF export: a minimal PDF 1.4 writer for laid-out scenes. Every shape becomes PDF vector
// operators and all text is outlined (labels already carry their outlines), so no fonts are
// embedded and right-to-left, CJK and math labels look exactly as in the SVG. The output is plain
// ASCII without timestamps, so it is byte-identical in Node and browsers.

import type { Paint, Scene, SceneItem } from '../scene.ts';
import { parsePath, type PathCommand } from '../text/math.ts';

/** SVG user units are CSS px (96 per inch); PDF points are 72 per inch. */
const PT_PER_PX = 0.75;
/** Bezier handle length for a quarter circle. */
const KAPPA = 0.5522847498;

export function renderPdf(scene: Scene): Uint8Array {
  const width = scene.width * PT_PER_PX;
  const height = scene.height * PT_PER_PX;
  const states = new Map<number, string>();
  const ops: string[] = [
    // Work in SVG coordinates: px units, y pointing down.
    `${n(PT_PER_PX)} 0 0 ${n(-PT_PER_PX)} 0 ${n(height)} cm`,
    '4 M',
  ];
  if (scene.background !== null) {
    ops.push(`${rgb(scene.background)} rg`, `0 0 ${n(scene.width)} ${n(scene.height)} re f`);
  }
  for (const item of scene.items) draw(item, ops, states);

  const content = ops.join('\n');
  const gs = [...states].map(
    ([opacity, name]) => `/${name} << /ca ${n(opacity)} /CA ${n(opacity)} >>`,
  );
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(width)} ${n(height)}] /Contents 4 0 R /Resources << /ExtGState << ${gs.join(' ')} >> >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Title ${pdfText(scene.title)} /Subject ${pdfText(scene.description)} /Producer (Xematics) >>`,
  ];

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // Everything above is ASCII, so one character is one byte.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
  return bytes;
}

function draw(item: SceneItem, ops: string[], states: Map<number, string>): void {
  switch (item.kind) {
    case 'group':
      return;
    case 'circle': {
      const { cx, cy, r } = item;
      const k = r * KAPPA;
      paint(
        [
          `${n(cx + r)} ${n(cy)} m`,
          `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c`,
          `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c`,
          `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c`,
          `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c`,
          'h',
        ],
        item.paint,
        ops,
        states,
      );
      return;
    }
    case 'rect': {
      const { x, y, width: w, height: h } = item;
      const r = Math.min(item.rx ?? 0, w / 2, h / 2);
      if (r <= 0) {
        paint([`${n(x)} ${n(y)} ${n(w)} ${n(h)} re`], item.paint, ops, states);
        return;
      }
      const k = r * (1 - KAPPA);
      paint(
        [
          `${n(x + r)} ${n(y)} m`,
          `${n(x + w - r)} ${n(y)} l`,
          `${n(x + w - k)} ${n(y)} ${n(x + w)} ${n(y + k)} ${n(x + w)} ${n(y + r)} c`,
          `${n(x + w)} ${n(y + h - r)} l`,
          `${n(x + w)} ${n(y + h - k)} ${n(x + w - k)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)} c`,
          `${n(x + r)} ${n(y + h)} l`,
          `${n(x + k)} ${n(y + h)} ${n(x)} ${n(y + h - k)} ${n(x)} ${n(y + h - r)} c`,
          `${n(x)} ${n(y + r)} l`,
          `${n(x)} ${n(y + k)} ${n(x + k)} ${n(y)} ${n(x + r)} ${n(y)} c`,
          'h',
        ],
        item.paint,
        ops,
        states,
      );
      return;
    }
    case 'line':
      paint(
        [`${n(item.x1)} ${n(item.y1)} m`, `${n(item.x2)} ${n(item.y2)} l`],
        item.paint,
        ops,
        states,
      );
      return;
    case 'path':
      paint(pathOps(parsePath(item.d)), item.paint, ops, states);
      return;
    case 'text':
    case 'math':
      if (item.outline) paint(pathOps(parsePath(item.outline)), item.paint, ops, states);
      return;
  }
}

/** Path construction operators; quadratic curves become cubic ones (PDF has no quadratics). */
function pathOps(commands: readonly PathCommand[]): string[] {
  const ops: string[] = [];
  let x = 0;
  let y = 0;
  for (const { type, values: v } of commands) {
    if (type === 'M') ops.push(`${n(v[0]!)} ${n(v[1]!)} m`);
    else if (type === 'L') ops.push(`${n(v[0]!)} ${n(v[1]!)} l`);
    else if (type === 'C') ops.push(`${v.map(n).join(' ')} c`);
    else if (type === 'Q') {
      const [qx, qy, ex, ey] = v as [number, number, number, number];
      const c1x = x + (2 / 3) * (qx - x);
      const c1y = y + (2 / 3) * (qy - y);
      const c2x = ex + (2 / 3) * (qx - ex);
      const c2y = ey + (2 / 3) * (qy - ey);
      ops.push(`${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(ex)} ${n(ey)} c`);
    } else ops.push('h');
    if (v.length >= 2) {
      x = v[v.length - 2]!;
      y = v[v.length - 1]!;
    }
  }
  return ops;
}

function paint(
  path: readonly string[],
  p: Paint,
  ops: string[],
  states: Map<number, string>,
): void {
  const fill = p.fill !== undefined && p.fill !== 'none';
  const stroke = p.stroke !== undefined && p.stroke !== 'none' && (p.strokeWidth ?? 1) > 0;
  if (!fill && !stroke) return;
  ops.push('q');
  if (p.opacity !== undefined && p.opacity < 1) {
    let name = states.get(p.opacity);
    if (!name) {
      name = `GS${states.size}`;
      states.set(p.opacity, name);
    }
    ops.push(`/${name} gs`);
  }
  if (fill) ops.push(`${rgb(p.fill!)} rg`);
  if (stroke) ops.push(`${rgb(p.stroke!)} RG`, `${n(p.strokeWidth ?? 1)} w`);
  ops.push(...path, fill && stroke ? 'B' : fill ? 'f' : 'S', 'Q');
}

/** Numbers with up to three decimals: finer than any printer, still deterministic. */
function n(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function rgb(hex: string): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const value = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(value)) return '0 0 0';
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => n(c / 255)).join(' ');
}

/** A PDF text string: UTF-16BE with a byte order mark, written in hex so the file stays ASCII. */
function pdfText(text: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++)
    hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

// Embed snippets for an exported SVG: a data URL, a Markdown image and an HTML <img>.

import { utf8Encode, base64Encode } from '../util/web.ts';
import { escapeXml } from '../util/xml.ts';

export interface EmbedSnippets {
  readonly dataUrl: string;
  readonly markdown: string;
  readonly html: string;
}

export function embedSnippets(
  svg: string,
  alt: string,
  size: { readonly width: number; readonly height: number },
): EmbedSnippets {
  const dataUrl = `data:image/svg+xml;base64,${base64Encode(utf8Encode(svg))}`;
  // Markdown alt text cannot contain brackets or line breaks.
  const mdAlt = alt
    .replace(/[[\]\r\n]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  return {
    dataUrl,
    markdown: `![${mdAlt}](${dataUrl})`,
    html: `<img src="${dataUrl}" alt="${escapeXml(alt)}" width="${Math.round(size.width)}" height="${Math.round(size.height)}">`,
  };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Adds or replaces the pHYs chunk of a PNG so viewers and LaTeX know its resolution (a 300 dpi
 * image then prints at the figure's own size).
 */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (!PNG_SIGNATURE.every((b, i) => png[i] === b)) throw new Error('Not a PNG file.');
  const ppm = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  const view = new DataView(data.buffer);
  view.setUint32(0, ppm);
  view.setUint32(4, ppm);
  data[8] = 1; // unit: metre
  const chunk = pngChunk('pHYs', data);

  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let offset = 8;
  let inserted = false;
  while (offset + 8 <= png.length) {
    const length = new DataView(png.buffer, png.byteOffset + offset).getUint32(0);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (type !== 'pHYs') parts.push(png.subarray(offset, end));
    if (type === 'IHDR' && !inserted) {
      parts.push(chunk);
      inserted = true;
    }
    offset = end;
  }
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

let table: Uint32Array | undefined;

function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = table[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** PNG pixel size for a figure at a given dpi (the SVG's px are CSS px, 96 per inch). */
export function pngSize(
  size: { readonly width: number; readonly height: number },
  dpi: number,
): { width: number; height: number } {
  const scale = dpi / 96;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

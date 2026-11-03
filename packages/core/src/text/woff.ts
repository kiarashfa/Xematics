// WOFF 1.0 to sfnt (TTF/OTF) conversion. HarfBuzz reads only sfnt, and WOFF files are what font
// packages ship. Tables are zlib streams, inflated with the web-standard DecompressionStream
// (available in browsers and in Node), so core needs no compression library.

const WOFF = 0x774f4646; // 'wOFF'
const WOFF2 = 0x774f4632; // 'wOF2'

interface ByteReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
}
interface DecompressionStreamLike {
  readonly readable: { getReader(): ByteReader };
  readonly writable: {
    getWriter(): { write(chunk: Uint8Array): Promise<void>; close(): Promise<void> };
  };
}
type DecompressionStreamConstructor = new (format: 'deflate') => DecompressionStreamLike;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const Decompression = (globalThis as { DecompressionStream?: DecompressionStreamConstructor })
    .DecompressionStream;
  if (!Decompression) throw new Error('This environment cannot decompress WOFF fonts.');
  const stream = new Decompression('deflate');
  const writer = stream.writable.getWriter();
  // Write and read concurrently; awaiting the write first can stall on backpressure.
  const writing = writer.write(data).then(() => writer.close());
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  await writing;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Returns sfnt bytes for a font file: WOFF 1.0 is converted, TTF/OTF pass through unchanged. */
export async function toSfnt(data: Uint8Array): Promise<Uint8Array> {
  if (data.byteLength < 44) return data;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const signature = view.getUint32(0);
  if (signature === WOFF2)
    throw new Error('WOFF2 fonts are not supported yet. Use WOFF, TTF or OTF.');
  if (signature !== WOFF) return data;

  const flavor = view.getUint32(4);
  const numTables = view.getUint16(12);
  if (44 + numTables * 20 > data.byteLength)
    throw new Error('Invalid WOFF file: truncated table directory.');

  const tables: { tag: number; checksum: number; bytes: Uint8Array }[] = [];
  for (let i = 0; i < numTables; i++) {
    const entry = 44 + i * 20;
    const tag = view.getUint32(entry);
    const offset = view.getUint32(entry + 4);
    const compressedLength = view.getUint32(entry + 8);
    const length = view.getUint32(entry + 12);
    const checksum = view.getUint32(entry + 16);
    if (offset + compressedLength > data.byteLength)
      throw new Error('Invalid WOFF file: table out of bounds.');
    const raw = data.subarray(offset, offset + compressedLength);
    const bytes = compressedLength < length ? await inflate(raw) : raw;
    if (bytes.length !== length) throw new Error('Invalid WOFF file: table size mismatch.');
    tables.push({ tag, checksum, bytes });
  }

  // sfnt header + table directory, then 4-byte aligned table data (WOFF keeps tables sorted by tag).
  let size = 12 + 16 * numTables;
  for (const table of tables) size += (table.bytes.length + 3) & ~3;
  const out = new Uint8Array(size);
  const header = new DataView(out.buffer);
  let selector = 0;
  while (1 << (selector + 1) <= numTables) selector++;
  header.setUint32(0, flavor);
  header.setUint16(4, numTables);
  header.setUint16(6, 16 << selector);
  header.setUint16(8, selector);
  header.setUint16(10, numTables * 16 - (16 << selector));
  let offset = 12 + 16 * numTables;
  tables.forEach((table, i) => {
    const entry = 12 + i * 16;
    header.setUint32(entry, table.tag);
    header.setUint32(entry + 4, table.checksum);
    header.setUint32(entry + 8, offset);
    header.setUint32(entry + 12, table.bytes.length);
    out.set(table.bytes, offset);
    offset += (table.bytes.length + 3) & ~3;
  });
  return out;
}

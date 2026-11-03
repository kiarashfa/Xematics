// Web-standard APIs that exist in browsers and in Node, typed locally so core needs neither the
// DOM nor the Node type definitions.

interface ByteReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
}
interface ByteStream {
  readonly readable: { getReader(): ByteReader };
  readonly writable: {
    getWriter(): { write(chunk: Uint8Array): Promise<void>; close(): Promise<void> };
  };
}
type Format = 'deflate' | 'deflate-raw';
type StreamConstructor = new (format: Format) => ByteStream;

const web = globalThis as {
  CompressionStream?: StreamConstructor;
  DecompressionStream?: StreamConstructor;
  TextEncoder?: new () => { encode(text: string): Uint8Array };
  TextDecoder?: new (
    label: string,
    options: { fatal: boolean },
  ) => { decode(bytes: Uint8Array): string };
};

export class OutputTooLargeError extends Error {}

/** Runs bytes through a (de)compression stream. Stops early when output exceeds maxBytes. */
export async function transform(
  data: Uint8Array,
  mode: 'compress' | 'decompress',
  format: Format,
  maxBytes = Infinity,
): Promise<Uint8Array> {
  const Stream = mode === 'compress' ? web.CompressionStream : web.DecompressionStream;
  if (!Stream) throw new Error(`This environment cannot ${mode} data.`);
  const stream = new Stream(format);
  const writer = stream.writable.getWriter();
  // Write and read concurrently; awaiting the write first can stall on backpressure.
  const writing = writer.write(data).then(() => writer.close());
  writing.catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new OutputTooLargeError(`Output is larger than ${maxBytes} bytes.`);
    }
    chunks.push(value);
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

export function utf8Encode(text: string): Uint8Array {
  if (!web.TextEncoder) throw new Error('This environment has no TextEncoder.');
  return new web.TextEncoder().encode(text);
}

/** Decodes UTF-8, throwing on invalid byte sequences. */
export function utf8Decode(bytes: Uint8Array): string {
  if (!web.TextDecoder) throw new Error('This environment has no TextDecoder.');
  return new web.TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Unpadded base64url (RFC 4648 section 5). */
export function base64urlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += ALPHABET[n & 63]!;
  }
  return out;
}

export function base64urlDecode(text: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return undefined;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (i + k < text.length ? ALPHABET.indexOf(text[i + k]!) : 0));
    const n = (v[0]! << 18) | (v[1]! << 12) | (v[2]! << 6) | v[3]!;
    out[o++] = (n >> 16) & 255;
    if (i + 2 < text.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < text.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

// Font subsetting with HarfBuzz's hb-subset (harfbuzz-subset.wasm from harfbuzzjs, which ships the
// module without a JavaScript wrapper, so this calls its C API directly).

export type Subsetter = (font: Uint8Array, codePoints: Iterable<number>) => Uint8Array;

// WebAssembly is typed locally so core needs neither the DOM nor the Node type definitions.
const wasm = (
  globalThis as unknown as {
    WebAssembly: {
      instantiate(bytes: Uint8Array, imports: object): Promise<{ instance: { exports: unknown } }>;
    };
  }
).WebAssembly;

interface SubsetExports {
  readonly memory: { readonly buffer: ArrayBuffer };
  readonly _initialize?: () => void;
  malloc(size: number): number;
  free(ptr: number): void;
  hb_blob_create(data: number, length: number, mode: number, user: number, destroy: number): number;
  hb_blob_destroy(blob: number): void;
  hb_blob_get_data(blob: number, length: number): number;
  hb_blob_get_length(blob: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(face: number): void;
  hb_face_reference_blob(face: number): number;
  hb_set_add(set: number, code: number): void;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(input: number): void;
  hb_subset_input_unicode_set(input: number): number;
  hb_subset_or_fail(face: number, input: number): number;
}

const HB_MEMORY_MODE_READONLY = 1;

export async function createSubsetter(module: Uint8Array | ArrayBuffer): Promise<Subsetter> {
  const bytes = module instanceof Uint8Array ? module : new Uint8Array(module);
  const { instance } = await wasm.instantiate(bytes, {});
  const hb = instance.exports as unknown as SubsetExports;
  hb._initialize?.();

  return (font, codePoints) => {
    const ptr = hb.malloc(font.length);
    new Uint8Array(hb.memory.buffer).set(font, ptr);
    const blob = hb.hb_blob_create(ptr, font.length, HB_MEMORY_MODE_READONLY, 0, 0);
    const face = hb.hb_face_create(blob, 0);
    hb.hb_blob_destroy(blob);
    const input = hb.hb_subset_input_create_or_fail();
    const unicodes = hb.hb_subset_input_unicode_set(input);
    for (const code of codePoints) hb.hb_set_add(unicodes, code);
    const result = hb.hb_subset_or_fail(face, input);
    hb.hb_subset_input_destroy(input);
    try {
      if (!result) throw new Error('Font subsetting failed.');
      const out = hb.hb_face_reference_blob(result);
      const data = hb.hb_blob_get_data(out, 0);
      const length = hb.hb_blob_get_length(out);
      // Copy before freeing: the wasm heap may move or be reused.
      const copy = new Uint8Array(hb.memory.buffer, data, length).slice();
      hb.hb_blob_destroy(out);
      return copy;
    } finally {
      if (result) hb.hb_face_destroy(result);
      hb.hb_face_destroy(face);
      hb.free(ptr);
    }
  };
}

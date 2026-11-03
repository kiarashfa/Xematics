import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  createWorkspace,
  decodeShare,
  encodeShare,
  parseWorkspace,
  serializeWorkspace,
  SHARE_PREFIX,
} from '../src/index.ts';
import { base64urlDecode, base64urlEncode, transform } from '../src/util/web.ts';

describe('share links', () => {
  test('round-trip any source text, including Unicode', async () => {
    for (const text of [
      '784-16-16-10',
      'title: لایه‌ها σ(z) 日本\nlayers: [3, 2]\n',
      '',
      'x'.repeat(5000),
    ]) {
      const fragment = await encodeShare(text);
      expect(fragment.startsWith(SHARE_PREFIX)).toBe(true);
      expect(fragment).toMatch(/^v1\.[A-Za-z0-9_-]*$/);
      expect(await decodeShare(`#${fragment}`)).toEqual({ ok: true, text });
    }
  });

  test('links are stable: the same text always gives the same link', async () => {
    expect(await encodeShare('784-16-16-10')).toBe(await encodeShare('784-16-16-10'));
  });

  test('rejects foreign, newer, damaged and oversized links without throwing', async () => {
    expect(await decodeShare('#section-2')).toEqual({
      ok: false,
      error: 'This is not a Xematics share link.',
    });
    expect(await decodeShare('#v2.abc')).toEqual({
      ok: false,
      error: 'This link was made with a newer version of Xematics.',
    });
    expect((await decodeShare('#v1.@@@')).ok).toBe(false);
    expect((await decodeShare('#v1.AAAA')).ok).toBe(false);
    // 2 MB of zeros compresses to about 2 KB: decoding must stop at the size cap.
    const bomb = await transform(new Uint8Array(2_000_000), 'compress', 'deflate-raw');
    expect(await decodeShare(`#v1.${base64urlEncode(bomb)}`)).toEqual({
      ok: false,
      error: 'The diagram in this link is too large.',
    });
  });

  test('never throws on arbitrary fragments', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 60 }), async (s) => {
        const result = await decodeShare(`v1.${s}`);
        expect(typeof result.ok).toBe('boolean');
      }),
      { numRuns: 300 },
    );
  });

  test('base64url round-trips every byte length', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 40 }), (bytes) => {
        expect(base64urlDecode(base64urlEncode(bytes))).toEqual(bytes);
      }),
    );
  });
});

describe('workspace files', () => {
  const doc = { id: 'a1', text: '3-2', updatedAt: '2026-11-03T10:00:00.000Z' };

  test('round-trip', () => {
    const workspace = { ...createWorkspace(doc), settings: { liveText: true } };
    expect(parseWorkspace(serializeWorkspace(workspace))).toEqual({ ok: true, workspace });
  });

  test('repairs a missing current document and keeps unknown keys out', () => {
    const json = JSON.stringify({ ...createWorkspace(doc), current: 'gone', extra: 1 });
    const result = parseWorkspace(json);
    expect(result.ok && result.workspace.current).toBe('a1');
    expect(result.ok && 'extra' in result.workspace).toBe(false);
  });

  test('rejects other files with clear messages', () => {
    expect(parseWorkspace('not json')).toEqual({
      ok: false,
      error: 'This is not a Xematics workspace file (it is not valid JSON).',
    });
    expect(parseWorkspace('{"layers":[3]}')).toEqual({
      ok: false,
      error: 'This is not a Xematics workspace file.',
    });
    expect(parseWorkspace(JSON.stringify({ ...createWorkspace(doc), version: 2 }))).toEqual({
      ok: false,
      error: 'This workspace was saved by a newer version of Xematics.',
    });
    expect(
      parseWorkspace(JSON.stringify({ ...createWorkspace(doc), documents: [doc, doc] })).ok,
    ).toBe(false);
    expect(parseWorkspace(JSON.stringify({ ...createWorkspace({ ...doc, id: '../x' }) })).ok).toBe(
      false,
    );
  });
});

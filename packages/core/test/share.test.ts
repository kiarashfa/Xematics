import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  createWorkspace,
  decodeShare,
  encodeShare,
  mergeWorkspaces,
  parseProfile,
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

  const T = (minute: number) => `2026-11-04T10:${String(minute).padStart(2, '0')}:00.000Z`;
  const profile = (minute: number, name: string) => ({
    name,
    picture: null,
    emoji: null,
    mono: { letters: name.slice(0, 2).toUpperCase(), color: 'blue' as const },
    createdAt: T(minute),
    updatedAt: T(minute),
  });

  test('keeps a valid profile and drops a damaged one without losing the documents', () => {
    const good = { ...createWorkspace(doc), profile: profile(1, 'Sara') };
    expect(parseWorkspace(serializeWorkspace(good))).toEqual({ ok: true, workspace: good });
    const bad = { ...createWorkspace(doc), profile: { ...profile(1, 'x'), picture: 'http://a/b' } };
    const result = parseWorkspace(JSON.stringify(bad));
    expect(result.ok && result.workspace.profile).toBeUndefined();
    expect(result.ok && result.workspace.documents).toEqual([doc]);
    expect(
      parseProfile({ ...profile(1, 'Sara'), picture: 'data:image/webp;base64,AAAA' })?.mono,
    ).toBeNull();
  });

  test('merge: union by id, newer edit wins, settings and profile from the newer side', () => {
    const a = {
      ...createWorkspace({ id: 'a', text: 'a-old', updatedAt: T(1) }),
      profile: profile(5, 'Sara'),
    };
    a.documents.push({ id: 'b', text: 'b', updatedAt: T(2) });
    const b = {
      ...createWorkspace({ id: 'a', text: 'a-new', updatedAt: T(3) }),
      settings: { liveText: true },
      profile: { ...profile(1, 'Old'), updatedAt: T(9) },
    };
    b.documents.push({ id: 'c', text: 'c', updatedAt: T(4) });
    const merged = mergeWorkspaces(a, b);
    expect(merged.documents.map((d) => `${d.id}:${d.text}`)).toEqual(['a:a-new', 'b:b', 'c:c']);
    expect(merged.settings).toEqual({ liveText: true });
    expect(merged.profile?.name).toBe('Old');
    expect(merged.profile?.createdAt).toBe(T(1));
    expect(mergeWorkspaces(merged, merged)).toEqual(merged);
  });

  test('merge: deleted documents stay deleted unless edited after the deletion', () => {
    const here = createWorkspace({ id: 'keep', text: 'k', updatedAt: T(1) });
    here.documents.push(
      { id: 'gone', text: 'g', updatedAt: T(2) },
      { id: 'back', text: 'b2', updatedAt: T(8) },
    );
    const there = {
      ...createWorkspace({ id: 'keep', text: 'k', updatedAt: T(1) }),
      removed: [
        { id: 'gone', at: T(5) },
        { id: 'back', at: T(5) },
      ],
    };
    const merged = mergeWorkspaces(here, there);
    expect(merged.documents.map((d) => d.id)).toEqual(['keep', 'back']);
    expect(merged.removed).toEqual([{ id: 'gone', at: T(5) }]);
    // Deleting everything still leaves the newest document.
    const all = { ...here, removed: here.documents.map((d) => ({ id: d.id, at: T(30) })) };
    expect(mergeWorkspaces(here, all).documents.map((d) => d.id)).toEqual(['back']);
  });
});

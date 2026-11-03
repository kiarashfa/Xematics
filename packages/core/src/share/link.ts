// Share links carry the diagram source in the URL fragment, which browsers never send to servers.
// Format: "v1." + base64url(deflate-raw(UTF-8 source)). The version prefix keeps old links
// readable after the format changes: add a new prefix, never change what "v1." means.

import { LIMITS } from '../model/schema.ts';
import {
  base64urlDecode,
  base64urlEncode,
  OutputTooLargeError,
  transform,
  utf8Decode,
  utf8Encode,
} from '../util/web.ts';

export const SHARE_PREFIX = 'v1.';
/** Links longer than this are hard to paste into chats and papers; offer a file instead. */
export const SHARE_SOFT_LIMIT = 8000;
const MAX_FRAGMENT = 600_000;

export type ShareResult = { ok: true; text: string } | { ok: false; error: string };

/** Encodes source text as a fragment (without the leading '#'). */
export async function encodeShare(text: string): Promise<string> {
  return (
    SHARE_PREFIX + base64urlEncode(await transform(utf8Encode(text), 'compress', 'deflate-raw'))
  );
}

export function isShareFragment(fragment: string): boolean {
  return /^v\d+\./.test(fragment.replace(/^#/, ''));
}

/** Decodes a fragment from an untrusted link. Never throws. */
export async function decodeShare(fragment: string): Promise<ShareResult> {
  const value = fragment.replace(/^#/, '');
  if (!value.startsWith(SHARE_PREFIX)) {
    return isShareFragment(value)
      ? { ok: false, error: 'This link was made with a newer version of Xematics.' }
      : { ok: false, error: 'This is not a Xematics share link.' };
  }
  if (value.length > MAX_FRAGMENT) return { ok: false, error: 'This link is too long to open.' };
  const bytes = base64urlDecode(value.slice(SHARE_PREFIX.length));
  if (!bytes) return { ok: false, error: 'This link is damaged (invalid characters).' };
  try {
    // UTF-8 needs at most 4 bytes per character.
    const raw = await transform(bytes, 'decompress', 'deflate-raw', LIMITS.inputChars * 4);
    const text = utf8Decode(raw);
    if (text.length > LIMITS.inputChars)
      return { ok: false, error: 'The diagram in this link is too large.' };
    return { ok: true, text };
  } catch (error) {
    if (error instanceof OutputTooLargeError)
      return { ok: false, error: 'The diagram in this link is too large.' };
    return { ok: false, error: 'This link is damaged and cannot be opened.' };
  }
}

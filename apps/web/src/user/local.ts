// What every page needs to know about the visitor without loading the editor or the cloud code:
// a copy of their name and picture (so the header can draw the profile circle at once), when this
// browser last changed the workspace, and the cloud connection. All of it lives in this browser's
// localStorage only; the workspace itself (with the real profile) is in IndexedDB (store.ts).

export const PROFILE_KEY = 'xm-profile';
export const CHANGED_KEY = 'xm-changed';
export const CLOUD_KEY = 'xm-cloud';
/** Fired on window in this tab; other tabs see the localStorage write as a `storage` event. */
export const CHANGED_EVENT = 'xm:changed';
export const CLOUD_EVENT = 'xm:cloud';

export const PROVIDERS = { google: 'Google Drive', dropbox: 'Dropbox' } as const;
export type Provider = keyof typeof PROVIDERS;

export interface ProfileMirror {
  name: string;
  picture: string | null;
  emoji: { char: string; color: string } | null;
  mono: { letters: string; color: string } | null;
}

export interface CloudState {
  provider: Provider;
  account: { name: string; email: string } | null;
  /** When the data last uploaded was gathered (ISO), or null before the first save. */
  savedAt: string | null;
  /** The cloud file's version as last seen here. */
  rev: string | null;
  /** Google Drive file id. */
  file: string | null;
  token: { access: string; expires: number } | null;
  /** Dropbox refresh token. */
  refresh: string | null;
  /** The last save failed: 'auth' needs a click to sign in again; 'error' will be retried. */
  problem?: 'auth' | 'error' | null;
}

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked; the header then simply shows the empty circle.
  }
}

export function profileMirror(): ProfileMirror | null {
  const p = readJson<ProfileMirror>(PROFILE_KEY);
  return p && typeof p === 'object' && typeof p.name === 'string' ? p : null;
}

export function cloudState(): CloudState | null {
  const s = readJson<CloudState>(CLOUD_KEY);
  return s && typeof s === 'object' && s.provider in PROVIDERS ? s : null;
}

export function changedAt(): number {
  return Date.parse(readJson<string>(CHANGED_KEY) ?? '') || 0;
}

/** True when this browser holds changes that are not in the cloud save yet. */
export function unsaved(s: CloudState | null = cloudState()): boolean {
  return !!s && changedAt() > (s.savedAt ? Date.parse(s.savedAt) : 0);
}

/** 'saved', 'pending' (changes waiting), 'auth' (needs a click) or null without a cloud. */
export function cloudDot(s: CloudState | null = cloudState()): 'saved' | 'pending' | 'auth' | null {
  if (!s) return null;
  if (s.problem === 'auth') return 'auth';
  return unsaved(s) || s.problem === 'error' ? 'pending' : 'saved';
}

/** "just now", "4 min ago", "3 h ago", "yesterday", "12 Oct". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  if (min < 48 * 60) return 'yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Calls `fn` whenever the profile, the workspace or the cloud state changes, here or in another tab. */
export function onLocalChange(fn: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || [PROFILE_KEY, CHANGED_KEY, CLOUD_KEY].includes(event.key)) fn();
  };
  addEventListener(CHANGED_EVENT, fn);
  addEventListener(CLOUD_EVENT, fn);
  addEventListener('storage', onStorage);
  return () => {
    removeEventListener(CHANGED_EVENT, fn);
    removeEventListener(CLOUD_EVENT, fn);
    removeEventListener('storage', onStorage);
  };
}

/**
 * Draws a profile circle into an `.avatar` element: the photo, the emoji or the initials on their
 * tint, or the empty person icon. Svelte's Avatar.svelte produces the same markup.
 */
export function paintAvatar(element: HTMLElement, p: ProfileMirror | null): void {
  element.querySelector('.avatar-img, .avatar-glyph')?.remove();
  const kind = p?.picture ? 'picture' : p?.emoji ? 'emoji' : p?.mono ? 'mono' : '';
  element.dataset['kind'] = kind;
  const tint = p?.emoji?.color ?? p?.mono?.color;
  if (kind !== 'picture' && tint) element.dataset['tint'] = tint;
  else delete element.dataset['tint'];
  if (p?.picture) {
    const img = document.createElement('img');
    img.className = 'avatar-img';
    img.alt = '';
    img.src = p.picture;
    element.append(img);
  } else if (p?.emoji || p?.mono) {
    const glyph = document.createElement('span');
    glyph.className = 'avatar-glyph';
    glyph.textContent = p.emoji?.char ?? p.mono?.letters ?? '';
    element.append(glyph);
  }
}

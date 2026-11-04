// Where the workspace lives in this browser: IndexedDB, stored as its file format so loading
// validates it exactly like a save file. Every save merges with what is stored (newer edits win,
// deletions are kept), so two tabs, a save file and the cloud copy never overwrite each other.

import {
  createWorkspace,
  mergeWorkspaces,
  parseWorkspace,
  serializeWorkspace,
  type Profile,
  type Workspace,
} from '@xematics/core';
import { EXAMPLES } from '../tool/documents.ts';
import { finished, KEY, loadRaw, open, STORE } from './idb.ts';
import { CHANGED_EVENT, CHANGED_KEY, PROFILE_KEY, writeJson, type ProfileMirror } from './local.ts';

export interface WorkspaceStore {
  load(): Promise<Workspace | undefined>;
  /** Merges `workspace` into the stored one and resolves to what is stored now. */
  save(workspace: Workspace): Promise<Workspace>;
}

/** Keeps the header's copy of the name and picture in step, and tells other pages and tabs. */
function announce(workspace: Workspace | undefined): void {
  const p = workspace?.profile;
  const mirror: ProfileMirror | null = p
    ? { name: p.name, picture: p.picture ?? null, emoji: p.emoji ?? null, mono: p.mono ?? null }
    : null;
  writeJson(PROFILE_KEY, mirror);
  writeJson(CHANGED_KEY, new Date().toISOString());
  dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

export const browserStore: WorkspaceStore = {
  async load() {
    const json = await loadRaw();
    if (json === undefined) return undefined;
    const result = parseWorkspace(json);
    return result.ok ? result.workspace : undefined;
  },
  async save(workspace) {
    const db = await open();
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    let result = workspace;
    let changed = false;
    // Read, merge and write in one transaction, so a save in another tab cannot slip in between.
    const request = store.get(KEY);
    request.onsuccess = () => {
      const stored =
        typeof request.result === 'string' ? parseWorkspace(request.result) : undefined;
      result = stored?.ok ? mergeWorkspaces(stored.workspace, workspace) : workspace;
      const json = serializeWorkspace(result);
      if (json !== request.result) {
        store.put(json, KEY);
        changed = true;
      }
    };
    await finished(transaction);
    if (changed) announce(result);
    return result;
  },
};

export type ProfilePatch = Partial<Pick<Profile, 'name' | 'picture' | 'emoji' | 'mono'>>;

/** Changes the name or picture. A browser with no save yet starts one with the example diagram. */
export async function updateProfile(patch: ProfilePatch): Promise<Workspace> {
  const at = new Date().toISOString();
  const current = await browserStore.load();
  const base =
    current ?? createWorkspace({ id: crypto.randomUUID(), text: EXAMPLES[2].text, updatedAt: at });
  const before = current?.profile;
  const profile: Profile = {
    name: '',
    picture: null,
    emoji: null,
    mono: null,
    ...before,
    ...patch,
    createdAt: before?.createdAt ?? at,
    updatedAt: at,
  };
  return browserStore.save({ ...base, profile });
}

/** "2 new diagrams and 1 updated", or '' when a merge brought nothing new. */
export function describeMerge(before: Workspace | undefined, after: Workspace): string {
  const old = new Map(before?.documents.map((d) => [d.id, d.updatedAt]));
  let added = 0;
  let updated = 0;
  for (const d of after.documents) {
    const seen = old.get(d.id);
    if (seen === undefined) added++;
    else if (d.updatedAt > seen) updated++;
  }
  const profile =
    !!after.profile && after.profile.updatedAt !== before?.profile?.updatedAt ? 'your profile' : '';
  const parts = [
    added && `${added} new ${added === 1 ? 'diagram' : 'diagrams'}`,
    updated && `${updated} updated`,
    profile,
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] || '';
}

/** Removes the workspace and everything kept about the visitor from this browser. */
export async function clearBrowser(): Promise<void> {
  const db = await open();
  const transaction = db.transaction(STORE, 'readwrite');
  transaction.objectStore(STORE).delete(KEY);
  await finished(transaction);
  writeJson(PROFILE_KEY, null);
  writeJson(CHANGED_KEY, null);
  dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

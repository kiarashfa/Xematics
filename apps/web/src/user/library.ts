// Changes to the visitor's diagrams made from the profile page: rename, duplicate, delete and
// restore, favorites, and default settings. Each one loads the save, changes it and saves it
// through the merging store, so an open editor or another device picks it up like any edit.

import {
  loadYaml,
  parseModel,
  updateText,
  type Workspace,
  type WorkspaceDocument,
  type WorkspaceSettings,
} from '@xematics/core';
import { starterText } from '../tool/documents.ts';
import { browserStore } from './store.ts';

const stamp = () => new Date().toISOString();

// Changes run one after another, so two quick ones (two settings, say) never both start from
// the same copy and lose each other.
let queue: Promise<unknown> = Promise.resolve();

function change(edit: (workspace: Workspace, at: string) => Workspace): Promise<Workspace> {
  const run = queue.then(async () => {
    // Retitling writes YAML, and reading YAML sources needs the reader too.
    await loadYaml();
    const workspace = await browserStore.load();
    if (!workspace) throw new Error('Nothing is saved in this browser.');
    return browserStore.save(edit(workspace, stamp()));
  });
  queue = run.catch(() => {});
  return run;
}

function find(workspace: Workspace, id: string): WorkspaceDocument {
  const doc = workspace.documents.find((d) => d.id === id);
  if (!doc) throw new Error('That diagram is no longer here.');
  return doc;
}

/** The source with a new title, or an error when the source cannot be read. */
function retitle(text: string, title: string): string {
  const parsed = parseModel(text);
  const model = parsed.model;
  if (!model) throw new Error('This diagram has errors. Fix them in the editor first.');
  const after = { ...model };
  if (title.trim()) after.title = title.trim();
  else delete after.title;
  return updateText(text, parsed.format, model, after).text;
}

export function renameDocument(id: string, title: string): Promise<Workspace> {
  return change((workspace, at) => {
    const text = retitle(find(workspace, id).text, title);
    return {
      ...workspace,
      documents: workspace.documents.map((d) => (d.id === id ? { ...d, text, updatedAt: at } : d)),
    };
  });
}

/** Adds a copy right after the original, named "… copy"; resolves to the copy's id. */
export async function duplicateDocument(id: string, name: string): Promise<string> {
  const copyId = crypto.randomUUID();
  await change((workspace, at) => {
    const doc = find(workspace, id);
    let text = doc.text;
    try {
      text = retitle(doc.text, `${name} copy`);
    } catch {
      // A source with errors is copied as it is.
    }
    const documents = [...workspace.documents];
    documents.splice(documents.indexOf(doc) + 1, 0, { id: copyId, text, updatedAt: at });
    return { ...workspace, documents };
  });
  return copyId;
}

/** Moves a diagram to Recently deleted. A save always keeps one diagram: a new one replaces it. */
export function deleteDocument(id: string): Promise<Workspace> {
  return change((workspace, at) => {
    const doc = find(workspace, id);
    let documents = workspace.documents.filter((d) => d.id !== id);
    if (documents.length === 0) {
      documents = [
        {
          id: crypto.randomUUID(),
          text: starterText(workspace.settings?.defaultPreset),
          updatedAt: at,
        },
      ];
    }
    return {
      ...workspace,
      current: workspace.current === id ? documents[0]!.id : workspace.current,
      documents,
      removed: [...(workspace.removed ?? []), { id, at, text: doc.text }],
    };
  });
}

/** Brings a diagram back from Recently deleted, as edited now. */
export function restoreDocument(id: string): Promise<Workspace> {
  return change((workspace, at) => {
    const record = workspace.removed?.find((r) => r.id === id);
    if (record?.text === undefined) throw new Error('That diagram can no longer be restored.');
    return {
      ...workspace,
      documents: [...workspace.documents, { id, text: record.text, updatedAt: at }],
    };
  });
}

/** Lets go of a deleted diagram's text now instead of after the restore period. */
export function forgetDocument(id: string): Promise<Workspace> {
  return change((workspace, at) => ({
    ...workspace,
    removed: (workspace.removed ?? []).map((r) => (r.id === id ? { id, at } : r)),
  }));
}

export function setFavorite(id: string, on: boolean): Promise<Workspace> {
  return change((workspace, at) => ({
    ...workspace,
    favorites: [...(workspace.favorites ?? []), { id, on, at }],
  }));
}

export type SettingsPatch = Omit<WorkspaceSettings, 'updatedAt'>;

/** Changes default settings; the editor and other devices take the newest settings. */
export function updateSettings(patch: SettingsPatch): Promise<Workspace> {
  return change((workspace, at) => ({
    ...workspace,
    settings: { ...workspace.settings, ...patch, updatedAt: at },
  }));
}

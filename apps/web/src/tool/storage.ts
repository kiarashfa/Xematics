// Where the workspace lives. Today: this browser's IndexedDB. Cloud storage (v1.1) will be another
// WorkspaceStore, so the editor does not need to change.

import { parseWorkspace, serializeWorkspace, type Workspace } from '@xematics/core';

export interface WorkspaceStore {
  load(): Promise<Workspace | undefined>;
  save(workspace: Workspace): Promise<void>;
}

const DB_NAME = 'xematics';
const STORE = 'workspace';
const KEY = 'current';

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let database: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

/** The workspace is stored as its file format, so loading validates it exactly like a file. */
export const browserStore: WorkspaceStore = {
  async load() {
    const db = await open();
    const json = await done(db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY));
    if (typeof json !== 'string') return undefined;
    const result = parseWorkspace(json);
    return result.ok ? result.workspace : undefined;
  },
  async save(workspace) {
    const db = await open();
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(serializeWorkspace(workspace), KEY);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  },
};

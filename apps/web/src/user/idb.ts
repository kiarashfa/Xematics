// The browser database that holds the workspace (as save file text). Kept apart from store.ts so
// the site header can read the save without loading the diagram engine.

const DB_NAME = 'xematics';
export const STORE = 'workspace';
export const KEY = 'current';

let database: Promise<IDBDatabase> | undefined;

export function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

export function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** The stored save file as text, or undefined when this browser has none. */
export async function loadRaw(): Promise<string | undefined> {
  const db = await open();
  const transaction = db.transaction(STORE, 'readonly');
  const request = transaction.objectStore(STORE).get(KEY);
  await finished(transaction);
  return typeof request.result === 'string' ? request.result : undefined;
}

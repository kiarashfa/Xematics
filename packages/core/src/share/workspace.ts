// The workspace file: every document plus editor settings, versioned so it can be opened by later
// versions (and, from v1.1, synced to cloud storage). Loading a workspace file is the "login" of
// Xematics: there are no accounts.

import * as v from 'valibot';
import { LIMITS } from '../model/schema.ts';

export const WORKSPACE_FORMAT = 'xematics-workspace';
export const WORKSPACE_VERSION = 1;
const MAX_DOCUMENTS = 500;
const MAX_FILE_CHARS = 60_000_000;

const DocumentSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{1,64}$/)),
  text: v.pipe(v.string(), v.maxLength(LIMITS.inputChars)),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});

// Plain objects (not strict): files from later v1 releases may carry extra keys.
const WorkspaceSchema = v.object({
  format: v.literal(WORKSPACE_FORMAT),
  version: v.literal(WORKSPACE_VERSION),
  current: v.string(),
  documents: v.pipe(v.array(DocumentSchema), v.minLength(1), v.maxLength(MAX_DOCUMENTS)),
  settings: v.optional(v.object({ liveText: v.optional(v.boolean()) })),
});

export type Workspace = v.InferOutput<typeof WorkspaceSchema>;
export type WorkspaceDocument = Workspace['documents'][number];
export type WorkspaceResult = { ok: true; workspace: Workspace } | { ok: false; error: string };

export function createWorkspace(document: WorkspaceDocument): Workspace {
  return {
    format: WORKSPACE_FORMAT,
    version: WORKSPACE_VERSION,
    current: document.id,
    documents: [document],
  };
}

export function serializeWorkspace(workspace: Workspace): string {
  return `${JSON.stringify(workspace, null, 2)}\n`;
}

/** Parses an untrusted workspace file. Never throws. */
export function parseWorkspace(json: string): WorkspaceResult {
  if (json.length > MAX_FILE_CHARS)
    return { ok: false, error: 'This workspace file is too large.' };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'This is not a Xematics workspace file (it is not valid JSON).' };
  }
  const header = raw as { format?: unknown; version?: unknown } | null;
  if (header?.format !== WORKSPACE_FORMAT)
    return { ok: false, error: 'This is not a Xematics workspace file.' };
  if (typeof header.version === 'number' && header.version > WORKSPACE_VERSION) {
    return { ok: false, error: 'This workspace was saved by a newer version of Xematics.' };
  }
  const result = v.safeParse(WorkspaceSchema, raw);
  if (!result.success) return { ok: false, error: 'This workspace file is damaged or incomplete.' };
  const workspace = result.output;
  const ids = new Set(workspace.documents.map((d) => d.id));
  if (ids.size !== workspace.documents.length)
    return { ok: false, error: 'This workspace file has duplicate documents.' };
  return {
    ok: true,
    workspace: ids.has(workspace.current)
      ? workspace
      : { ...workspace, current: workspace.documents[0]!.id },
  };
}

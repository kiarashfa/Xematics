// The workspace file (the "save file"): every document, editor settings, the profile (name and
// picture) and a record of deleted documents, versioned so it can be opened by later versions and
// synced to cloud storage. Loading a save file is the "login" of Xematics: there are no accounts.

import * as v from 'valibot';
import { LIMITS } from '../model/schema.ts';

export const WORKSPACE_FORMAT = 'xematics-workspace';
export const WORKSPACE_VERSION = 1;
const MAX_DOCUMENTS = 500;
const MAX_FILE_CHARS = 60_000_000;
/** Deletion records kept; the oldest go first (a very old copy may then bring a document back). */
const MAX_REMOVED = 1000;

export const PROFILE_NAME_MAX = 40;
/** A 256 px WebP is about 8 to 20 KB as a data URL; anything far past that is not ours. */
const PICTURE_MAX = 200_000;
/** Monogram tints; the site draws each as a fixed background and ink color. */
export const MONO_COLORS = [
  'blue',
  'amber',
  'sand',
  'green',
  'rose',
  'night',
  'violet',
  'paper',
] as const;
export type MonoColor = (typeof MONO_COLORS)[number];
/** Ready-made emoji pictures (twelve, so the picker's rows are always full). */
export const AVATAR_EMOJIS = [
  '\u{1F9D1}‍\u{1F52C}', // scientist
  '\u{1F468}‍\u{1F52C}', // man scientist
  '\u{1F469}', // woman
  '\u{1F468}', // man
  '\u{1F575}️‍♀️', // woman detective
  '\u{1F575}️‍♂️', // man detective
  '\u{1F469}‍\u{1F393}', // woman student
  '\u{1F468}‍\u{1F393}', // man student
  '\u{1F469}‍\u{1F680}', // woman astronaut
  '\u{1F468}‍\u{1F680}', // man astronaut
  '\u{1F9D1}‍\u{1F4BB}', // technologist
  '\u{1F916}', // robot
] as const;

const DocumentSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{1,64}$/)),
  text: v.pipe(v.string(), v.maxLength(LIMITS.inputChars)),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});

const Timestamp = v.pipe(v.string(), v.isoTimestamp());

const ProfileSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.maxLength(PROFILE_NAME_MAX)),
  picture: v.nullish(
    v.pipe(
      v.string(),
      v.maxLength(PICTURE_MAX),
      v.regex(/^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/),
    ),
  ),
  mono: v.nullish(
    v.object({
      letters: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(3)),
      color: v.picklist(MONO_COLORS),
    }),
  ),
  emoji: v.nullish(
    v.object({
      char: v.picklist(AVATAR_EMOJIS),
      color: v.picklist(MONO_COLORS),
    }),
  ),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

const Id = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{1,64}$/));

const RemovedSchema = v.object({
  id: Id,
  at: Timestamp,
  /** The deleted source, kept for RESTORE_DAYS so it can be restored. */
  text: v.optional(v.pipe(v.string(), v.maxLength(LIMITS.inputChars))),
});

const FavoriteSchema = v.object({ id: Id, on: v.boolean(), at: Timestamp });

/** Days a deleted document can be restored; after that only the record of its deletion stays. */
export const RESTORE_DAYS = 30;

// Plain objects (not strict): files from later v1 releases may carry extra keys.
const WorkspaceSchema = v.object({
  format: v.literal(WORKSPACE_FORMAT),
  version: v.literal(WORKSPACE_VERSION),
  current: v.string(),
  documents: v.pipe(v.array(DocumentSchema), v.minLength(1), v.maxLength(MAX_DOCUMENTS)),
  // Values are checked by the editor, so a setting a later release adds or changes never makes an
  // older file unreadable.
  settings: v.optional(
    v.object({
      liveText: v.optional(v.boolean()),
      exportFormat: v.optional(v.string()),
      pngDpi: v.optional(v.number()),
      tikzStandalone: v.optional(v.boolean()),
      /** Style preset for new diagrams. */
      defaultPreset: v.optional(v.string()),
      /** When any setting last changed, so the newer settings win a merge. */
      updatedAt: v.optional(Timestamp),
    }),
  ),
  // Checked on their own below: a damaged profile or record never makes the documents unreadable.
  profile: v.optional(v.unknown()),
  removed: v.optional(v.unknown()),
  favorites: v.optional(v.unknown()),
});

type ParsedWorkspace = v.InferOutput<typeof WorkspaceSchema>;
export type Profile = v.InferOutput<typeof ProfileSchema>;
export type RemovedDocument = v.InferOutput<typeof RemovedSchema>;
export type Favorite = v.InferOutput<typeof FavoriteSchema>;
export type WorkspaceSettings = NonNullable<ParsedWorkspace['settings']>;
export type Workspace = Omit<ParsedWorkspace, 'profile' | 'removed' | 'favorites'> & {
  /** Name and picture; absent until the visitor sets one. */
  profile?: Profile;
  /** Documents deleted on some device, so a merge does not bring them back. */
  removed?: RemovedDocument[];
  /** Favourite marks; the latest mark of each document wins a merge. */
  favorites?: Favorite[];
};
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
  const {
    profile: rawProfile,
    removed: rawRemoved,
    favorites: rawFavorites,
    ...workspace
  } = result.output;
  const ids = new Set(workspace.documents.map((d) => d.id));
  if (ids.size !== workspace.documents.length)
    return { ok: false, error: 'This workspace file has duplicate documents.' };
  const parsed: Workspace = ids.has(workspace.current)
    ? workspace
    : { ...workspace, current: workspace.documents[0]!.id };
  const profile = parseProfile(rawProfile);
  if (profile) parsed.profile = profile;
  const removed = validItems(RemovedSchema, rawRemoved);
  if (removed.length > 0) parsed.removed = trimRemoved(removed);
  const favorites = latestMarks(validItems(FavoriteSchema, rawFavorites));
  if (favorites.length > 0) parsed.favorites = favorites;
  return { ok: true, workspace: parsed };
}

function validItems<T extends v.GenericSchema>(schema: T, raw: unknown): v.InferOutput<T>[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const result = v.safeParse(schema, item);
    return result.success ? [result.output] : [];
  });
}

/** One favourite mark per document: the latest. */
function latestMarks(marks: readonly Favorite[]): Favorite[] {
  const latest = new Map<string, Favorite>();
  for (const m of marks) {
    const seen = latest.get(m.id);
    if (!seen || m.at > seen.at) latest.set(m.id, { id: m.id, on: m.on, at: m.at });
  }
  return [...latest.values()];
}

/** Ids of the documents marked as favourites. */
export function favoriteIds(workspace: Workspace): Set<string> {
  return new Set((workspace.favorites ?? []).filter((f) => f.on).map((f) => f.id));
}

/**
 * Forgets the text of documents deleted more than RESTORE_DAYS before `now`, so the save file
 * does not grow forever; the record of the deletion stays.
 */
export function pruneRemoved(workspace: Workspace, now: number): Workspace {
  const limit = new Date(now - RESTORE_DAYS * 86_400_000).toISOString();
  if (!workspace.removed?.some((r) => r.text !== undefined && r.at < limit)) return workspace;
  return {
    ...workspace,
    removed: workspace.removed.map((r) => (r.at < limit ? { id: r.id, at: r.at } : r)),
  };
}

/** A valid profile, or undefined. One look is kept: a picture, else an emoji, else initials. */
export function parseProfile(raw: unknown): Profile | undefined {
  const result = v.safeParse(ProfileSchema, raw);
  if (!result.success) return undefined;
  const { picture, emoji, mono, ...rest } = result.output;
  return {
    ...rest,
    picture: picture ?? null,
    emoji: picture ? null : (emoji ?? null),
    mono: picture || emoji ? null : (mono ?? null),
  };
}

/** One record per document (the latest), oldest first, at most MAX_REMOVED. */
function trimRemoved(removed: readonly RemovedDocument[]): RemovedDocument[] {
  const latest = new Map<string, RemovedDocument>();
  for (const r of removed) {
    // The newest record wins whole (a later "delete forever" drops the text); the same record
    // from two copies keeps the text if either has it.
    const seen = latest.get(r.id);
    const item =
      r.text === undefined ? { id: r.id, at: r.at } : { id: r.id, at: r.at, text: r.text };
    if (!seen || r.at > seen.at || (r.at === seen.at && seen.text === undefined))
      latest.set(r.id, item);
  }
  return [...latest.values()].sort((a, b) => (a.at < b.at ? -1 : 1)).slice(-MAX_REMOVED);
}

/**
 * Joins two copies of a workspace (this browser and a file or cloud copy). Documents are joined by
 * id and the newer edit wins; a document deleted after its last edit stays deleted; the newer
 * profile wins. Settings and the open document come from `incoming` when it has them. `base`
 * documents keep their order and new ones follow.
 */
export function mergeWorkspaces(base: Workspace, incoming: Workspace): Workspace {
  const removed = trimRemoved([...(base.removed ?? []), ...(incoming.removed ?? [])]);
  const deletedAt = new Map(removed.map((r) => [r.id, r.at]));
  const byId = new Map<string, WorkspaceDocument>();
  for (const doc of [...base.documents, ...incoming.documents]) {
    const seen = byId.get(doc.id);
    if (!seen || doc.updatedAt >= seen.updatedAt) byId.set(doc.id, doc);
  }
  let documents = [...byId.values()].filter((d) => {
    const at = deletedAt.get(d.id);
    return at === undefined || d.updatedAt > at;
  });
  // A workspace always keeps one document: the most recently edited one comes back.
  if (documents.length === 0) {
    documents = [[...byId.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]!];
  }
  const ids = new Set(documents.map((d) => d.id));
  const current = [incoming.current, base.current].find((id) => ids.has(id)) ?? documents[0]!.id;
  const merged: Workspace = {
    format: WORKSPACE_FORMAT,
    version: WORKSPACE_VERSION,
    current,
    documents: documents.map((d) => ({ ...d })),
  };
  const settings = newerSettings(base.settings, incoming.settings);
  if (settings) merged.settings = { ...settings };
  const profile = newer(base.profile, incoming.profile);
  if (profile) merged.profile = { ...profile, createdAt: earliest(base.profile, incoming.profile) };
  // Records of documents that are back (edited after the deletion) are no longer needed. A record
  // without the deleted text takes it from the copy being dropped, so it can still be restored.
  const kept = removed
    .filter((r) => !ids.has(r.id))
    .map((r) => {
      const dropped = byId.get(r.id);
      return r.text === undefined && dropped ? { ...r, text: dropped.text } : r;
    });
  if (kept.length > 0) merged.removed = kept;
  const favorites = latestMarks([...(base.favorites ?? []), ...(incoming.favorites ?? [])]).filter(
    (f) => ids.has(f.id) || deletedAt.has(f.id),
  );
  if (favorites.length > 0) merged.favorites = favorites;
  return merged;
}

/** The settings changed last; without dates, those of `incoming` when it has any. */
function newerSettings(
  base: WorkspaceSettings | undefined,
  incoming: WorkspaceSettings | undefined,
): WorkspaceSettings | undefined {
  if (!base || !incoming) return incoming ?? base;
  return (base.updatedAt ?? '') > (incoming.updatedAt ?? '') ? base : incoming;
}

function newer(a: Profile | undefined, b: Profile | undefined): Profile | undefined {
  if (!a || !b) return a ?? b;
  return b.updatedAt >= a.updatedAt ? b : a;
}

function earliest(a: Profile | undefined, b: Profile | undefined): string {
  return [a?.createdAt, b?.createdAt].filter((t): t is string => !!t).sort()[0]!;
}

<script lang="ts">
  // /user/: the visitor's profile. With nothing in this browser yet it welcomes them: start a
  // profile, or bring a save (the "login"). Otherwise the left column holds the picture, name and
  // numbers, then cloud save, the save file and signing out; the right side is their gallery.
  import { PROFILE_NAME_MAX, parseWorkspace, type Workspace } from '@xematics/core';
  import { onMount } from 'svelte';
  import { PRESET_CHOICES } from '../tool/documents.ts';
  import { EXPORT_FORMATS, PNG_SIZES } from '../tool/formats.ts';
  import Avatar from './Avatar.svelte';
  import CloudSave from './CloudSave.svelte';
  import Gallery from './Gallery.svelte';
  import type PicturePicker from './PicturePicker.svelte';
  import type { SettingsPatch } from './library.ts';
  import type * as Render from './render.ts';
  import { finishDropbox, isDropboxReturn, startAutoSave } from './cloud.ts';
  import { loadRaw } from './idb.ts';
  import { ago, cloudState, onLocalChange } from './local.ts';
  import { browserStore, describeMerge, updateProfile } from './store.ts';
  import { visitor } from './visitor.svelte.ts';

  const MAX_FILE_BYTES = 60_000_000;

  let workspace = $state.raw<Workspace | undefined>(undefined);
  let loaded = $state(false);
  let blocked = $state(false);
  let notice = $state('');
  let noticeError = $state(false);
  let noticeUndo = $state.raw<(() => void) | null>(null);
  let picking = $state(false);
  let Picker = $state.raw<typeof PicturePicker | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();
  let confirming = $state(false);
  let leaving = $state(false);

  // Numbers and previews: the engine loads after the page shows.
  let render = $state.raw<typeof Render | null>(null);

  const profile = $derived(workspace?.profile);
  const documents = $derived(workspace?.documents ?? []);
  const latest = $derived(
    documents.reduce<string | undefined>(
      (max, d) => (!max || d.updatedAt > max ? d.updatedAt : max),
      undefined,
    ),
  );
  const earliest = $derived(
    documents.reduce<string | undefined>(
      (min, d) => (!min || d.updatedAt < min ? d.updatedAt : min),
      undefined,
    ),
  );
  const neurons = $derived(
    render ? documents.reduce((sum, d) => sum + render!.facts(d.text).neurons, 0) : null,
  );
  const since = $derived(profile?.createdAt ?? earliest);
  const welcome = $derived(loaded && !workspace);
  const settings = $derived(workspace?.settings);

  async function setDefault(patch: SettingsPatch) {
    try {
      await (await import('./library.ts')).updateSettings(patch);
    } catch {
      say('This browser blocks site storage, so the setting could not be kept.', true);
    }
  }

  async function reload() {
    const had = !!workspace;
    try {
      workspace = await browserStore.load();
      // Signed out (here or in the header menu): earlier messages no longer apply.
      if (had && !workspace) notice = '';
      blocked = false;
    } catch {
      blocked = true;
    }
    loaded = true;
  }

  function say(message: string, error = false, undo?: () => void) {
    notice = message;
    noticeError = error;
    noticeUndo = undo ?? null;
  }

  async function openPicker() {
    Picker ??= (await import('./PicturePicker.svelte')).default;
    picking = true;
  }

  // The name, edited in place.
  let editing = $state(false);
  let draft = $state('');
  let nameInput: HTMLInputElement | undefined = $state();
  function editName() {
    draft = profile?.name ?? '';
    editing = true;
    requestAnimationFrame(() => nameInput?.select());
  }
  async function saveName(event?: Event) {
    event?.preventDefault();
    if (!editing) return;
    editing = false;
    if (draft.trim() !== (profile?.name ?? '')) {
      try {
        await updateProfile({ name: draft.trim().slice(0, PROFILE_NAME_MAX) });
      } catch {
        say('This browser blocks site storage, so the name could not be kept.', true);
      }
    }
  }

  async function openFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return say('That save file is too large.', true);
    const parsed = parseWorkspace(await file.text());
    if (!parsed.ok) return say(parsed.error, true);
    try {
      const before = await browserStore.load();
      const brought = describeMerge(before, await browserStore.save(parsed.workspace));
      say(
        brought
          ? `Opened ${file.name}: ${brought}.`
          : `Everything in ${file.name} was already here.`,
      );
    } catch {
      say('This browser blocks site storage, so the save could not be opened here.', true);
    }
  }

  async function download() {
    const raw = await loadRaw().catch(() => undefined);
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'xematics-save.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Diagrams kept only here get a warning first; with a cloud save, signing out is immediate. */
  function askSignOut() {
    if (visitor.cloud) void signOut();
    else confirming = true;
  }

  async function signOut() {
    leaving = true;
    try {
      const m = await import('./signout.ts');
      await m.signOut();
      await reload();
      confirming = false;
      say('Signed out of this browser.');
    } catch (error) {
      say(error instanceof Error ? error.message : 'Signing out did not work.', true);
    } finally {
      leaving = false;
    }
  }

  onMount(() => {
    visitor.start();
    const off = onLocalChange(() => void reload());
    void reload();
    if (isDropboxReturn()) {
      say('Connecting Dropbox…');
      finishDropbox().then(
        (r) => say(r.imported ? `Brought in ${r.imported} from Dropbox.` : 'Saved to Dropbox.'),
        (error: unknown) =>
          say(error instanceof Error ? error.message : 'Dropbox did not connect.', true),
      );
    }
    if (cloudState()) {
      startAutoSave();
      void import('./signout.ts').then((m) => m.warmUp());
    }
    void import('./render.ts').then((m) => (render = m));
    return off;
  });
</script>

{#snippet editButton(label: string, onclick: () => void)}
  <button type="button" class="pencil" aria-label={label} title={label} {onclick}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"></path></svg>
  </button>
{/snippet}

<input
  bind:this={fileInput}
  type="file"
  accept=".json,application/json"
  hidden
  onchange={openFile}
/>

{#if notice}
  <p class="notice" class:error={noticeError} role="status">
    {notice}
    {#if noticeUndo}
      <button
        type="button"
        class="undo"
        onclick={() => {
          const undo = noticeUndo;
          noticeUndo = null;
          undo?.();
        }}>Undo</button
      >
    {/if}
  </p>
{/if}

{#if !loaded}
  <div class="placeholder" aria-hidden="true"></div>
{:else if blocked}
  <p class="notice error">
    This browser blocks site storage, so nothing can be kept here. Allow site data for this site, or
    use another browser.
  </p>
{:else if welcome}
  <!-- One panel: start a profile here, or bring a save (the "login"). -->
  <section class="welcome" aria-labelledby="welcome-title">
    <span class="pic">
      <Avatar profile={null} size={104} />
    </span>
    <h1 id="welcome-title">Your desk</h1>
    <p class="lead">
      No accounts and no passwords. Your diagrams live in this browser. Give them a name and a face,
      or bring your save from another device.
    </p>
    <button type="button" class="btn btn-primary start" onclick={openPicker}
      >Set up your profile</button
    >
    <p class="or"><span>or bring your save</span></p>
    <CloudSave compact onresult={say}>
      {#snippet extra()}
        <button type="button" class="btn" onclick={() => fileInput?.click()}
          >Open a save file…</button
        >
      {/snippet}
    </CloudSave>
    <p class="hint">
      Your save is your key: open it from your cloud or from the file, and it joins anything already
      in this browser.
    </p>
  </section>
{:else}
  <div class="layout">
    <div class="card who">
      <span class="pic">
        <Avatar profile={visitor.profile} size={112} />
        {@render editButton('Change your picture', openPicker)}
      </span>
      {#if editing}
        <form class="name-form" onsubmit={saveName}>
          <label class="sr-only" for="profile-name">Your name</label>
          <input
            id="profile-name"
            bind:this={nameInput}
            bind:value={draft}
            maxlength={PROFILE_NAME_MAX}
            autocomplete="name"
            onblur={() => saveName()}
            onkeydown={(e) => {
              if (e.key === 'Escape') editing = false;
            }}
          />
        </form>
      {:else}
        <h1 class="name">{profile?.name || 'Your desk'}</h1>
        <button type="button" class="link" onclick={editName}
          >{profile?.name ? 'Edit name' : 'Add your name'}</button
        >
      {/if}
      <dl class="numbers">
        <div>
          <dt>diagrams</dt>
          <dd>{documents.length}</dd>
        </div>
        <div>
          <dt>neurons drawn</dt>
          <dd>{neurons === null ? '…' : neurons.toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>since</dt>
          <dd>
            {since
              ? new Date(since).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
              : '-'}
          </dd>
        </div>
        <div>
          <dt>last edit</dt>
          <dd>{latest ? ago(latest, visitor.now) : '-'}</dd>
        </div>
      </dl>
    </div>

    <div class="main">
      {#if workspace}
        <Gallery {workspace} {render} now={visitor.now} onnotice={say} />
      {/if}
    </div>

    <div class="account">
      <section class="card" aria-labelledby="cloud-title">
        <h2 id="cloud-title">Cloud save</h2>
        <CloudSave onresult={say} />
      </section>

      <section class="card" aria-labelledby="file-title">
        <h2 id="file-title">Save file</h2>
        <p>Everything in one file. Opening it on another device joins it with what is there.</p>
        <div class="buttons">
          <button type="button" class="btn" onclick={download}>Download</button>
          <button type="button" class="btn quiet" onclick={() => fileInput?.click()}>Open…</button>
        </div>
      </section>

      <section class="card defaults" aria-labelledby="defaults-title">
        <h2 id="defaults-title">Defaults</h2>
        <label>
          <span>Style for new diagrams</span>
          <select
            value={settings?.defaultPreset ?? 'classic'}
            onchange={(e) => setDefault({ defaultPreset: e.currentTarget.value })}
          >
            {#each PRESET_CHOICES as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
          </select>
        </label>
        <label>
          <span>Export button</span>
          <select
            value={settings?.exportFormat ?? 'svg'}
            onchange={(e) => setDefault({ exportFormat: e.currentTarget.value })}
          >
            {#each EXPORT_FORMATS as f (f.id)}<option value={f.id}>{f.menu}</option>{/each}
          </select>
        </label>
        <label>
          <span>PNG resolution</span>
          <select
            value={settings?.pngDpi ?? 300}
            onchange={(e) => setDefault({ pngDpi: Number(e.currentTarget.value) })}
          >
            {#each PNG_SIZES as size (size.dpi)}<option value={size.dpi}>{size.label}</option
              >{/each}
          </select>
        </label>
        <label>
          <span>Text in SVG</span>
          <select
            value={settings?.liveText ? 'live' : 'outline'}
            onchange={(e) => setDefault({ liveText: e.currentTarget.value === 'live' })}
          >
            <option value="outline">Outlined</option>
            <option value="live">Editable</option>
          </select>
        </label>
        <label>
          <span>TikZ</span>
          <select
            value={settings?.tikzStandalone === false ? 'picture' : 'standalone'}
            onchange={(e) => setDefault({ tikzStandalone: e.currentTarget.value === 'standalone' })}
          >
            <option value="standalone">Standalone document</option>
            <option value="picture">Picture only</option>
          </select>
        </label>
        <p class="small">
          Used by the editor, and saved with your diagrams for your other devices.
        </p>
      </section>

      <section class="card" aria-labelledby="browser-title">
        <h2 id="browser-title">This browser</h2>
        {#if confirming}
          <p>
            Your {documents.length === 1 ? 'diagram is' : `${documents.length} diagrams are`} kept only
            in this browser. Download the save file first to keep {documents.length === 1
              ? 'it'
              : 'them'}.
          </p>
          <div class="buttons">
            <button type="button" class="btn" onclick={download}>Download</button>
            <button type="button" class="btn danger" disabled={leaving} onclick={signOut}
              >{leaving ? 'Signing out…' : 'Sign out'}</button
            >
            <button type="button" class="btn quiet" onclick={() => (confirming = false)}
              >Cancel</button
            >
          </div>
        {:else}
          <p>On a shared computer, sign out to remove your diagrams, name and picture from it.</p>
          <div class="buttons">
            <button type="button" class="btn danger" disabled={leaving} onclick={askSignOut}
              >{leaving ? 'Signing out…' : 'Sign out of this browser'}</button
            >
          </div>
        {/if}
      </section>
    </div>
  </div>
{/if}

{#if picking && Picker}
  <Picker profile={visitor.profile} onclose={() => (picking = false)} />
{/if}

<style>
  .placeholder {
    min-height: 60vh;
  }

  .notice {
    margin: 0 0 18px;
    padding: 10px 14px;
    border-left: 3px solid var(--accent);
    background: var(--surface-2);
  }

  .undo {
    margin-left: 10px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    cursor: pointer;
  }

  .defaults {
    display: grid;
    gap: 10px;
  }

  .defaults h2 {
    margin-bottom: 0;
  }

  .defaults label {
    display: grid;
    gap: 3px;
    font-size: 0.85rem;
  }

  .defaults label span {
    color: var(--muted);
  }

  .defaults select {
    height: 34px;
    padding: 0 8px;
    border: 1px solid var(--line);
    border-radius: 2px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 0.9rem;
  }

  .defaults .small {
    color: var(--muted);
    font-size: 0.8rem;
  }

  .notice.error {
    border-left-color: var(--danger);
  }

  /* The first-visit panel: one column in the middle of the page. */
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(620px, 100%);
    margin: 10px auto 0;
    padding: 36px 32px 30px;
    text-align: center;
    background: var(--surface);
    border-top: 1px solid var(--ink);
    border-bottom: 3px double var(--ink);
  }

  .welcome h1 {
    margin: 14px 0 6px;
    font-size: 2.2rem;
    letter-spacing: -0.01em;
  }

  .welcome .lead {
    margin: 0;
  }

  .welcome .start {
    margin-top: 22px;
    cursor: pointer;
  }

  .or {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    margin: 26px 0 16px;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .or::before,
  .or::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--line);
  }

  .hint {
    margin: 16px 0 0;
    color: var(--muted);
    font-size: 0.85rem;
  }

  /* Left column: profile card, then the account cards; the gallery spans the right side. */
  .layout {
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    grid-template-areas:
      'who main'
      'account main';
    gap: 16px 40px;
    align-items: start;
  }

  .who {
    grid-area: who;
  }

  .main {
    grid-area: main;
  }

  .account {
    grid-area: account;
    display: grid;
    gap: 16px;
  }

  .card {
    padding: 18px;
    border: 1px solid var(--line);
    background: var(--surface);
  }

  .card h2 {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .card p {
    margin: 0;
    font-size: 0.9rem;
  }

  .who {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .pic {
    position: relative;
    display: inline-grid;
    margin-bottom: 12px;
  }

  .pencil {
    position: absolute;
    right: 2px;
    bottom: 2px;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    background: var(--ink);
    color: var(--bg);
    cursor: pointer;
  }

  .pencil svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .name {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .name-form input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--accent);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 1.2rem;
    font-weight: 600;
    text-align: center;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .numbers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    width: 100%;
    margin: 18px 0 0;
    text-align: left;
  }

  .numbers div {
    display: flex;
    flex-direction: column-reverse;
    padding-top: 6px;
    border-top: 1px solid var(--line);
  }

  .numbers dd {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
  }

  .numbers dt {
    color: var(--muted);
    font-size: 0.8rem;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .btn {
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .quiet {
    background: none;
  }

  .danger {
    border-color: var(--danger);
    color: var(--danger);
    background: none;
  }

  /* Phones and narrow windows: profile, gallery, then the account cards. */
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: none;
      grid-template-areas:
        'who'
        'main'
        'account';
      gap: 26px;
    }
  }
</style>

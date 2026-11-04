<script lang="ts">
  // The profile picture dialog: an emoji on a tint, initials on a tint, or an uploaded photo. A
  // photo goes through a round cropper (drag to place; slider, wheel or +/- to zoom; arrow keys to
  // move) and is stored as one 256 px image, so the save file grows by a few KB, not by the photo.
  import { AVATAR_EMOJIS, MONO_COLORS, type MonoColor } from '@xematics/core';
  import { onMount, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import Avatar from './Avatar.svelte';
  import type { ProfileMirror } from './local.ts';
  import { updateProfile, type ProfilePatch } from './store.ts';

  let { profile, onclose }: { profile: ProfileMirror | null; onclose: () => void } = $props();
  const initial = untrack(() => profile);

  const CROP = 200;
  const narrow = new MediaQuery('max-width: 600px');
  const MAX_ZOOM = 4;
  const SIZE = 256;
  const TINT_NAMES: Record<MonoColor, string> = {
    blue: 'Blue',
    amber: 'Amber',
    sand: 'Sand',
    green: 'Green',
    rose: 'Rose',
    night: 'Night',
    violet: 'Violet',
    paper: 'Paper',
  };
  const EMOJI_NAMES = [
    'Scientist',
    'Man scientist',
    'Woman',
    'Man',
    'Woman detective',
    'Man detective',
    'Woman student',
    'Man student',
    'Woman astronaut',
    'Man astronaut',
    'Technologist',
    'Robot',
  ];

  type Tab = 'emoji' | 'initials' | 'upload';
  let dialog: HTMLDialogElement | undefined = $state();
  let tab = $state<Tab>(initial?.picture ? 'upload' : initial?.mono ? 'initials' : 'emoji');
  let error = $state('');
  let saving = $state(false);

  let emoji = $state<string>(initial?.emoji?.char ?? AVATAR_EMOJIS[0]);
  let emojiTint = $state<MonoColor>((initial?.emoji?.color as MonoColor) ?? 'blue');
  let letters = $state(initial?.mono?.letters ?? initialsOf(initial?.name ?? ''));
  let lettersTint = $state<MonoColor>((initial?.mono?.color as MonoColor) ?? 'blue');

  function initialsOf(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    const first = [...words[0]!][0] ?? '';
    const last = words.length > 1 ? ([...words.at(-1)!][0] ?? '') : ([...words[0]!][1] ?? '');
    return (first + last).toUpperCase();
  }

  // Cropper: the image, its cover scale, zoom and offset in CSS px.
  let src = $state('');
  let img: HTMLImageElement | undefined = $state();
  let natural = $state<{ w: number; h: number } | null>(null);
  let zoom = $state(1);
  let x = $state(0);
  let y = $state(0);
  let photo = $state<string | null>(initial?.picture ?? null);
  let kb = $state(0);
  let fileInput: HTMLInputElement | undefined = $state();

  const base = $derived(natural ? Math.max(CROP / natural.w, CROP / natural.h) : 1);
  const transform = $derived(
    natural
      ? `translate(${x - (natural.w * base * zoom) / 2}px, ${y - (natural.h * base * zoom) / 2}px) scale(${base * zoom})`
      : '',
  );

  function clamp() {
    if (!natural) return;
    const k = base * zoom;
    const mx = Math.max(0, (natural.w * k - CROP) / 2);
    const my = Math.max(0, (natural.h * k - CROP) / 2);
    x = Math.min(mx, Math.max(-mx, x));
    y = Math.min(my, Math.max(-my, y));
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      error = 'That is not an image file.';
      return;
    }
    error = '';
    if (src) URL.revokeObjectURL(src);
    natural = null;
    zoom = 1;
    x = y = 0;
    src = URL.createObjectURL(file);
  }

  function onLoad() {
    if (!img) return;
    natural = { w: img.naturalWidth, h: img.naturalHeight };
    clamp();
    schedule();
  }

  let drag: { x: number; y: number } | null = null;
  function down(e: PointerEvent) {
    if (!natural) return;
    drag = { x: e.clientX - x, y: e.clientY - y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    x = e.clientX - drag.x;
    y = e.clientY - drag.y;
    clamp();
  }
  function up() {
    if (!drag) return;
    drag = null;
    schedule();
  }
  function setZoom(z: number) {
    zoom = Math.min(MAX_ZOOM, Math.max(1, z));
    clamp();
    schedule();
  }
  function wheel(e: WheelEvent) {
    if (!natural) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.08 : 0.93));
  }
  function key(e: KeyboardEvent) {
    if (!natural) return;
    const step = e.shiftKey ? 20 : 6;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      x += m[0];
      y += m[1];
      clamp();
      schedule();
    } else if (e.key === '+' || e.key === '=') setZoom(zoom * 1.1);
    else if (e.key === '-') setZoom(zoom / 1.1);
  }

  // The stored image: what the circle shows, at 256 px, as WebP where the browser can (else JPEG).
  function render(): string | null {
    if (!img || !natural) return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const g = canvas.getContext('2d');
    if (!g) return null;
    const r = SIZE / CROP;
    const k = base * zoom * r;
    g.imageSmoothingQuality = 'high';
    g.drawImage(
      img,
      SIZE / 2 + x * r - (natural.w * k) / 2,
      SIZE / 2 + y * r - (natural.h * k) / 2,
      natural.w * k,
      natural.h * k,
    );
    const webp = canvas.toDataURL('image/webp', 0.82);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      photo = render();
      kb = photo ? Math.round((photo.length * 3) / 4 / 1024) : 0;
    }, 100);
  }

  const cleanLetters = $derived(letters.trim().toUpperCase());
  const preview = $derived<ProfileMirror | null>(
    tab === 'emoji'
      ? { name: '', picture: null, mono: null, emoji: { char: emoji, color: emojiTint } }
      : tab === 'initials'
        ? cleanLetters
          ? {
              name: '',
              picture: null,
              emoji: null,
              mono: { letters: cleanLetters, color: lettersTint },
            }
          : null
        : photo
          ? { name: '', picture: photo, emoji: null, mono: null }
          : null,
  );

  async function save(patch: ProfilePatch) {
    saving = true;
    try {
      await updateProfile(patch);
      dialog?.close();
    } catch {
      error = 'This browser blocks site storage, so the picture could not be kept.';
    } finally {
      saving = false;
    }
  }

  function use() {
    if (!preview) return;
    void save({
      picture: preview.picture,
      emoji: preview.emoji,
      mono: preview.mono,
    } as ProfilePatch);
  }

  onMount(() => {
    dialog?.showModal();
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  });
</script>

{#snippet tints(current: MonoColor, pick: (c: MonoColor) => void)}
  <div class="tints" role="radiogroup" aria-label="Background">
    {#each MONO_COLORS as c (c)}
      <button
        type="button"
        role="radio"
        aria-checked={current === c}
        aria-label={TINT_NAMES[c]}
        title={TINT_NAMES[c]}
        onclick={() => pick(c)}
      >
        <span class="avatar swatch" data-tint={c}></span>
      </button>
    {/each}
  </div>
{/snippet}

<dialog class="picker" bind:this={dialog} {onclose} aria-labelledby="picker-title">
  <header class="head">
    <h2 id="picker-title">Your picture</h2>
    <button type="button" class="x" aria-label="Close" onclick={() => dialog?.close()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
    </button>
  </header>
  <div class="tabs" role="tablist" aria-label="Kind of picture">
    {#each [['emoji', 'Emoji'], ['initials', 'Initials'], ['upload', 'Upload']] as [id, label] (id)}
      <button
        type="button"
        role="tab"
        aria-selected={tab === id}
        onclick={() => {
          tab = id as Tab;
          error = '';
        }}>{label}</button
      >
    {/each}
  </div>

  <div class="body">
    <div class="choices">
      {#if tab === 'emoji'}
        <div class="emojis" role="radiogroup" aria-label="Emoji">
          {#each AVATAR_EMOJIS as char, i (char)}
            <button
              type="button"
              role="radio"
              aria-checked={emoji === char}
              aria-label={EMOJI_NAMES[i]}
              title={EMOJI_NAMES[i]}
              onclick={() => (emoji = char)}
            >
              <span class="avatar" data-kind="emoji" data-tint={emojiTint}
                ><span class="avatar-glyph">{char}</span></span
              >
            </button>
          {/each}
        </div>
        <p class="label">Background</p>
        {@render tints(emojiTint, (c) => (emojiTint = c))}
      {:else if tab === 'initials'}
        <label class="label" for="picker-letters">Letters</label>
        <input
          id="picker-letters"
          class="letters"
          type="text"
          maxlength="3"
          autocomplete="off"
          spellcheck="false"
          bind:value={letters}
        />
        <p class="label">Background</p>
        {@render tints(lettersTint, (c) => (lettersTint = c))}
      {:else}
        <button
          type="button"
          class="drop"
          ondragover={(e) => e.preventDefault()}
          ondrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer?.files?.[0]);
          }}
          onclick={() => fileInput?.click()}
        >
          <span>Drop a photo here, or <u>choose a file</u></span>
          <small
            >JPEG, PNG or WebP. It is cut to a circle and shrunk to {SIZE} px, so it stays small in your
            save file.</small
          >
        </button>
        <input
          bind:this={fileInput}
          type="file"
          accept="image/*"
          hidden
          onchange={(e) => {
            onFile(e.currentTarget.files?.[0]);
            e.currentTarget.value = '';
          }}
        />
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>

    <div class="stage">
      {#if tab === 'upload' && src}
        <div
          class="crop"
          role="slider"
          tabindex="0"
          aria-label="Picture position: drag, or use the arrow keys; + and - zoom"
          aria-valuemin={1}
          aria-valuemax={MAX_ZOOM}
          aria-valuenow={Math.round(zoom * 100) / 100}
          onpointerdown={down}
          onpointermove={move}
          onpointerup={up}
          onpointercancel={up}
          onwheel={wheel}
          onkeydown={key}
        >
          {#key src}<img
              bind:this={img}
              {src}
              alt=""
              style:transform
              onload={onLoad}
              onerror={() =>
                (error = 'This browser cannot read that file. Try a JPEG, PNG or WebP.')}
              draggable="false"
            />{/key}
        </div>
        <label class="zoom"
          ><span aria-hidden="true">-</span>
          <input
            type="range"
            min="1"
            max={MAX_ZOOM}
            step="0.01"
            value={zoom}
            aria-label="Zoom"
            disabled={!natural}
            oninput={(e) => setZoom(Number(e.currentTarget.value))}
          /><span aria-hidden="true">+</span></label
        >
      {:else}
        <Avatar profile={preview} size={narrow.current ? 132 : CROP} />
      {/if}
      <div class="small-previews">
        <Avatar profile={preview} size={44} />
        <Avatar profile={preview} size={32} />
        <Avatar profile={preview} size={24} />
        {#if tab === 'upload' && photo}<small>{kb} KB</small>{/if}
      </div>
    </div>
  </div>

  <footer class="foot">
    {#if initial?.picture || initial?.emoji || initial?.mono}
      <button
        type="button"
        class="btn remove"
        disabled={saving}
        onclick={() => save({ picture: null, emoji: null, mono: null })}>Remove picture</button
      >
    {/if}
    <span class="grow"></span>
    <button type="button" class="btn" onclick={() => dialog?.close()}>Cancel</button>
    <button type="button" class="btn btn-primary" disabled={!preview || saving} onclick={use}
      >Use this picture</button
    >
  </footer>
</dialog>

<style>
  .picker {
    /* Tailwind's reset removes the browser's centering of modal dialogs. */
    margin: auto;
    width: min(640px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    padding: 0;
    overflow: auto;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--ink);
    box-shadow: 6px 6px 0 color-mix(in srgb, var(--ink) 14%, transparent);
  }

  .picker::backdrop {
    background: color-mix(in srgb, #000 45%, transparent);
  }

  .head {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
  }

  .head h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .x {
    margin-left: auto;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }

  .x svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }

  .tabs {
    display: flex;
    gap: 4px;
    padding: 0 16px;
    border-bottom: 1px solid var(--line);
  }

  .tabs button {
    padding: 10px 12px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .tabs button[aria-selected='true'] {
    color: var(--ink);
    font-weight: 600;
    border-bottom-color: var(--accent);
  }

  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
  }

  .choices {
    container-type: inline-size;
    padding: 16px;
    border-right: 1px solid var(--line);
    min-height: 300px;
  }

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 18px 16px;
    background: var(--bg);
  }

  /* Twelve emoji: 6, 4 or 3 to a row, so every row is full at any width. */
  .emojis {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 10px;
  }

  @container (max-width: 330px) {
    .emojis {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  @container (max-width: 220px) {
    .emojis {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .emojis button {
    display: grid;
    place-items: center;
    padding: 4px 0;
    border: 0;
    background: none;
    cursor: pointer;
  }

  .emojis .avatar {
    --av: 52px;
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    max-width: 52px;
  }

  .emojis .avatar-glyph {
    font-size: 26px;
  }

  /* The ring sits on the circle itself, so it stays round whatever the button's shape. */
  .emojis button:hover .avatar,
  .tints button:hover .avatar {
    box-shadow: 0 0 0 1px var(--ink);
  }

  .emojis button[aria-checked='true'] .avatar,
  .tints button[aria-checked='true'] .avatar {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--accent);
  }

  .emojis button:focus-visible,
  .tints button:focus-visible {
    outline: none;
  }

  .emojis button:focus-visible .avatar,
  .tints button:focus-visible .avatar {
    outline: 2px solid var(--accent);
    outline-offset: 5px;
  }

  .label {
    display: block;
    margin: 18px 0 8px;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  label.label {
    margin-top: 0;
  }

  /* Eight tints: 8, or 4 to a row on narrow screens. */
  .tints {
    display: grid;
    grid-template-columns: repeat(8, max-content);
    gap: 8px;
  }

  @container (max-width: 330px) {
    .tints {
      grid-template-columns: repeat(4, max-content);
    }
  }

  .tints button {
    display: grid;
    padding: 4px;
    border: 0;
    background: none;
    cursor: pointer;
  }

  .swatch {
    --av: 28px;
  }

  .letters {
    width: 6em;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 2px;
    background: var(--surface);
    color: var(--ink);
    font:
      600 1.4rem 'EB Garamond',
      Georgia,
      serif;
    text-transform: uppercase;
  }

  .drop {
    display: grid;
    gap: 8px;
    width: 100%;
    padding: 36px 14px;
    border: 1.5px dashed var(--line);
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: center;
    cursor: pointer;
  }

  .drop:hover,
  .drop:focus-visible {
    border-color: var(--accent);
  }

  .drop small {
    color: var(--muted);
  }

  .crop {
    position: relative;
    width: 200px;
    height: 200px;
    flex: none;
    overflow: hidden;
    border-radius: 50%;
    background: #111;
    cursor: grab;
    touch-action: none;
    box-shadow:
      0 0 0 3px var(--bg),
      0 0 0 4px var(--accent);
  }

  .crop:active {
    cursor: grabbing;
  }

  .crop img {
    position: absolute;
    left: 50%;
    top: 50%;
    max-width: none;
    transform-origin: 0 0;
    user-select: none;
    pointer-events: none;
  }

  .zoom {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    color: var(--muted);
  }

  .zoom input {
    flex: 1;
    accent-color: var(--accent);
  }

  .small-previews {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    min-height: 44px;
  }

  .small-previews small {
    color: var(--muted);
  }

  .error {
    margin: 14px 0 0;
    color: var(--danger);
    font-size: 0.9rem;
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--line);
  }

  .grow {
    flex: 1;
  }

  .btn {
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .remove {
    border-color: transparent;
    background: none;
    color: var(--muted);
  }

  @media (max-width: 600px) {
    .body {
      grid-template-columns: 1fr;
    }

    .stage {
      order: -1;
    }

    .choices {
      min-height: 0;
      border-right: 0;
      border-top: 1px solid var(--line);
    }

    .foot .grow {
      display: none;
    }

    .foot .remove {
      flex-basis: 100%;
      justify-content: center;
    }

    .foot .btn:not(.remove) {
      flex: 1;
      justify-content: center;
    }
  }
</style>

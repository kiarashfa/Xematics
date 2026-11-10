<script lang="ts">
  import {
    patchAnimation,
    patchRole,
    PRESET_NAMES,
    PRESETS,
    type DashStyle,
    type Model,
  } from '@xematics/core';
  import { targetTitle, type ColorTarget } from '../color-target.ts';
  import { tool } from '../state.svelte.ts';
  import Icon from './Icon.svelte';

  // Swatches, recent colors and a full picker (HEX, RGB, HSL, eyedropper) for one color, plus
  // weight and dashes for outlines. Loaded on first use. The preview shows a hovered swatch or
  // the picker's color without touching the source; choosing a color is one edit (one undo step).
  let {
    target,
    touch = false,
    onClose,
  }: { target: ColorTarget; touch?: boolean; onClose: () => void } = $props();

  const STANDARD = [
    '#1f2937',
    '#0072b2',
    '#56b4e9',
    '#009e73',
    '#f0e442',
    '#e69f00',
    '#d55e00',
    '#cc79a7',
    '#7a5195',
    '#ffffff',
  ];
  const WEIGHTS = [0, 0.5, 1, 1.5, 2, 3, 4, 6];
  const MODES = ['HEX', 'RGB', 'HSL'] as const;
  const RGB_KEYS = ['r', 'g', 'b'] as const;
  const HSL_KEYS = ['h', 's', 'l'] as const;
  const DASHES: [DashStyle, string, string][] = [
    ['solid', 'Solid', ''],
    ['dashed', 'Dashed', '6 4'],
    ['dotted', 'Dotted', '2 3'],
    ['dash-dot', 'Dash dot', '6 3 2 3'],
  ];

  const hex2rgb = (h: string): [number, number, number] => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const rgb2hex = (r: number, g: number, b: number) =>
    '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const mix = (a: string, b: string, t: number) => {
    const x = hex2rgb(a);
    const y = hex2rgb(b);
    return rgb2hex(...(x.map((v, i) => v + (y[i]! - v) * t) as [number, number, number]));
  };
  const expand = (h: string) =>
    h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`.toLowerCase() : h.toLowerCase();

  function hsv(r: number, g: number, b: number): [number, number, number] {
    [r, g, b] = [r / 255, g / 255, b / 255];
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    let h = 0;
    if (d) h = 60 * (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
    return [h < 0 ? h + 360 : h, max ? d / max : 0, max];
  }
  function fromHue(h: number, c: number, x: number): [number, number, number] {
    return h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  }
  function fromHsv(h: number, s: number, v: number): string {
    const c = v * s;
    const m = v - c;
    const [r, g, b] = fromHue(h % 360, c, c * (1 - Math.abs(((h / 60) % 2) - 1)));
    return rgb2hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }
  function hsl(hex: string): [number, number, number] {
    const [r, g, b] = hex2rgb(hex).map((v) => v / 255) as [number, number, number];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    return [hsv(r * 255, g * 255, b * 255)[0], s * 100, l * 100];
  }
  function fromHsl(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const m = l - c / 2;
    const [r, g, b] = fromHue(h % 360, c, c * (1 - Math.abs(((h / 60) % 2) - 1)));
    return rgb2hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }

  // What the source says now, and the color as drawn.
  const own = $derived.by(() => {
    if (target.kind === 'motion') return tool.model?.animation?.[target.key];
    return tool.model?.style?.[target.role]?.[target.part];
  });
  const current = $derived.by(() => {
    if (target.kind === 'motion') return tool.motionColors[target.key];
    const paint = tool.theme.roles[target.role];
    return target.part === 'fill' ? paint.fill : paint.stroke;
  });
  const roleStyle = $derived(target.kind === 'role' ? tool.model?.style?.[target.role] : undefined);
  const weight = $derived(roleStyle?.weight ?? 1.5);
  const dashes = $derived(roleStyle?.dashes ?? 'solid');

  const presetRow = $derived.by(() => {
    const p = PRESETS[tool.preset];
    const colors = [
      p.roles.input.fill,
      p.roles.input.stroke,
      p.roles.hidden.fill,
      p.roles.hidden.stroke,
      p.roles.output.fill,
      p.roles.output.stroke,
      p.motion.forward,
      p.motion.backward,
    ];
    return [...new Set(colors)];
  });
  const grid = [
    STANDARD,
    ...[0.8, 0.6, 0.4].map((t) =>
      STANDARD.map((c, i) => (i === 9 ? mix('#ffffff', '#000000', 1 - t) : mix(c, '#ffffff', t))),
    ),
    STANDARD.map((c, i) => (i === 9 ? '#7f7f7f' : mix(c, '#000000', 0.35))),
  ].flat();

  function apply(model: Model, color: string | undefined): Model {
    if (target.kind === 'motion') return patchAnimation(model, { [target.key]: color });
    return patchRole(model, target.role, { [target.part]: color });
  }

  function preview(color: string | undefined) {
    tool.stylePreview = color === undefined ? undefined : (model) => apply(model, color);
  }

  function choose(color: string) {
    tool.stylePreview = undefined;
    tool.edit((model) => apply(model, color));
    tool.rememberColor(color);
    onClose();
  }

  function usePreset() {
    tool.stylePreview = undefined;
    tool.edit((model) => apply(model, undefined));
    onClose();
  }

  function setWeight(value: number) {
    if (target.kind !== 'role') return;
    tool.setRole(target.role, { weight: value === 1.5 ? undefined : value });
  }

  function setDashes(value: DashStyle) {
    if (target.kind !== 'role') return;
    tool.setRole(target.role, { dashes: value });
  }

  // The picker.
  let view = $state<'swatches' | 'picker'>('swatches');
  let mode = $state<'HEX' | 'RGB' | 'HSL'>('HEX');
  let h = $state(0);
  let s = $state(0);
  let v = $state(0);
  let bad = $state('');
  const picked = $derived(fromHsv(h, s, v));
  const rgb = $derived(hex2rgb(picked));
  const hslValue = $derived(hsl(picked));
  let square: HTMLDivElement | undefined = $state();

  function openPicker() {
    [h, s, v] = hsv(...hex2rgb(current));
    view = 'picker';
  }

  function setFrom(hex: string) {
    [h, s, v] = hsv(...hex2rgb(hex));
    preview(fromHsv(h, s, v));
  }

  function drag(event: PointerEvent) {
    if (!square) return;
    const r = square.getBoundingClientRect();
    s = clamp((event.clientX - r.left) / r.width, 0, 1);
    v = 1 - clamp((event.clientY - r.top) / r.height, 0, 1);
    preview(picked);
  }

  function squareDown(event: PointerEvent) {
    square?.setPointerCapture(event.pointerId);
    drag(event);
  }

  function squareKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    s = clamp(s + move[0], 0, 1);
    v = clamp(v + move[1], 0, 1);
    preview(picked);
  }

  function hexInput(event: Event) {
    const raw = (event.currentTarget as HTMLInputElement).value.trim().replace(/^#?/, '#');
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
      bad = '';
      setFrom(expand(raw));
    } else bad = 'hex';
  }

  function numberInput(key: string, max: number, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const n = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(n)) {
      bad = key;
      return;
    }
    bad = '';
    const value = clamp(n, 0, max);
    if (mode === 'RGB') {
      const next = [...rgb] as [number, number, number];
      next['rgb'.indexOf(key)] = value;
      setFrom(rgb2hex(...next));
    } else {
      const next = [...hslValue] as [number, number, number];
      next['hsl'.indexOf(key)] = value;
      setFrom(fromHsl(...next));
    }
  }

  async function eyedropper() {
    const Dropper = (window as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } })
      .EyeDropper;
    if (!Dropper) return;
    try {
      const result = await new Dropper().open();
      setFrom(expand(result.sRGBHex));
    } catch {
      // Cancelled.
    }
  }

  function cancelPicker() {
    tool.stylePreview = undefined;
    view = 'swatches';
  }

  const canDrop = typeof window !== 'undefined' && 'EyeDropper' in window;
  const ink = (c: string) => {
    const [r, g, b] = hex2rgb(c);
    return 0.2126 * r * r + 0.7152 * g * g + 0.0722 * b * b > 0.18 * 65025 ? '#1f2937' : '#ffffff';
  };
</script>

{#snippet swatches(colors: readonly string[], label: string)}
  <div class="grid" role="group" aria-label={label}>
    {#each colors as color, i (`${color}-${i}`)}
      <button
        type="button"
        class="swatch"
        class:current={color === current}
        style:background={color}
        title={color}
        aria-label={color}
        onpointerenter={() => preview(color)}
        onpointerleave={() => preview(undefined)}
        onfocus={() => preview(color)}
        onblur={() => preview(undefined)}
        onclick={() => choose(color)}
      ></button>
    {/each}
  </div>
{/snippet}

<div class="panel" class:touch role="dialog" aria-label={targetTitle(target)}>
  {#if view === 'swatches'}
    {#if !touch}<p class="head">{targetTitle(target)}</p>{/if}
    <p class="sub">
      {target.kind === 'motion'
        ? 'Used by every animation look, GIF and video.'
        : target.role === 'hidden'
          ? 'Applies to every hidden layer.'
          : `Applies to the ${target.role} layer.`}
    </p>
    <h3>{PRESET_NAMES[tool.preset]} preset</h3>
    {@render swatches(presetRow, 'Preset colors')}
    <h3>Standard</h3>
    {@render swatches(grid, 'Standard colors')}
    {#if tool.recentColors.length > 0}
      <h3>Recent</h3>
      {@render swatches(tool.recentColors, 'Recent colors')}
    {/if}
    {#if target.kind === 'role' && target.part === 'outline'}
      <h3>Weight</h3>
      <div class="lines" role="group" aria-label="Outline weight">
        {#each WEIGHTS as w (w)}
          <button
            type="button"
            class="line"
            aria-pressed={weight === w}
            aria-label={w === 0 ? 'No outline' : `${w} px`}
            title={w === 0 ? 'No outline' : `${w} px`}
            onclick={() => setWeight(w)}
          >
            {#if w === 0}<span class="none">None</span>{:else}<svg
                width="24"
                height="12"
                aria-hidden="true"
                ><line x1="2" y1="6" x2="22" y2="6" stroke="currentColor" stroke-width={w} /></svg
              >{/if}
          </button>
        {/each}
      </div>
      <h3>Dashes</h3>
      <div class="lines" role="group" aria-label="Outline dashes">
        {#each DASHES as [value, label, pattern] (value)}
          <button
            type="button"
            class="line wide"
            aria-pressed={dashes === value}
            aria-label={label}
            title={label}
            onclick={() => setDashes(value)}
            ><svg width="44" height="12" aria-hidden="true"
              ><line
                x1="2"
                y1="6"
                x2="42"
                y2="6"
                stroke="currentColor"
                stroke-width="2"
                stroke-dasharray={pattern || undefined}
              /></svg
            ></button
          >
        {/each}
      </div>
    {/if}
    <button type="button" class="item rule" onclick={openPicker}
      ><Icon name="palette" size={16} />{touch ? 'Custom color' : 'More colors…'}</button
    >
    <button type="button" class="item" disabled={own === undefined} onclick={usePreset}
      ><Icon name="undo" size={16} />Use the preset color</button
    >
  {:else}
    {#if !touch}<p class="head">{targetTitle(target)}</p>{/if}
    <div
      class="square"
      bind:this={square}
      role="slider"
      tabindex="0"
      aria-label="Saturation and brightness"
      aria-valuetext={picked}
      aria-valuenow={Math.round(s * 100)}
      style:background-color={`hsl(${h} 100% 50%)`}
      onpointerdown={squareDown}
      onpointermove={(e) => e.buttons && drag(e)}
      onkeydown={squareKey}
    >
      <span class="thumb" style:left={`${s * 100}%`} style:top={`${(1 - v) * 100}%`}></span>
    </div>
    <input
      class="hue"
      type="range"
      min="0"
      max="359"
      value={Math.round(h)}
      aria-label="Hue"
      oninput={(e) => {
        h = Number(e.currentTarget.value);
        preview(picked);
      }}
    />
    <div class="modes" role="group" aria-label="Color format">
      {#each MODES as m (m)}
        <button type="button" aria-pressed={mode === m} onclick={() => ((mode = m), (bad = ''))}
          >{m}</button
        >
      {/each}
    </div>
    <div class="fields">
      {#if mode === 'HEX'}
        <label
          >Hex<input
            class:bad={bad === 'hex'}
            value={picked}
            spellcheck="false"
            oninput={hexInput}
          /></label
        >
      {:else}
        {#each mode === 'RGB' ? RGB_KEYS : HSL_KEYS as key, i (key)}
          {@const max = mode === 'RGB' ? 255 : key === 'h' ? 360 : 100}
          <label
            >{key.toUpperCase()}{mode === 'HSL' && key !== 'h' ? ' %' : ''}<input
              class:bad={bad === key}
              inputmode="numeric"
              value={Math.round(mode === 'RGB' ? rgb[i]! : hslValue[i]!)}
              onchange={(e) => numberInput(key, max, e)}
            /></label
          >
        {/each}
      {/if}
    </div>
    <div class="compare">
      <span class="both">
        <span style:background={picked} style:color={ink(picked)}>New</span>
        <span style:background={current} style:color={ink(current)}>Current</span>
      </span>
      {#if canDrop}
        <button type="button" class="drop" title="Pick a color from the screen" onclick={eyedropper}
          ><Icon name="eyedropper" size={16} /></button
        >
      {/if}
    </div>
    <div class="actions">
      <button type="button" onclick={cancelPicker}>Cancel</button>
      <button type="button" class="ok" onclick={() => choose(picked)}>OK</button>
    </div>
  {/if}
</div>

<style>
  .panel {
    width: 262px;
    font-size: 0.8rem;
    color: var(--ink);
  }

  .head {
    margin: 0;
    font-weight: 600;
  }

  .sub {
    margin: 0 0 4px;
    color: var(--muted);
    font-size: 0.72rem;
  }

  h3 {
    margin: 8px 0 3px;
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* 22 px swatches 24 px apart: the smallest targets WCAG 2.2 allows. */
  .grid {
    display: grid;
    grid-template-columns: repeat(10, 22px);
    gap: 2px;
  }

  .swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid rgb(0 0 0 / 0.2);
    border-radius: 2px;
    cursor: pointer;
  }

  .swatch:hover,
  .swatch:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .swatch.current {
    outline: 2px solid var(--ink);
    outline-offset: 1px;
  }

  .lines {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .line {
    display: grid;
    place-items: center;
    min-width: 29px;
    height: 24px;
    padding: 0 2px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    cursor: pointer;
  }

  .line.wide {
    min-width: 54px;
  }

  .line[aria-pressed='true'] {
    border-color: var(--accent);
    outline: 1px solid var(--accent);
  }

  .none {
    font-size: 0.68rem;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin-top: 4px;
    padding: 5px 4px;
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--ink);
    font: 0.8rem var(--font-sans);
    text-align: left;
    cursor: pointer;
  }

  .item:hover:not(:disabled) {
    background: var(--surface-2);
  }

  .item:disabled {
    color: var(--muted);
    opacity: 0.55;
    cursor: default;
  }

  .item.rule {
    margin-top: 8px;
    padding-top: 7px;
    border-top: 1px solid var(--line);
    border-radius: 0;
  }

  .square {
    position: relative;
    height: 150px;
    margin-top: 8px;
    border-radius: 4px;
    background-image:
      linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent);
    cursor: crosshair;
    touch-action: none;
  }

  .square:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .thumb {
    position: absolute;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.5);
    pointer-events: none;
  }

  .hue {
    width: 100%;
    height: 12px;
    margin: 10px 0 8px;
    border-radius: 6px;
    background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
    appearance: none;
  }

  .hue::-webkit-slider-thumb {
    width: 16px;
    height: 16px;
    border: 1px solid rgb(0 0 0 / 0.5);
    border-radius: 50%;
    background: #fff;
    appearance: none;
  }

  .hue::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border: 1px solid rgb(0 0 0 / 0.5);
    border-radius: 50%;
    background: #fff;
  }

  .modes {
    display: flex;
    margin-bottom: 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
  }

  .modes button {
    flex: 1;
    padding: 4px 0;
    border: 0;
    background: var(--bg);
    color: var(--ink);
    font: 500 0.78rem var(--font-sans);
    cursor: pointer;
  }

  .modes button + button {
    border-left: 1px solid var(--line);
  }

  .modes button[aria-pressed='true'] {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .fields {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .fields label {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    color: var(--muted);
    font-size: 0.68rem;
  }

  .fields input {
    width: 100%;
    min-height: 26px;
    padding: 2px 6px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 0.8rem var(--font-mono);
  }

  .fields input.bad {
    border-color: #d55e00;
    outline: 1px solid #d55e00;
  }

  .compare {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }

  .both {
    display: flex;
    flex: 1;
    height: 30px;
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
  }

  .both span {
    display: grid;
    flex: 1;
    place-items: center;
    font-size: 0.65rem;
  }

  .drop {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--bg);
    color: var(--ink);
    cursor: pointer;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .actions button {
    min-height: 28px;
    padding: 3px 14px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 500 0.8rem var(--font-sans);
    cursor: pointer;
  }

  .actions button.ok {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }

  /* Phone: full width, larger targets. */
  .touch {
    width: 100%;
    font-size: 0.95rem;
  }

  .touch .grid {
    grid-template-columns: repeat(10, 1fr);
    gap: 6px;
  }

  .touch .swatch {
    width: auto;
    height: auto;
    aspect-ratio: 1;
    border-radius: 8px;
  }

  .touch .line {
    min-width: 44px;
    height: 44px;
  }

  .touch .line.wide {
    min-width: 68px;
  }

  .touch .item,
  .touch .actions button,
  .touch .modes button,
  .touch .fields input {
    min-height: 44px;
  }

  .touch .square {
    height: 220px;
  }
</style>

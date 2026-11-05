<script lang="ts">
  import { SITE } from '../../site.config.ts';
  import {
    copyShareLink,
    copySvg,
    copyTikz,
    exportAnimation,
    exportAs,
    deleteDocument,
    downloadSource,
    openSourceFile,
    openWorkspaceFile,
    saveWorkspace,
  } from '../actions.ts';
  import { tick, untrack, type Snippet } from 'svelte';
  import { currentTheme, setTheme } from '../browser.ts';
  import { player, prefersReducedMotion } from '../player.ts';
  import { PNG_SIZES } from '../formats.ts';
  import { EXAMPLES, tool } from '../state.svelte.ts';
  import {
    PRESET_IDS,
    PRESET_NAMES,
    type AnimationLook,
    type AnimationScene,
  } from '@xematics/core';
  import Icon, { type IconName } from './Icon.svelte';
  import PresetThumb from './PresetThumb.svelte';

  const TABS = ['File', 'Home', 'View', 'Animate', 'Export', 'Help'] as const;
  type Tab = (typeof TABS)[number];
  let active = $state<Tab>('Home');
  let theme = $state(currentTheme());
  let sourceInput: HTMLInputElement | undefined = $state();
  let workspaceInput: HTMLInputElement | undefined = $state();

  // Collapsed: only the tabs show. Clicking a tab then opens its commands as a temporary layer
  // that closes after a command, on Escape, or on a click elsewhere. The pin button restores it.
  const COLLAPSE_KEY = 'xm-ribbon-collapsed';
  let collapsed = $state(readCollapsed());
  let peek = $state(false);
  const showPanel = $derived(!collapsed || peek);
  let root: HTMLDivElement | undefined = $state();

  function readCollapsed(): boolean {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function setCollapsed(value: boolean) {
    collapsed = value;
    peek = false;
    try {
      localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
    } catch {
      // Private mode: the choice just lasts for this visit.
    }
  }

  function pickTab(tab: Tab) {
    // Clicking the open tab again closes the temporary layer.
    peek = collapsed && (tab !== active || !peek);
    active = tab;
  }

  // A command in the temporary layer closes it.
  function onWindowClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('.popup') && target.closest('button, a')) openGroup = '';
    if (peek && target.closest('#ribbon-panel') && target.closest('button, a')) peek = false;
  }

  function onWindowPointer(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (openGroup && !target.closest('.popup, .foldbtn')) openGroup = '';
    if (peek && root && !root.contains(target)) peek = false;
  }

  function onWindowKey(event: KeyboardEvent) {
    if (openGroup && event.key === 'Escape') openGroup = '';
    if (peek && event.key === 'Escape') {
      peek = false;
      document.getElementById(`ribbon-tab-${active}`)?.focus();
    }
  }

  // The manual belongs to the Help tab: leaving it brings the format pane back.
  $effect(() => {
    if (active !== 'Help') untrack(() => (tool.manual = undefined));
  });

  function openManual(topic: NonNullable<typeof tool.manual>) {
    tool.manual = tool.manual === topic ? undefined : topic;
    if (tool.manual) tool.showFormat = true;
  }

  // Responsive layout, like Office: as the window narrows, small buttons lose their labels
  // (stage 1), big buttons become icons (stage 2), then groups fold into drawers from the right.
  let stage = $state(0);
  let fold = $state(0);
  let count = $state(0);
  let openGroup = $state('');
  let popupX = $state(0);
  let popupY = $state(0);
  let fitting = false;
  let again = false;

  async function fit() {
    if (fitting) {
      again = true;
      return;
    }
    fitting = true;
    try {
      do {
        again = false;
        const panel = document.getElementById('ribbon-panel');
        if (!panel || panel.hidden) break;
        openGroup = '';
        stage = 0;
        fold = 0;
        await tick();
        count = panel.querySelectorAll(':scope > .group').length;
        const over = () => panel.scrollWidth > panel.clientWidth + 1;
        const steps: [number, number][] = [
          [1, 0],
          [2, 0],
        ];
        for (let k = 1; k <= count; k++) steps.push([2, k]);
        for (const [s, f] of steps) {
          if (!over()) break;
          stage = s;
          fold = f;
          await tick();
        }
      } while (again);
    } finally {
      fitting = false;
    }
  }

  function toggleGroup(name: string, button: HTMLElement) {
    if (openGroup === name) {
      openGroup = '';
      return;
    }
    const r = button.getBoundingClientRect();
    popupX = Math.max(4, Math.min(r.left, innerWidth - 420));
    popupY = r.bottom + 4;
    openGroup = name;
  }

  $effect(() => {
    if (!root) return;
    let width = root.clientWidth;
    const watcher = new ResizeObserver(() => {
      if (root && root.clientWidth !== width) {
        width = root.clientWidth;
        void fit();
      }
    });
    watcher.observe(root);
    return () => watcher.disconnect();
  });

  $effect(() => {
    void active;
    void showPanel;
    void tick().then(fit);
  });

  const layerSelected = $derived(tool.selection.kind === 'layer');
  const layerCount = $derived(tool.model?.layers.length ?? 0);
  const index = $derived(tool.selection.kind === 'layer' ? tool.selection.index : -1);

  const LOOKS: [AnimationLook, string][] = [
    ['pulse', 'Pulse'],
    ['flow', 'Flow'],
    ['dots', 'Dots'],
    ['learning', 'Learning'],
    ['training', 'Training'],
  ];
  const SCENES: [AnimationScene, string][] = [
    ['forward', 'Forward pass'],
    ['backward', 'Backpropagation'],
    ['both', 'Both, in turn'],
  ];
  const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];
  const signalLook = $derived(['pulse', 'flow', 'dots'].includes(tool.animation.look));

  // The Animate tab shows the animation in the preview; it starts playing unless the system
  // asks for reduced motion.
  $effect(() => {
    const open = active === 'Animate';
    if (open === untrack(() => tool.playerOpen)) return;
    tool.playerOpen = open;
    tool.playing = open && !prefersReducedMotion();
  });

  function step(direction: 1 | -1) {
    const duration = tool.timeline?.duration ?? 0;
    if (!duration) return;
    tool.playing = false;
    const next = (tool.time + direction * (duration / 20) + duration) % duration;
    tool.time = next;
    player.seek(next);
  }

  function onTabKey(event: KeyboardEvent) {
    const i = TABS.indexOf(active);
    const next = event.key === 'ArrowRight' ? i + 1 : event.key === 'ArrowLeft' ? i - 1 : -2;
    if (next === -2) return;
    event.preventDefault();
    active = TABS[(next + TABS.length) % TABS.length]!;
    document.getElementById(`ribbon-tab-${active}`)?.focus();
  }

  async function onFile(event: Event, open: (file: File) => Promise<void>) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await open(file);
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(theme);
  }

  function setNumber(key: 'above' | 'first' | 'last', event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const value = Number(input.value);
    const [min, max] = key === 'above' ? [1, 1_000_000] : [0, 100];
    if (Number.isInteger(value) && value >= min && value <= max) tool.setCollapse(key, value);
    else input.value = String(tool.collapse[key]);
  }
</script>

{#snippet big(icon: IconName, label: string, action: () => void, disabled = false, primary = false)}
  <button type="button" class="big" class:primary onclick={action} {disabled}>
    <Icon name={icon} size={26} /><span>{label}</span>
  </button>
{/snippet}

{#snippet group(
  i: number,
  name: string,
  icon: IconName,
  label: string,
  caption: string,
  cls: string,
  body: Snippet,
)}
  {#if fold > 0 && i >= count - fold}
    <div class="group" role="group" aria-label={name}>
      <button
        type="button"
        class="big foldbtn"
        aria-expanded={openGroup === name}
        onclick={(e) => toggleGroup(name, e.currentTarget)}
      >
        <Icon name={icon} size={26} /><span>{label}</span><Icon name="chevron" size={12} />
      </button>
      {#if openGroup === name}
        <div
          class="popup"
          role="group"
          aria-label={name}
          style:left="{popupX}px"
          style:top="{popupY}px"
        >
          <div class="body {cls}">{@render body()}</div>
          <div class="caption">{caption}</div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="group s{stage}" role="group" aria-label={name}>
      <div class="body {cls}">{@render body()}</div>
      <div class="caption">{caption}</div>
    </div>
  {/if}
{/snippet}

{#snippet manualButton(topic: NonNullable<typeof tool.manual>, icon: IconName, label: string)}
  <button
    type="button"
    class="big"
    class:primary={tool.manual === topic}
    aria-pressed={tool.manual === topic}
    onclick={() => openManual(topic)}
  >
    <Icon name={icon} size={26} /><span>{label}</span>
  </button>
{/snippet}

{#snippet small(icon: IconName, label: string, action: () => void, disabled = false)}
  <button type="button" class="small ic" title={label} onclick={action} {disabled}
    ><Icon name={icon} size={15} /><span class="t">{label}</span></button
  >
{/snippet}

{#snippet toggle(label: string, checked: boolean, change: (on: boolean) => void)}
  <label class="switch">
    <input
      type="checkbox"
      role="switch"
      {checked}
      onchange={(e) => change(e.currentTarget.checked)}
    />
    <span aria-hidden="true"></span>{label}
  </label>
{/snippet}

<svelte:window onpointerdown={onWindowPointer} onclick={onWindowClick} onkeydown={onWindowKey} />

<div class="ribbon" class:collapsed bind:this={root}>
  <div class="tabs">
    <div class="list" role="tablist" aria-label="Ribbon">
      {#each TABS as tab (tab)}
        <button
          type="button"
          role="tab"
          id={`ribbon-tab-${tab}`}
          class:file={tab === 'File'}
          aria-selected={active === tab && showPanel}
          aria-controls="ribbon-panel"
          tabindex={active === tab ? 0 : -1}
          onclick={() => pickTab(tab)}
          onkeydown={onTabKey}>{tab}</button
        >
      {/each}
    </div>
    <button
      type="button"
      class="fold"
      aria-label={collapsed ? 'Pin the ribbon' : 'Collapse the ribbon'}
      title={collapsed ? 'Pin the ribbon' : 'Collapse the ribbon'}
      aria-expanded={!collapsed}
      onclick={() => setCollapsed(!collapsed)}
      ><Icon name={collapsed ? 'pin' : 'chevronUp'} size={18} /></button
    >
  </div>

  <div
    class="panel"
    class:float={collapsed}
    hidden={!showPanel}
    id="ribbon-panel"
    role="tabpanel"
    aria-labelledby={`ribbon-tab-${active}`}
  >
    {#if active === 'File'}
      {#snippet gFile0()}
        {@render big('file', 'New', () => tool.newDocument())}
        {@render big('open', 'Open file', () => sourceInput?.click())}
        <div class="stack">
          {@render small('download', 'Save source', downloadSource)}
          {@render small('trash', 'Delete', deleteDocument)}
        </div>
      {/snippet}
      {@render group(0, 'Document', 'file', 'Document', 'Document', '', gFile0)}
      {#snippet gFile1()}
        <select
          class="documents"
          aria-label="Open document"
          value={tool.currentId}
          onchange={(e) => tool.switchTo(e.currentTarget.value)}
        >
          {#each tool.documents as document (document.id)}
            <option value={document.id}>{tool.documentName(document)}</option>
          {/each}
        </select>
        <span class="meta"
          >{tool.documents.length === 1 ? '1 document' : `${tool.documents.length} documents`} in this
          workspace</span
        >
      {/snippet}
      {@render group(1, 'Documents', 'layers', 'Documents', 'Documents', 'stack', gFile1)}
      {#snippet gFile2()}
        {#each EXAMPLES as example (example.name)}
          <button type="button" class="small" onclick={() => tool.newDocument(example.text)}
            >{example.name}</button
          >
        {/each}
      {/snippet}
      {@render group(
        2,
        'Examples',
        'cards',
        'Examples',
        'Examples (open as new)',
        'examples',
        gFile2,
      )}
      {#snippet gFile3()}
        {@render big('open', 'Open save file', () => workspaceInput?.click())}
        {@render big('download', 'Download save file', saveWorkspace)}
      {/snippet}
      {@render group(
        3,
        'Workspace',
        'open',
        'Workspace',
        'Workspace, autosaved in this browser',
        '',
        gFile3,
      )}
      {#snippet gFile4()}
        {@render big('link', 'Copy link', copyShareLink, !tool.ready)}
      {/snippet}
      {@render group(4, 'Share', 'link', 'Share', 'Share', '', gFile4)}
      {#snippet gFile5()}
        <a class="big" href={import.meta.env.BASE_URL}
          ><Icon name="close" size={26} /><span>Close editor</span></a
        >
      {/snippet}
      {@render group(5, 'Close', 'close', 'Close', 'Back to the site', '', gFile5)}
      <input
        bind:this={sourceInput}
        type="file"
        accept=".yaml,.yml,.json,.txt"
        hidden
        onchange={(e) => onFile(e, openSourceFile)}
      />
      <input
        bind:this={workspaceInput}
        type="file"
        accept=".json"
        hidden
        onchange={(e) => onFile(e, openWorkspaceFile)}
      />
    {:else if active === 'Home'}
      {#snippet gHome0()}
        {@render big('undo', 'Undo', () => tool.undo(), !tool.canUndo)}
        <div class="stack">
          {@render small('redo', 'Redo', () => tool.redo(), !tool.canRedo)}
          {@render small('link', 'Copy link', copyShareLink, !tool.ready)}
        </div>
      {/snippet}
      {@render group(0, 'History', 'undo', 'History', 'History', '', gHome0)}
      {#snippet gHome1()}
        {@render big('plus', 'Add layer', () => tool.addLayer(), !tool.valid)}
        <div class="stack">
          {@render small(
            'trash',
            'Remove',
            () => tool.removeSelectedLayer(),
            !layerSelected || layerCount <= 1,
          )}
          {@render small(
            'left',
            'Move left',
            () => tool.moveSelectedLayer(-1),
            !layerSelected || index <= 0,
          )}
          {@render small(
            'right',
            'Move right',
            () => tool.moveSelectedLayer(1),
            !layerSelected || index >= layerCount - 1,
          )}
        </div>
      {/snippet}
      {@render group(1, 'Layers', 'plus', 'Layers', 'Layers', '', gHome1)}
      {#snippet gHome2()}
        <div class="gallery" role="group" aria-label="Preset">
          {#each PRESET_IDS as id (id)}
            <button
              type="button"
              class="thumb"
              aria-pressed={tool.preset === id}
              title={PRESET_NAMES[id]}
              onclick={() => tool.setPreset(id)}
            >
              <PresetThumb {id} />
              <span>{PRESET_NAMES[id]}</span>
            </button>
          {/each}
        </div>
        <div class="stack">
          {@render toggle('Transparent background', tool.transparent, (on) =>
            tool.setTransparent(on),
          )}
          {@render toggle('Right to left', tool.rightToLeft, (on) => tool.setRightToLeft(on))}
        </div>
      {/snippet}
      {@render group(2, 'Style', 'canvas', 'Style', 'Style', '', gHome2)}
      {#snippet gHome3()}
        {@render toggle('Layer names', tool.labels.names, (on) => tool.setLabel('names', on))}
        {@render toggle('Neuron counts', tool.labels.sizes, (on) => tool.setLabel('sizes', on))}
        {@render toggle('Operations', tool.labels.ops, (on) => tool.setLabel('ops', on))}
      {/snippet}
      {@render group(3, 'Labels', 'tag', 'Labels', 'Labels', 'stack three', gHome3)}
      {#snippet gHome4()}
        <label
          >Collapse above <input
            type="number"
            min="1"
            value={tool.collapse.above}
            disabled={tool.preset === 'boxes'}
            onchange={(e) => setNumber('above', e)}
          /></label
        >
        <label
          >Show first <input
            type="number"
            min="0"
            max="100"
            value={tool.collapse.first}
            disabled={tool.preset === 'boxes'}
            onchange={(e) => setNumber('first', e)}
          /></label
        >
        <label
          >Show last <input
            type="number"
            min="0"
            max="100"
            value={tool.collapse.last}
            disabled={tool.preset === 'boxes'}
            onchange={(e) => setNumber('last', e)}
          /></label
        >
      {/snippet}
      {@render group(
        4,
        'Large layers',
        'fit',
        'Large layers',
        'Large layers',
        'stack numbers',
        gHome4,
      )}
    {:else if active === 'View'}
      {#snippet gView0()}
        {@render big('fit', 'Fit', () => (tool.zoom = 'fit'))}
        <div class="stack">
          {@render small('plus', 'Zoom in', () => tool.zoomBy(1.25))}
          {@render small('minus', 'Zoom out', () => tool.zoomBy(0.8))}
          <button type="button" class="small" onclick={() => (tool.zoom = 1)}>Actual size</button>
        </div>
      {/snippet}
      {@render group(0, 'Zoom', 'fit', 'Zoom', 'Zoom', '', gView0)}
      {#snippet gView1()}
        {@render toggle('Layers and source', tool.showNavigator, (on) => (tool.showNavigator = on))}
        {@render toggle('Format pane', tool.showFormat, (on) => (tool.showFormat = on))}
      {/snippet}
      {@render group(1, 'Panes', 'panelRight', 'Panes', 'Panes', 'stack', gView1)}
      {#snippet gView2()}
        {@render big(
          theme === 'dark' ? 'sun' : 'moon',
          theme === 'dark' ? 'Light theme' : 'Dark theme',
          toggleTheme,
        )}
      {/snippet}
      {@render group(2, 'Theme', 'moon', 'Theme', 'Theme', '', gView2)}
    {:else if active === 'Animate'}
      {#snippet gAnimate0()}
        {@render big(
          tool.playing ? 'pause' : 'play',
          tool.playing ? 'Pause' : 'Play',
          () => (tool.playing = !tool.playing),
          !tool.timeline,
          true,
        )}
        <div class="stack">
          {@render small('stepback', 'Step back', () => step(-1), !tool.timeline)}
          {@render small('stepforward', 'Step forward', () => step(1), !tool.timeline)}
        </div>
      {/snippet}
      {@render group(0, 'Playback', 'play', 'Playback', 'Playback', '', gAnimate0)}
      {#snippet gAnimate1()}
        <label class="option"
          >Look <select
            class="documents"
            aria-label="Animation look"
            value={tool.animation.look}
            disabled={!tool.valid}
            onchange={(e) => tool.setAnimation({ look: e.currentTarget.value as AnimationLook })}
          >
            {#each LOOKS as [value, label] (value)}<option {value}>{label}</option>{/each}
          </select></label
        >
        <label class="option"
          >Scene <select
            class="documents"
            aria-label="Animation scene"
            value={tool.animation.scene}
            disabled={!tool.valid || !signalLook}
            onchange={(e) => tool.setAnimation({ scene: e.currentTarget.value as AnimationScene })}
          >
            {#each SCENES as [value, label] (value)}<option {value}>{label}</option>{/each}
          </select></label
        >
      {/snippet}
      {@render group(1, 'Look', 'film', 'Look', 'Look', 'stack', gAnimate1)}
      {#snippet gAnimate2()}
        <label class="option"
          >Speed <select
            class="documents"
            aria-label="Animation speed"
            value={tool.animation.speed}
            disabled={!tool.valid}
            onchange={(e) => tool.setAnimation({ speed: Number(e.currentTarget.value) })}
          >
            {#each SPEEDS as speed (speed)}<option value={speed}>{speed}×</option>{/each}
          </select></label
        >
        {@render toggle('Loop', tool.animation.loop, (on) => tool.setAnimation({ loop: on }))}
      {/snippet}
      {@render group(2, 'Timing', 'repeat', 'Timing', 'Timing', 'stack', gAnimate2)}
      {#snippet gAnimate3()}
        {@render toggle('Hidden layers stay gray', tool.animation.grayHidden, (on) =>
          tool.setAnimation({ grayHidden: on }),
        )}
        {@render toggle('Weight colors in still images', tool.weights, (on) => tool.setWeights(on))}
      {/snippet}
      {@render group(3, 'Layers and weights', 'layers', 'Layers', 'Layers', 'stack', gAnimate3)}
      {#snippet gAnimate4()}
        {@render big('download', 'Animated SVG', () => exportAnimation('svg'), !tool.layout)}
        <div class="stack">
          {@render small('film', 'GIF', () => exportAnimation('gif'), !tool.layout)}
          {@render small('film', 'Video', () => exportAnimation('video'), !tool.layout)}
        </div>
      {/snippet}
      {@render group(4, 'Save animation', 'download', 'Save', 'Save', '', gAnimate4)}
    {:else if active === 'Export'}
      {#snippet gExport0()}
        {@render big('download', 'Export SVG', () => exportAs('svg'), !tool.layout, true)}
        {@render big('download', 'Export PNG', () => exportAs('png'), !tool.layout)}
        <div class="stack">
          {@render small('copy', 'Copy SVG', copySvg, !tool.layout)}
          {@render toggle('Editable SVG text', tool.liveText, (on) => (tool.liveText = on))}
        </div>
      {/snippet}
      {@render group(0, 'Images', 'download', 'Images', 'Images', '', gExport0)}
      {#snippet gExport1()}
        {@render big('file', 'Export PDF', () => exportAs('pdf'), !tool.layout)}
        {@render big('code', 'Export TikZ', () => exportAs('tex'), !tool.layout)}
        <div class="stack">
          {@render small('copy', 'Copy TikZ', copyTikz, !tool.layout)}
        </div>
      {/snippet}
      {@render group(1, 'Documents', 'file', 'Documents', 'Documents', '', gExport1)}
      {#snippet gExport2()}
        {@render big('code', 'Embed code', () => exportAs('embed'), !tool.layout)}
        {@render big('download', 'Model file', () => exportAs('json'), !tool.model)}
      {/snippet}
      {@render group(2, 'Share', 'link', 'Share', 'Share', '', gExport2)}
      {#snippet gExport3()}
        <label class="option"
          >PNG size <select
            class="documents"
            value={tool.pngDpi}
            onchange={(e) => (tool.pngDpi = Number(e.currentTarget.value))}
          >
            {#each PNG_SIZES as size (size.dpi)}<option value={size.dpi}>{size.label}</option
              >{/each}
          </select></label
        >
        <label class="option"
          >TikZ <select
            class="documents"
            value={tool.tikzStandalone ? 'document' : 'picture'}
            onchange={(e) => (tool.tikzStandalone = e.currentTarget.value === 'document')}
          >
            <option value="document">Standalone document</option>
            <option value="picture">tikzpicture only</option>
          </select></label
        >
      {/snippet}
      {@render group(3, 'Export options', 'edit', 'Options', 'Options', 'stack', gExport3)}
    {:else}
      {#snippet gHelp0()}
        {@render manualButton('shorthand', 'shorthand', 'Shorthand')}
        {@render manualButton('convolutions', 'convolution', 'Convolutions')}
        {@render manualButton('yaml', 'braces', 'YAML')}
        {@render manualButton('keyboard', 'keyboard', 'Keyboard')}
      {/snippet}
      {@render group(0, 'Manual', 'help', 'Manual', 'Manual', '', gHelp0)}
      {#snippet gHelp1()}
        <a class="big" href={`${import.meta.env.BASE_URL}guide/`}
          ><Icon name="help" size={26} /><span>Full guide</span></a
        >
      {/snippet}
      {@render group(1, 'Guide', 'file', 'Guide', 'Guide', '', gHelp1)}
      {#snippet gHelp2()}
        <a class="big" href={`${SITE.repoUrl}/issues`} target="_blank" rel="noopener"
          ><Icon name="external" size={26} /><span>Report an issue</span></a
        >
      {/snippet}
      {@render group(2, 'Feedback', 'external', 'Feedback', 'Feedback', '', gHelp2)}
      {#snippet gHelp3()}
        <a class="small" href={`${import.meta.env.BASE_URL}about/#privacy`}>Privacy</a>
        <button
          type="button"
          class="small"
          onclick={() => document.dispatchEvent(new CustomEvent('xm:consent-open'))}
          >Cookie settings</button
        >
      {/snippet}
      {@render group(3, 'Privacy', 'check', 'Privacy', 'Privacy', 'stack', gHelp3)}
    {/if}
  </div>
</div>

<style>
  .ribbon {
    position: relative;
    z-index: 5;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }

  /* Collapsed, the ribbon is just the tab row; the open panel floats over the editor. */
  .ribbon.collapsed {
    border-bottom: 0;
  }

  .tabs {
    display: flex;
    gap: 2px;
    padding: 0 10px;
    border-bottom: 1px solid var(--line);
  }

  .list {
    display: flex;
    gap: 2px;
  }

  .tabs button:not(.fold) {
    border: 0;
    border-bottom: 3px solid transparent;
    background: none;
    color: var(--ink);
    font: 500 0.85rem var(--font-sans);
    padding: 8px 14px 6px;
    cursor: pointer;
  }

  .tabs .fold {
    display: grid;
    place-items: center;
    align-self: center;
    margin-left: auto;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }

  .tabs .fold:hover {
    background: var(--surface-2);
    color: var(--ink);
  }

  .tabs button[aria-selected='true'] {
    border-bottom-color: var(--accent);
    font-weight: 700;
  }

  .tabs button.file {
    color: var(--accent);
    font-weight: 700;
  }

  .panel {
    display: flex;
    align-items: stretch;
    padding: 6px 6px 0;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .panel[hidden] {
    display: none;
  }

  .panel.float {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    box-shadow: 0 6px 14px rgb(0 0 0 / 0.18);
  }

  .group {
    display: flex;
    flex-direction: column;
    padding: 0 10px;
    border-right: 1px solid var(--line);
    flex: none;
  }

  /* Every group has the same body height, so the captions line up across the ribbon. */
  .body {
    flex: none;
    height: 78px;
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .caption {
    flex: none;
    padding: 2px 0 4px;
    white-space: nowrap;
    font-size: 0.7rem;
    color: var(--muted);
    text-align: center;
  }

  /* Narrow stages: small buttons lose their labels, big buttons become icons. */
  .s1 .small.ic .t,
  .s2 .small.ic .t,
  .s2 .big span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .s2 .big {
    width: 40px;
  }

  .foldbtn {
    gap: 2px;
  }

  .popup {
    position: fixed;
    z-index: 10;
    display: flex;
    flex-direction: column;
    padding: 6px 10px 0;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--surface);
    box-shadow: 0 6px 14px rgb(0 0 0 / 0.25);
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .big {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 70px;
    padding: 5px 4px;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
    color: var(--ink);
    font: 500 0.74rem var(--font-sans);
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }

  .big.primary {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  a.small {
    text-decoration: none;
  }

  .small {
    display: flex;
    align-items: center;
    min-height: 24px;
    gap: 6px;
    padding: 3px 7px;
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--ink);
    font: 0.8rem var(--font-sans);
    white-space: nowrap;
    cursor: pointer;
  }

  .big:hover:not(:disabled),
  .small:hover:not(:disabled) {
    background: var(--surface-2);
  }

  button:disabled {
    color: var(--muted);
    opacity: 0.55;
    cursor: default;
  }

  .option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.8rem;
    white-space: nowrap;
  }

  /* A focused field lifts above its neighbours so its ring is never hidden by the next one. */
  .documents:focus-visible,
  .numbers input:focus-visible,
  .small:focus-visible,
  .big:focus-visible {
    position: relative;
    z-index: 1;
  }

  .documents {
    min-height: 26px;
    max-width: 210px;
    padding: 2px 6px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 0.8rem var(--font-sans);
  }

  .meta {
    padding: 4px 2px;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .examples {
    display: grid;
    grid-template-columns: auto auto;
    gap: 2px 4px;
  }

  .gallery {
    display: flex;
    align-items: stretch;
    gap: 4px;
  }

  .thumb {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 62px;
    min-height: 58px;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 0.62rem/1.15 var(--font-sans);
    text-align: center;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .thumb:hover {
    border-color: var(--muted);
  }

  .thumb[aria-pressed='true'] {
    border-color: var(--accent);
    outline: 1px solid var(--accent);
  }

  .switch {
    display: flex;
    align-items: center;
    min-height: 24px;
    gap: 8px;
    padding: 3px 4px;
    font-size: 0.8rem;
    white-space: nowrap;
    cursor: pointer;
  }

  .switch {
    position: relative;
  }

  /* Three switches fit the height of the other groups (targets stay 24 px tall). */
  .three .switch {
    padding-block: 0;
  }

  /* The real checkbox covers the whole label, so every click reaches it. */
  .switch input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .switch span {
    position: relative;
    width: 28px;
    height: 16px;
    border-radius: 8px;
    background: var(--line);
    flex: none;
  }

  .switch span::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
  }

  .switch input:checked + span {
    background: var(--accent);
  }

  .switch input:checked + span::after {
    left: 14px;
  }

  .switch input:focus-visible + span {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .numbers label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.8rem;
  }

  .numbers input {
    width: 72px;
    min-height: 24px;
    padding: 2px 6px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 0.8rem var(--font-mono);
  }
</style>

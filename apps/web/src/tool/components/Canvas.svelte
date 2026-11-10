<script lang="ts">
  import { untrack } from 'svelte';
  import { player } from '../player.ts';
  import { parseSafeSvg } from '../safe-svg.ts';
  import { tool } from '../state.svelte.ts';
  import Scrubber from './Scrubber.svelte';

  let width = $state(0);
  let height = $state(0);
  let viewport: HTMLDivElement | undefined = $state();

  const scene = $derived(tool.layout?.scene);
  const PADDING = 48;
  const fitScale = $derived(
    scene
      ? Math.min(
          3,
          Math.max(
            0.1,
            Math.min((width - PADDING) / scene.width, (height - PADDING) / scene.height),
          ),
        )
      : 1,
  );
  const scale = $derived(tool.zoom === 'fit' ? fitScale : tool.zoom);

  $effect(() => {
    tool.scale = scale;
  });

  // Play and pause; while playing, the scrubber follows the animation.
  $effect(() => {
    if (!tool.timeline) return;
    if (!tool.playing) {
      player.pause();
      return;
    }
    player.play();
    let frame = requestAnimationFrame(function tick() {
      tool.time = player.time;
      if (player.finished) tool.playing = false;
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  // Mounts the preview as parsed, filtered nodes (never innerHTML) and marks the selected layer
  // (ids come from the Scene: pv-layer-N). Re-runs when the preview or the selection changes.
  function mountPreview(node: HTMLElement) {
    const svg = parseSafeSvg(tool.preview);
    node.replaceChildren(...(svg ? [svg] : []));
    // A redrawn preview picks up the animation where it was.
    const timeline = tool.timeline;
    if (svg && timeline) {
      untrack(() => player.attach(svg, timeline, 'pv-', tool.time, tool.playing, 1));
    } else player.detach();
    const selection = tool.selection;
    if (svg && selection.kind === 'layer') {
      const chosen = svg.querySelector(`#pv-layer-${selection.index}`);
      chosen?.setAttribute('data-selected', '');
      // A frame marks the selected layer; lighter frames mark the layers of the same kind, which
      // share its colors. Frames leave the layer's own colors visible.
      const role = tool.selectedRole;
      const groups = role ? [...svg.querySelectorAll(`.pv-layer-${role}`)] : chosen ? [chosen] : [];
      for (const group of groups) frame(svg, group as SVGGraphicsElement, group === chosen);
    }
  }

  function frame(svg: SVGSVGElement, group: SVGGraphicsElement, selected: boolean) {
    let box: DOMRect;
    try {
      box = group.getBBox();
    } catch {
      return;
    }
    if (box.width === 0 && box.height === 0) return;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const pad = 4;
    rect.setAttribute('x', String(box.x - pad));
    rect.setAttribute('y', String(box.y - pad));
    rect.setAttribute('width', String(box.width + 2 * pad));
    rect.setAttribute('height', String(box.height + 2 * pad));
    rect.setAttribute('rx', '4');
    rect.setAttribute('class', selected ? 'pv-frame pv-frame-selected' : 'pv-frame');
    svg.append(rect);
  }

  function onClick(event: MouseEvent) {
    const target = (event.target as Element).closest(
      '[id^="pv-node-"],[id^="pv-layer-"],[id^="pv-name-"],[id^="pv-size-"],[id^="pv-op-"],[id^="pv-ellipsis-"]',
    );
    const index = target ? Number(target.id.split('-')[2]) : NaN;
    tool.select(Number.isInteger(index) ? { kind: 'layer', index } : { kind: 'diagram' });
  }

  function onWheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    tool.zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1);
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === '+' || event.key === '=') tool.zoomBy(1.25);
    else if (event.key === '-') tool.zoomBy(0.8);
    else if (event.key === '0') tool.zoom = 'fit';
    else return;
    event.preventDefault();
  }

  // Drag to pan when the figure is larger than the view. Panning starts only after the pointer
  // moves a few pixels, so a plain click still selects a layer.
  let drag: { x: number; y: number; left: number; top: number; moving: boolean } | undefined;
  function onPointerDown(event: PointerEvent) {
    if (!viewport || event.button !== 0 || event.pointerType === 'touch') return;
    drag = {
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
      moving: false,
    };
  }
  function onPointerMove(event: PointerEvent) {
    if (!drag || !viewport) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moving && Math.hypot(dx, dy) < 4) return;
    if (!drag.moving) {
      drag.moving = true;
      viewport.setPointerCapture(event.pointerId);
    }
    viewport.scrollLeft = drag.left - dx;
    viewport.scrollTop = drag.top - dy;
  }
</script>

<!-- A focusable pan and zoom area with keyboard shortcuts (plus, minus, zero). -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="viewport"
  bind:this={viewport}
  bind:clientWidth={width}
  bind:clientHeight={height}
  role="region"
  aria-label="Preview. Click a layer to select it. Plus and minus zoom, zero fits."
  tabindex="0"
  onwheel={onWheel}
  onkeydown={onKey}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={() => (drag = undefined)}
>
  {#if tool.engineError}
    <p class="message">The preview could not start: {tool.engineError}</p>
  {:else if !tool.preview}
    <p class="message">Loading fonts and the text engine…</p>
  {:else}
    <div class="stage">
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        class="paper"
        class:transparent={tool.transparent}
        class:stale={!tool.valid}
        style:zoom={scale}
        {@attach mountPreview}
        onclick={onClick}
      ></div>
    </div>
    {#if tool.timeline}<Scrubber />{/if}
  {/if}
</div>

<style>
  .viewport {
    position: relative;
    overflow: auto;
    min-width: 0;
    min-height: 0;
    background-color: var(--canvas);
    background-image: radial-gradient(
      color-mix(in srgb, var(--line) 70%, transparent) 1px,
      transparent 1px
    );
    background-size: 18px 18px;
    cursor: grab;
  }

  .viewport:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .stage {
    display: grid;
    place-items: center;
    min-width: 100%;
    min-height: 100%;
    width: max-content;
    padding: 24px;
    box-sizing: border-box;
  }

  .paper {
    background: #fff;
    box-shadow: 0 6px 28px rgb(0 0 0 / 0.14);
    cursor: default;
  }

  .paper.transparent {
    background: repeating-conic-gradient(#e7e7e7 0 25%, #fff 0 50%) 0 0 / 14px 14px;
  }

  .paper.stale {
    opacity: 0.5;
  }

  .paper :global(svg) {
    display: block;
  }

  .paper :global(.pv-frame) {
    fill: none;
    stroke: #0b6bcb;
    stroke-width: 1;
    stroke-dasharray: 4 3;
    opacity: 0.6;
    pointer-events: none;
    vector-effect: non-scaling-stroke;
  }

  .paper :global(.pv-frame-selected) {
    stroke-width: 2;
    stroke-dasharray: none;
    opacity: 1;
  }

  .message {
    margin: 40px auto;
    max-width: 28em;
    color: var(--muted);
    text-align: center;
  }
</style>

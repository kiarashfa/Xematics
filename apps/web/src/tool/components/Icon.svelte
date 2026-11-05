<script lang="ts" module>
  const PATHS = {
    undo: 'M9 14 4 9l5-5|M4 9h10a6 6 0 0 1 0 12h-3',
    redo: 'M15 14l5-5-5-5|M20 9H10a6 6 0 0 0 0 12h3',
    plus: 'M12 5v14|M5 12h14',
    back: 'M15 5l-7 7 7 7',
    more: 'M5 12h.01|M12 12h.01|M19 12h.01',
    chevron: 'M7 10l5 5 5-5',
    close: 'M6 6l12 12|M18 6 6 18',
    edit: 'M4 20h4L19 9l-4-4L4 16z',
    canvas: 'M3 5h18v14H3z|M7 9h.01|M7 15h.01|M17 12h.01|M7 9l10 3|M7 15l10-3',
    cards: 'M4 4h16v6H4z|M4 14h16v6H4z',
    code: 'M8 8l-4 4 4 4|M16 8l4 4-4 4',
    keypad:
      'M5 3h14v18H5z|M9 7h.01|M12 7h.01|M15 7h.01|M9 11h.01|M12 11h.01|M15 11h.01|M9 15h.01|M12 15h.01|M15 15h.01',
    commands: 'M18 15l-6-6-6 6',
    tag: 'M3 12V4h8l10 10-8 8z|M7.5 7.5h.01',
    minus: 'M5 12h14',
    trash: 'M4 7h16|M9 7V4h6v3|M6 7l1 13h10l1-13',
    left: 'M15 6l-6 6 6 6',
    right: 'M9 6l6 6-6 6',
    download: 'M12 3v12|M7 10l5 5 5-5|M5 21h14',
    copy: 'M9 9h11v11H9z|M5 15H4V4h11v1',
    file: 'M6 2h8l5 5v15H6z|M14 2v5h5',
    open: 'M3 7h6l2 2h10v11H3z',
    sun: 'M12 3v2|M12 19v2|M3 12h2|M19 12h2|M5.6 5.6l1.4 1.4|M17 17l1.4 1.4|M5.6 18.4 7 17|M17 7l1.4-1.4|M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    fit: 'M4 9V4h5|M20 9V4h-5|M4 15v5h5|M20 15v5h-5',
    check: 'M5 12l5 5 9-10',
    alert: 'M12 3 2 21h20z|M12 10v5|M12 18h.01',
    panelLeft: 'M3 4h18v16H3z|M9 4v16',
    panelRight: 'M3 4h18v16H3z|M15 4v16',
    layers: 'M12 3 3 8l9 5 9-5z|M3 13l9 5 9-5',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14|M12 17h.01',
    external: 'M14 4h6v6|M20 4l-9 9|M18 14v6H4V6h6',
    link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7|M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
    play: 'M7 4l13 8-13 8z',
    pause: 'M7 4v16|M17 4v16',
    stepback: 'M18 5 9 12l9 7z|M6 5v14',
    stepforward: 'M6 5l9 7-9 7z|M18 5v14',
    repeat: 'M17 2l4 4-4 4|M3 11V9a3 3 0 0 1 3-3h15|M7 22l-4-4 4-4|M21 13v2a3 3 0 0 1-3 3H3',
    film: 'M3 5h18v14H3z|M3 9h18|M3 15h18|M8 5v4|M16 5v4|M8 15v4|M16 15v4',
    shorthand: 'M3 12h4|M10 12h4|M17 12h4|M5 8v8|M12 8v8|M19 8v8',
    convolution: 'M3 3h18v18H3z|M9 3v18|M15 3v18|M3 9h18|M3 15h18',
    braces:
      'M8 4c-2 0-3 1-3 3v2c0 1-1 3-2 3 1 0 2 2 2 3v2c0 2 1 3 3 3|M16 4c2 0 3 1 3 3v2c0 1 1 3 2 3-1 0-2 2-2 3v2c0 2-1 3-3 3',
    keyboard: 'M2 6h20v12H2z|M6 10h.01|M10 10h.01|M14 10h.01|M18 10h.01|M7 14h10',
    chevronUp: 'M7 14l5-5 5 5',
    pin: 'M9 4h6l-1 6 3 3H7l3-3z|M12 13v8',
  } as const;

  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
  {#each PATHS[name].split('|') as d (d)}
    <path {d} />
  {/each}
</svg>

<style>
  .icon {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';

  let {
    label,
    onclose,
    header,
    children,
    tall = false,
  }: {
    label: string;
    onclose: () => void;
    header?: Snippet;
    children: Snippet;
    tall?: boolean;
  } = $props();

  // Move focus into the sheet when it opens, so keyboard and screen reader users land in it.
  function focusIn(node: HTMLElement) {
    node.focus();
  }
</script>

<div
  class="sheet"
  class:tall
  role="dialog"
  aria-label={label}
  tabindex="-1"
  onkeydown={(e) => e.key === 'Escape' && onclose()}
  {@attach focusIn}
>
  <div class="grip" aria-hidden="true"></div>
  <header>
    {#if header}{@render header()}{:else}<h2>{label}</h2>{/if}
    <button type="button" class="ph-ib" aria-label="Close" onclick={onclose}
      ><Icon name="close" /></button
    >
  </header>
  <div class="body">{@render children()}</div>
</div>

<style>
  .sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    max-height: 72%;
    padding: 4px 14px 18px;
    border-top: 1px solid var(--line);
    border-radius: 20px 20px 0 0;
    background: var(--surface);
    box-shadow: 0 -10px 30px rgb(0 0 0 / 0.2);
    outline: none;
  }

  .sheet.tall {
    max-height: 86%;
  }

  .grip {
    width: 42px;
    height: 5px;
    margin: 6px auto 4px;
    border-radius: 3px;
    background: var(--line);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .body {
    min-height: 0;
    overflow: auto;
  }
</style>

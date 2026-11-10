// What a color panel changes. Kept apart from ColorPanel.svelte so menus can name a target
// without loading the panel itself (it loads on first use).

import type { Role } from '@xematics/core';

/** One part of a layer kind, or an animation color. */
export type ColorTarget =
  | { kind: 'role'; role: Role; part: 'fill' | 'outline' }
  | { kind: 'motion'; key: 'forward' | 'backward' };

export function targetTitle(target: ColorTarget): string {
  if (target.kind === 'motion')
    return target.key === 'forward' ? 'Forward pass color' : 'Backward pass color';
  return `${target.part === 'fill' ? 'Fill' : 'Outline'} of ${target.role} layers`;
}

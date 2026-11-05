// Starter documents and document names, shared by the editor and the profile page.

export const EXAMPLES = [
  { name: 'Perceptron', text: '3-1' },
  { name: 'Two-layer MLP', text: '3-5-4-2' },
  {
    name: 'MNIST classifier',
    text: 'title: MNIST classifier\nlayers:\n  - { units: 784, name: Pixels }\n  - { units: 16, activation: relu }\n  - { units: 16, activation: relu }\n  - { units: 10, name: Digits }\n',
  },
  { name: 'Autoencoder', text: 'ae(8-4-2)' },
] as const;

/** A short name for a document: its title, or the start of its source. */
export function documentName(text: string): string {
  const title = /^\s*title:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
  const first = text.trim().split('\n')[0] ?? '';
  return (title ?? first).slice(0, 48) || 'Untitled';
}

/** Style presets in the order the ribbon shows them. */
export const PRESET_CHOICES = [
  { id: 'classic', label: 'Classic' },
  { id: 'boxes', label: 'Layer boxes' },
  { id: 'mono', label: 'Print mono' },
  { id: 'colorblind', label: 'Colorblind' },
  { id: 'colorblind-dark', label: 'Colorblind dark' },
] as const;

export type PresetChoice = (typeof PRESET_CHOICES)[number]['id'];

export function isPresetChoice(value: unknown): value is PresetChoice {
  return PRESET_CHOICES.some((p) => p.id === value);
}

/** The source of a new diagram, in the visitor's default style. */
export function starterText(preset: unknown): string {
  return isPresetChoice(preset) && preset !== 'classic'
    ? `layers: [4, 8, 3]\nstyle: { preset: ${preset} }\n`
    : '4-8-3';
}

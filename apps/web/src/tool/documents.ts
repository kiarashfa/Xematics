// Starter documents and document names, shared by the editor and the profile page.

export const EXAMPLES = [
  { name: 'Perceptron', text: '3-1' },
  { name: 'Two-layer MLP', text: '3-5-4-2' },
  {
    name: 'MNIST classifier',
    text: 'title: MNIST classifier\nlayers:\n  - { units: 784, name: Pixels }\n  - { units: 16, activation: relu }\n  - { units: 16, activation: relu }\n  - { units: 10, name: Digits }\n',
  },
  { name: 'Autoencoder', text: '8-4-2-4-8' },
] as const;

/** A short name for a document: its title, or the start of its source. */
export function documentName(text: string): string {
  const title = /^\s*title:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
  const first = text.trim().split('\n')[0] ?? '';
  return (title ?? first).slice(0, 48) || 'Untitled';
}

// The examples gallery: classic networks that together show every preset and feature.
// Each source is exactly what opens in the editor.

export interface Example {
  readonly slug: string;
  readonly title: string;
  readonly note: string;
  readonly source: string;
}

export const EXAMPLES: readonly Example[] = [
  {
    slug: 'perceptron',
    title: 'Perceptron',
    note: 'One neuron weighing three inputs: the smallest network.',
    source: '3-1',
  },
  {
    slug: 'xor',
    title: 'XOR network',
    note: 'The classic case one layer cannot solve and one hidden layer can.',
    source: `title: XOR network
layers:
  - { units: 2, nodeLabel: "$x_{i}$" }
  - { units: 2, activation: relu, nodeLabel: "$h_{i}$" }
  - { units: 1, activation: sigmoid, nodeLabel: "$\\\\hat{y}$" }
`,
  },
  {
    slug: 'two-layer-mlp',
    title: 'Two-layer MLP',
    note: 'A small fully connected network with two hidden layers.',
    source: '3-5:relu-4:relu-2',
  },
  {
    slug: 'mnist',
    title: 'MNIST classifier',
    note: 'Handwritten digits: 784 pixels in, ten classes out.',
    source: `title: MNIST classifier
layers:
  - { units: 784, name: Pixels }
  - { units: 128, activation: relu }
  - { units: 64, activation: relu }
  - { units: 10, activation: softmax, name: Digits }
`,
  },
  {
    slug: 'deep-mlp',
    title: 'Deep MLP',
    note: 'Many hidden layers drawn as compact bars with the Layer boxes preset.',
    source: `title: Deep MLP
layers: [784, 512, 256, 256, 128, 64, 10]
style: { preset: boxes }
`,
  },
  {
    slug: 'autoencoder',
    title: 'Autoencoder',
    note: 'Compresses its input to a small code, then rebuilds it.',
    source: `title: Autoencoder
layers:
  - { units: 8, name: Input }
  - 4
  - { units: 2, name: Code }
  - 4
  - { units: 8, name: Reconstruction }
`,
  },
  {
    slug: 'iris',
    title: 'Iris classifier',
    note: 'Four flower measurements, three species. Print mono for black and white papers.',
    source: `title: Iris classifier
layers:
  - { units: 4, name: Measurements }
  - { units: 8, activation: relu }
  - { units: 3, activation: softmax, name: Species }
style: { preset: mono }
`,
  },
  {
    slug: 'regression',
    title: 'Regression with math labels',
    note: 'Layer names in LaTeX math, with colorblind-safe colors.',
    source: `title: Regression network
layers:
  - { units: 13, name: "$\\\\mathbf{x} \\\\in \\\\mathbb{R}^{13}$" }
  - { units: 32, activation: relu, name: "$h^{(1)}$" }
  - { units: 16, activation: relu, name: "$h^{(2)}$" }
  - { units: 1, name: "$\\\\hat{y}$" }
style: { preset: colorblind }
`,
  },
  {
    slug: 'persian',
    title: 'Persian labels, right to left',
    note: 'Persian names with the flow mirrored, input on the right.',
    source: `title: شبکه عصبی
layers:
  - { units: 784, name: پیکسل‌ها }
  - { units: 64, name: لایه پنهان }
  - { units: 10, name: ارقام }
style: { direction: rtl }
`,
  },
  {
    slug: 'slides',
    title: 'Network for dark slides',
    note: 'Colorblind dark preset for presentations on a dark background.',
    source: `title: Network for dark slides
layers:
  - { units: 6, name: Input }
  - { units: 10, activation: relu }
  - { units: 10, activation: relu }
  - { units: 4, name: Output }
style: { preset: colorblind-dark }
`,
  },
];

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
    slug: 'cnn',
    title: 'Convolutional network',
    note: 'Two convolution and pooling stages read the image, a dense head classifies it.',
    source: `title: Convolutional network
layers: in(28x28x1)-conv(8,3x3):relu-pool(2)-conv(16,3x3):relu-pool(2)-flatten-fc(64):relu-fc(10):softmax
`,
  },
  {
    slug: 'lenet',
    title: 'LeNet-5',
    note: 'The classic digit reader: valid convolutions and average pooling, in Print mono.',
    source: `title: LeNet-5
layers:
  - { type: input, shape: [32, 32, 1], name: Input }
  - { type: conv, filters: 6, kernel: 5, padding: valid, activation: tanh, name: C1 }
  - { type: pool, size: 2, mode: avg, name: S2 }
  - { type: conv, filters: 16, kernel: 5, padding: valid, activation: tanh, name: C3 }
  - { type: pool, size: 2, mode: avg, name: S4 }
  - { type: flatten }
  - { units: 120, activation: tanh, name: C5 }
  - { units: 84, activation: tanh, name: F6 }
  - { units: 10, activation: softmax, name: Output }
style: { preset: mono }
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
    note: 'The encoder squeezes the input into a small latent space; the decoder rebuilds it.',
    source: `title: Autoencoder
layers: ae(784-256-64-16)
`,
  },
  {
    slug: 'lstm',
    title: 'LSTM sequence model',
    note: 'Unrolled over time: one cell per step, the cell state and output passed along.',
    source: `title: LSTM sequence model
layers: seq(20x32)-lstm(64)-fc(10):softmax
`,
  },
  {
    slug: 'sentiment',
    title: 'Text classifier',
    note: 'Words become vectors, a bidirectional GRU reads them both ways, the last step decides.',
    source: `title: Text classifier
layers: tokens(50)-embed(128)-bigru(64,last)-fc(2):softmax
style: { preset: colorblind }
`,
  },
  {
    slug: 'lstm-cell',
    title: 'Inside an LSTM cell',
    note: 'The gates of one cell: forget, input, candidate and output.',
    source: `title: Inside an LSTM cell
layers: seq(20x32)-lstm(64)-fc(10)
style: { cell: true }
`,
  },
  {
    slug: 'gan',
    title: 'Generative adversarial network',
    note: 'The generator turns noise into fakes; the discriminator tells them from real data.',
    source: `title: GAN
layers: gan(100-256-512-784:tanh | 784-512-256-1:sigmoid)
`,
  },
  {
    slug: 'gpt',
    title: 'Decoder-only Transformer',
    note: 'A GPT-style language model: twelve masked attention blocks predict the next token.',
    source: `title: Decoder-only Transformer
layers: tokens(1024)-embed(768)-decoder(12,12)-fc(50257):softmax
`,
  },
  {
    slug: 'transformer',
    title: 'Encoder-decoder Transformer',
    note: 'The translation model: the encoder output feeds the decoder through cross attention.',
    source: `title: Encoder-decoder Transformer
layers: tokens(512)-embed(512)-encoder(6,8)-decoder(6,8)-fc(37000):softmax
style: { preset: colorblind-dark }
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

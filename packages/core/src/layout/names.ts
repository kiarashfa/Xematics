// Automatic layer names for recurrent and Transformer models. Kept apart from their layouts, which
// load on demand, because the editor and the convolutional layout need the names right away.

import type { Layer, RecurrentLayer, RecurrentType } from '../model/schema.ts';
import { cleanLabel } from './mlp.ts';

export const CELL_WORD: Readonly<Record<RecurrentType, string>> = {
  rnn: 'RNN',
  lstm: 'LSTM',
  gru: 'GRU',
};

/** The cell's name with a Bi prefix for bidirectional layers: BiLSTM. */
export function cellWord(layer: RecurrentLayer): string {
  return `${layer.bidirectional ? 'Bi' : ''}${CELL_WORD[layer.type]}`;
}

/** The name shown for each layer of a sequence model (recurrent or Transformer) without its own. */
export function sequenceAutoNames(layers: readonly Layer[]): string[] {
  const count = layers.length;
  const words = layers.map((layer, i) => {
    switch (layer.type) {
      case 'sequence':
      case 'input':
        return 'Input';
      case 'tokens':
        return 'Tokens';
      case 'embed':
        return 'Embedding';
      case 'encoder':
        return 'Encoder';
      case 'decoder':
        return 'Decoder';
      case 'rnn':
      case 'lstm':
      case 'gru':
        return cellWord(layer);
      case 'flatten':
        return 'Flatten';
      case 'gap':
        return 'Pooling';
      case 'gan':
        return 'GAN';
      case 'autoencoder':
        return layer.vae ? 'VAE' : 'Autoencoder';
      default:
        return i === count - 1 ? 'Output' : 'Dense';
    }
  });
  const totals: Record<string, number> = {};
  for (const word of words) totals[word] = (totals[word] ?? 0) + 1;
  const seen: Record<string, number> = {};
  return words.map((word) => {
    // Numbered only when there is more than one of a kind, like Hidden in fully connected networks.
    if ((totals[word] ?? 0) < 2) return word;
    seen[word] = (seen[word] ?? 0) + 1;
    return `${word} ${seen[word]}`;
  });
}

export const layerNameText = (layer: Layer, auto: string) =>
  layer.name === undefined ? auto : cleanLabel(layer.name);

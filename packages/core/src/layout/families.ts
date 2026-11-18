// The recurrent, Transformer, GAN and autoencoder layouts, loaded on demand. They are a large part
// of the editor's code and fully connected or convolutional diagrams never need them, so browsers
// fetch them only for those models (loadFamilyLayouts). In Node they load with the package entry
// (index.ts), so layout stays synchronous for the CLI, tests and the site build. Not here: the
// layouts import mlp.ts, which imports this module, and waiting inside that cycle never ends.

import { familyOf, type Model } from '../model/schema.ts';
import type * as Layouts from './family-layouts.ts';
import { resolveTheme } from '../style/theme.ts';

export type FamilyLayouts = typeof Layouts;

let loaded: FamilyLayouts | undefined;
let loading: Promise<FamilyLayouts> | undefined;

/** Thrown when a model needs a family layout before loadFamilyLayouts has finished. */
export class FamilyLayoutsNotLoadedError extends Error {
  constructor() {
    super('The layout for this kind of network is still loading.');
    this.name = 'FamilyLayoutsNotLoadedError';
  }
}

/** Loads the family layouts once; later calls return the same promise. */
export function loadFamilyLayouts(): Promise<FamilyLayouts> {
  loading ??= import('./family-layouts.ts').then(
    (module) => (loaded = module),
    (error: unknown) => {
      loading = undefined;
      throw error;
    },
  );
  return loading;
}

export function familyLayoutsLoaded(): boolean {
  return loaded !== undefined;
}

/** The loaded layouts; throws FamilyLayoutsNotLoadedError before loadFamilyLayouts has finished. */
export function familyLayouts(): FamilyLayouts {
  if (!loaded) throw new FamilyLayoutsNotLoadedError();
  return loaded;
}

/** True when laying out the model needs the recurrent, Transformer, GAN or autoencoder layout. */
export function needsFamilyLayouts(model: Model): boolean {
  const family = familyOf(model);
  if (family === 'rnn' || family === 'transformer' || family === 'gan') return true;
  if (family === 'autoencoder') return true;
  // Same rule as layoutModel: the autoencoder style switch draws any model of 3+ layers.
  return model.layers.length >= 3 && resolveTheme(model.style).autoencoder;
}

/** True when the model can be laid out now (its layout is loaded or always present). */
export function canLayout(model: Model): boolean {
  return loaded !== undefined || !needsFamilyLayouts(model);
}

// The YAML library, loaded on demand. It is a large part of the editor's code and shorthand
// never needs it, so browsers fetch it only for YAML or JSON sources (loadYaml). In Node it
// loads with this module, so parsing stays synchronous for the CLI, tests and the site build.

import type * as Yaml from 'yaml';

export type YamlModule = typeof Yaml;

let loaded: YamlModule | undefined;
let loading: Promise<YamlModule> | undefined;

/** Thrown by code that needs YAML before loadYaml has finished. */
export class YamlNotLoadedError extends Error {
  constructor() {
    super('The YAML reader is still loading.');
    this.name = 'YamlNotLoadedError';
  }
}

/** Loads the YAML library once; later calls return the same promise. */
export function loadYaml(): Promise<YamlModule> {
  loading ??= import('yaml').then(
    (module) => (loaded = module),
    (error: unknown) => {
      loading = undefined;
      throw error;
    },
  );
  return loading;
}

export function isYamlLoaded(): boolean {
  return loaded !== undefined;
}

/** The loaded library; throws YamlNotLoadedError before loadYaml has finished. */
export function yaml(): YamlModule {
  if (!loaded) throw new YamlNotLoadedError();
  return loaded;
}

const node = (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node;
if (node) await loadYaml();

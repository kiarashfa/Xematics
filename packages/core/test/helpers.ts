import type { TextEngine } from '../src/index.ts';
import { createNodeTextEngine } from '../src/node/index.ts';

let engine: Promise<TextEngine> | undefined;

/** One shared engine per test file; HarfBuzz and the fonts load once. */
export function getEngine(): Promise<TextEngine> {
  engine ??= createNodeTextEngine();
  return engine;
}

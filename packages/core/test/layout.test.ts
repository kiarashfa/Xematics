import { describe, expect, test } from 'vitest';
import {
  layoutModel,
  parseModel,
  type CircleItem,
  type LineItem,
  type Model,
  type Scene,
} from '../src/index.ts';
import { getEngine } from './helpers.ts';

function model(text: string): Model {
  const parsed = parseModel(text);
  if (!parsed.model) throw new Error(parsed.diagnostics.map((d) => d.message).join('\n'));
  return parsed.model;
}

async function layout(text: string) {
  return layoutModel(model(text), await getEngine());
}

const nodeIds = (scene: Scene, layer: number) =>
  scene.items
    .filter((i) => i.kind === 'circle' && i.id.startsWith(`node-${layer}-`))
    .map((i) => i.id);

describe('MLP layout', () => {
  test('collapses large layers to first, ellipsis, last', async () => {
    const { scene } = await layout('784-16-10');
    expect(nodeIds(scene, 0)).toEqual([
      'node-0-0',
      'node-0-1',
      'node-0-2',
      'node-0-781',
      'node-0-782',
      'node-0-783',
    ]);
    expect(scene.items.some((i) => i.id === 'ellipsis-0')).toBe(true);
    expect(nodeIds(scene, 2)).toHaveLength(10);
  });

  test('first and last are independent and per-layer overrides win', async () => {
    const { scene } = await layout(
      'layers:\n  - { units: 64, collapse: { first: 2, last: 4 } }\n  - { units: 20, collapse: false }\n  - 12\nstyle: { collapse: { above: 11 } }',
    );
    expect(nodeIds(scene, 0)).toEqual([
      'node-0-0',
      'node-0-1',
      'node-0-60',
      'node-0-61',
      'node-0-62',
      'node-0-63',
    ]);
    expect(nodeIds(scene, 1)).toHaveLength(20);
    expect(nodeIds(scene, 2)).toHaveLength(6);
  });

  test('does not collapse when first + last already cover the layer', async () => {
    const { scene } = await layout('layers:\n  - { units: 12, collapse: { first: 6, last: 6 } }');
    expect(nodeIds(scene, 0)).toHaveLength(12);
  });

  test('edges connect every visible pair and end on the circle outlines', async () => {
    const { scene } = await layout('3-5-4-2');
    const edges = scene.items.filter((i): i is LineItem => i.kind === 'line');
    expect(edges).toHaveLength(3 * 5 + 5 * 4 + 4 * 2);
    const nodes = new Map(
      scene.items.filter((i): i is CircleItem => i.kind === 'circle').map((n) => [n.id, n]),
    );
    const edge = edges.find((e) => e.id === 'edge-0-0-1-4')!;
    const from = nodes.get('node-0-0')!;
    expect(Math.hypot(edge.x1 - from.cx, edge.y1 - from.cy)).toBeCloseTo(from.r, 9);
  });

  test('ids are unique and groups come before their children', async () => {
    const { scene } = await layout('784-16-16-10');
    const seen = new Set<string>();
    for (const item of scene.items) {
      expect(seen.has(item.id)).toBe(false);
      if (item.parent !== undefined) expect(seen.has(item.parent)).toBe(true);
      seen.add(item.id);
    }
  });

  test('labels: auto names, custom names, empty names and size placement', async () => {
    const texts = (scene: Scene) =>
      scene.items.flatMap((i) => (i.kind === 'text' ? [`${i.id}=${i.text}`] : []));
    expect(texts((await layout('3-4-4-2')).scene)).toEqual([
      'name-0=Input',
      'size-0=3',
      'name-1=Hidden 1',
      'size-1=4',
      'name-2=Hidden 2',
      'size-2=4',
      'name-3=Output',
      'size-3=2',
    ]);
    expect(texts((await layout('3-4-2')).scene)).toContain('name-1=Hidden');
    const custom = await layout(
      'layers:\n  - { units: 30, name: "  Pixels\\n in " }\n  - { units: 2, name: "" }\nstyle: { labels: { sizes: false } }',
    );
    expect(texts(custom.scene)).toEqual(['name-0=Pixels in', 'size-0=30']);
    const sizeAbove = custom.scene.items.find((i) => i.id === 'size-0');
    const firstNode = custom.scene.items.find((i): i is CircleItem => i.id === 'node-0-0');
    expect(sizeAbove && sizeAbove.kind === 'text' && firstNode && sizeAbove.y < firstNode.cy).toBe(
      true,
    );
  });

  test('labels widen the spacing between layers when needed', async () => {
    const narrow = await layout('3-3');
    const wide = await layout(
      'layers:\n  - { units: 3, name: A very long layer name here }\n  - { units: 3, name: Another long layer name }',
    );
    expect(wide.scene.width).toBeGreaterThan(narrow.scene.width + 100);
  });

  test('describes the network for screen readers', async () => {
    const { scene } = await layout('layers:\n  - { units: 1, name: In }\n  - 16\n  - 10');
    expect(scene.title).toBe('Neural network diagram');
    expect(scene.description).toBe(
      'Fully connected neural network with 3 layers: In (1 neuron), Hidden (16 neurons), Output (10 neurons).',
    );
  });

  test('huge layers are force-collapsed and dense pairs are bundled, with warnings', async () => {
    const forced = await layout('layers:\n  - { units: 2000, collapse: false }\n  - 3');
    expect(forced.diagnostics.map((d) => d.code)).toEqual(['layout.forced-collapse']);
    expect(nodeIds(forced.scene, 0)).toHaveLength(6);

    const bundled = await layout(
      'layers:\n  - { units: 60, collapse: false }\n  - { units: 60, collapse: false }',
    );
    expect(bundled.diagnostics.map((d) => d.code)).toEqual(['layout.edges-bundled']);
    expect(bundled.scene.items.filter((i) => i.kind === 'line')).toHaveLength(0);
    expect(bundled.scene.items.some((i) => i.id === 'bundle-0')).toBe(true);
  });

  test('is deterministic', async () => {
    const a = await layout('784-16-16-10');
    const b = await layout('784-16-16-10');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

#!/usr/bin/env node
// Thin command-line wrapper over @xematics/core: renders shorthand, YAML or JSON input to SVG,
// PNG, PDF, TikZ or model JSON.

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { parseArgs } from 'node:util';
import {
  formatDiagnostic,
  hasErrors,
  layoutModel,
  parseModel,
  prepareModel,
  renderPdf,
  renderScene,
  renderTikz,
  setPngDpi,
  toJsonText,
  type Scene,
} from '@xematics/core';
import { createNodeTextEngine } from '@xematics/core/node';

const FORMATS = ['svg', 'png', 'pdf', 'tex', 'json'] as const;
type Format = (typeof FORMATS)[number];

const USAGE = `Usage: xematics render <file|-> [options]

Renders a diagram written as shorthand (784-16-16-10), YAML or JSON.
Use - to read from standard input.

Options:
  -o, --out <file>       Write to a file instead of standard output; the extension
                         (.svg, .png, .pdf, .tex, .json) picks the format
  -f, --format <name>    svg (default), png, pdf, tex (TikZ) or json (model)
      --text <mode>      SVG text: outline (default) or live (fonts embedded)
      --prefix <text>    SVG prefix for element ids and classes (default: xm-)
      --dpi <number>     PNG resolution (default: 300)
      --tikz <form>      standalone (default) or picture (tikzpicture only)
  -h, --help             Show this help
`;

async function readInput(path: string): Promise<string> {
  if (path !== '-') return readFile(path, 'utf8');
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

class UsageError extends Error {}

function pickFormat(format: string | undefined, out: string | undefined): Format {
  const chosen = format ?? (out ? extname(out).slice(1).toLowerCase() : '') ?? 'svg';
  const name = chosen === '' ? 'svg' : chosen === 'tikz' ? 'tex' : chosen;
  if (!(FORMATS as readonly string[]).includes(name)) {
    throw new UsageError(
      format
        ? `--format must be one of: ${FORMATS.join(', ')}.`
        : `Unknown output extension '.${chosen}'. Use --format or one of: ${FORMATS.map((f) => `.${f}`).join(', ')}.`,
    );
  }
  return name as Format;
}

async function png(scene: Scene, dpi: number, engine: Parameters<typeof renderScene>[1]) {
  const require = createRequire(import.meta.url);
  const { Resvg, initWasm } = await import('@resvg/resvg-wasm');
  await initWasm(await readFile(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
  // Outlined text, so the rasterizer needs no fonts.
  const svg = await renderScene(scene, engine);
  const image = new Resvg(svg, { fitTo: { mode: 'zoom', value: dpi / 96 } }).render();
  return setPngDpi(image.asPng(), dpi);
}

export async function main(argv: readonly string[]): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        out: { type: 'string', short: 'o' },
        format: { type: 'string', short: 'f' },
        text: { type: 'string' },
        prefix: { type: 'string' },
        dpi: { type: 'string' },
        tikz: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = args;
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const [command, input] = positionals;
  if (command !== 'render' || input === undefined || positionals.length > 2) {
    process.stderr.write(USAGE);
    return 2;
  }

  let format: Format;
  try {
    format = pickFormat(values.format, values.out);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 2;
  }
  const text = values.text ?? 'outline';
  if (text !== 'outline' && text !== 'live') {
    process.stderr.write('--text must be outline or live.\n');
    return 2;
  }
  const dpi = values.dpi === undefined ? 300 : Number(values.dpi);
  if (!Number.isFinite(dpi) || dpi < 10 || dpi > 2400) {
    process.stderr.write('--dpi must be a number from 10 to 2400.\n');
    return 2;
  }
  const tikz = values.tikz ?? 'standalone';
  if (tikz !== 'standalone' && tikz !== 'picture') {
    process.stderr.write('--tikz must be standalone or picture.\n');
    return 2;
  }
  if (format === 'png' && !values.out && process.stdout.isTTY) {
    process.stderr.write('PNG output is binary: use --out file.png or redirect standard output.\n');
    return 2;
  }

  try {
    const source = await readInput(input);
    const name = input === '-' ? 'stdin' : input;
    const parsed = parseModel(source);
    for (const d of parsed.diagnostics) process.stderr.write(`${formatDiagnostic(d, name)}\n`);
    if (!parsed.model || hasErrors(parsed.diagnostics)) return 1;

    let output: string | Uint8Array;
    if (format === 'json') {
      output = toJsonText(parsed.model);
    } else {
      const engine = await createNodeTextEngine();
      await prepareModel(parsed.model, engine);
      const layout = layoutModel(parsed.model, engine);
      for (const d of layout.diagnostics) process.stderr.write(`${formatDiagnostic(d, name)}\n`);
      if (format === 'svg') {
        output = await renderScene(layout.scene, engine, {
          text,
          ...(values.prefix === undefined ? {} : { prefix: values.prefix }),
        });
      } else if (format === 'pdf') output = renderPdf(layout.scene);
      else if (format === 'tex')
        output = renderTikz(layout.scene, { standalone: tikz === 'standalone' });
      else output = await png(layout.scene, dpi, engine);
    }
    if (values.out) await writeFile(values.out, output);
    else process.stdout.write(output);
    return 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 2;
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));

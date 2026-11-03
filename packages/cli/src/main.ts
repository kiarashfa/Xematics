#!/usr/bin/env node
// Thin command-line wrapper over @xematics/core: renders shorthand, YAML or JSON input to SVG.

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { formatDiagnostic, hasErrors, renderDiagram, type RenderOptions } from '@xematics/core';
import { createNodeTextEngine } from '@xematics/core/node';

const USAGE = `Usage: xematics render <file|-> [options]

Renders a diagram written as shorthand (784-16-16-10), YAML or JSON to SVG.
Use - to read from standard input.

Options:
  -o, --out <file>     Write the SVG to a file instead of standard output
      --text <mode>    outline (default) or live
      --prefix <text>  Prefix for element ids and classes (default: xm-)
  -h, --help           Show this help
`;

async function readInput(path: string): Promise<string> {
  if (path !== '-') return readFile(path, 'utf8');
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export async function main(argv: readonly string[]): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        out: { type: 'string', short: 'o' },
        text: { type: 'string' },
        prefix: { type: 'string' },
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
  const text = values.text ?? 'outline';
  if (text !== 'outline' && text !== 'live') {
    process.stderr.write('--text must be outline or live.\n');
    return 2;
  }
  const options: RenderOptions =
    values.prefix === undefined ? { text } : { text, prefix: values.prefix };

  try {
    const source = await readInput(input);
    const result = await renderDiagram(source, await createNodeTextEngine(), options);
    const name = input === '-' ? 'stdin' : input;
    for (const d of result.diagnostics) process.stderr.write(`${formatDiagnostic(d, name)}\n`);
    if (hasErrors(result.diagnostics) || result.svg === undefined) return 1;
    if (values.out) await writeFile(values.out, result.svg, 'utf8');
    else process.stdout.write(result.svg);
    return 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 2;
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));

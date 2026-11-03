import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

function run(args: string[], input?: string) {
  const result = spawnSync(process.execPath, [MAIN, ...args], { input, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('xematics CLI', () => {
  test('renders shorthand from stdin to SVG', () => {
    const { code, stdout, stderr } = run(['render', '-'], '784-16-16-10');
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(stdout.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(stdout).toContain('id="xm-node-0-783"');
  });

  test('supports live text and a custom prefix', () => {
    const { code, stdout } = run(['render', '-', '--text', 'live', '--prefix', 'fig-'], '3-2');
    expect(code).toBe(0);
    expect(stdout).toContain('<text id="fig-name-0"');
  });

  test('reports input errors with positions and exit code 1', () => {
    const { code, stderr } = run(['render', '-'], '784-16x');
    expect(code).toBe(1);
    expect(stderr).toBe(
      "stdin:1:7: error: Unexpected 'x' after 16. Put a colon before an activation, like 16:relu.\n",
    );
  });

  test('usage errors exit with code 2', () => {
    expect(run([]).code).toBe(2);
    expect(run(['render', '-', '--text', 'bold'], '3').code).toBe(2);
    expect(run(['render', '-', '--prefix', '1bad'], '3').code).toBe(2);
    expect(run(['--help']).code).toBe(0);
    expect(run(['render', '-', '-o', 'x.gif'], '3').code).toBe(2);
    expect(run(['render', '-', '--dpi', 'lots'], '3').code).toBe(2);
  });

  test('picks the format from the output extension or --format', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xematics-'));
    try {
      expect(run(['render', '-', '-o', join(dir, 'a.pdf')], '3-2').code).toBe(0);
      expect(readFileSync(join(dir, 'a.pdf'), 'latin1').startsWith('%PDF-1.4')).toBe(true);

      expect(run(['render', '-', '-o', join(dir, 'a.png'), '--dpi', '192'], '3-2').code).toBe(0);
      const png = readFileSync(join(dir, 'a.png'));
      expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
      // 192 dpi is twice the SVG's 96 px per inch; the figure is 191.07 px wide.
      expect(png.readUInt32BE(16)).toBe(382);
      expect(png.includes(Buffer.from('pHYs'))).toBe(true);

      const tex = run(['render', '-', '-f', 'tex', '--tikz', 'picture'], '3-2');
      expect(tex.code).toBe(0);
      expect(tex.stdout).toContain('\\begin{tikzpicture}');
      expect(tex.stdout).not.toContain('\\documentclass');

      const json = run(['render', '-', '-f', 'json'], '3-2:softmax');
      expect(JSON.parse(json.stdout)).toMatchObject({ version: 1, layers: [{ units: 3 }, {}] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

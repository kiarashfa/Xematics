import { spawnSync } from 'node:child_process';
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
  });
});

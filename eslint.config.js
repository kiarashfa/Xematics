import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.astro/**',
      '.internal/**',
      'coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  svelte.configs.recommended,
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.svelte'] },
    },
  },
  {
    files: ['apps/web/src/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/**', 'packages/cli/**', '**/*.config.*', '**/test/**', '**/e2e/**'],
    languageOptions: { globals: globals.node },
  },
  {
    // TypeScript already reports undefined names (and knows DOM types); see typescript-eslint docs.
    files: ['**/*.ts', '**/*.svelte', '**/*.astro'],
    rules: { 'no-undef': 'off' },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
);

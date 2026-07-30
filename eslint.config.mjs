import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.config.js',
      'apps/api/prisma/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/api/src/**/*.ts'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        Express: 'readonly',
        URL: 'readonly',
        process: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        console: 'readonly',
      },
    },
  },
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
    },
    languageOptions: {
      globals: {
        AbortController: 'readonly',
        Error: 'readonly',
        FormData: 'readonly',
        Promise: 'readonly',
        Record: 'readonly',
        RequestInit: 'readonly',
        URLSearchParams: 'readonly',
        Array: 'readonly',
        JSON: 'readonly',
        Object: 'readonly',
        fetch: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
    },
  },
);

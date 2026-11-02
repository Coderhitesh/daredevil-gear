import js from '@eslint/js';
import globals from 'globals';
import nextPlugin from '@next/eslint-plugin-next';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { '@next/next': nextPlugin, react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      // admin thumbnails are small user uploads; next/image adds nothing here
      '@next/next/no-img-element': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^(_|React)$' }],
    },
  },
  { files: ['*.config.js', 'postcss.config.js', 'tailwind.config.js'], languageOptions: { sourceType: 'commonjs' } },
];

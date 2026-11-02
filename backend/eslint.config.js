'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'warn',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  { files: ['tests/**/*.js'], languageOptions: { globals: { ...globals.jest } }, rules: { 'no-console': 'off' } },
  { ignores: ['node_modules/**', '.outbox/**', 'coverage/**'] },
];

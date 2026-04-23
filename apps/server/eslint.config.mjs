import { config } from '@aimo-note/eslint-config/base.js';
import globals from 'globals';

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];

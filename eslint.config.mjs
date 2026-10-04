// Flat config (ESM). Adds ignores, Node + Vitest globals, and TS-friendly rule tweaks.

import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import importPlugin from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import sonarjs from 'eslint-plugin-sonarjs';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
    {
        ignores: ['api/**', 'dist/**'],
    },

    js.configs.recommended,
    sonarjs.configs.recommended,

    // Project TS/JS sources
    {
        files: ['**/*.{ts,tsx,js}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            import: importPlugin,
        },
        settings: {
            // Without these, import-x silently skips TS imports and rules like no-cycle never fire.
            // Resolve imports the way tsc does (.ts extensions, tsconfig paths)...
            'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
            // ...and parse resolved .ts files when following the import graph.
            'import-x/extensions': ['.ts', '.tsx', '.js'],
            'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
        },
        rules: {
            // Turn off rules TypeScript handles (prevents NodeJS / type-only false positives)
            'no-undef': 'off',
            ...tsPlugin.configs['recommended-type-checked'].rules,
            // report an error if any circular dependency is found
            'import/no-cycle': ['error', { maxDepth: Infinity }],
            'no-useless-escape': 'off',
            '@typescript-eslint/no-inferrable-types': 'error',
            '@typescript-eslint/explicit-module-boundary-types': 'error',
        },
    },

    // Test + test support
    {
        files: [
            '**/*.test.{ts,tsx,js}',
            '**/*.spec.{ts,tsx,js}',
            '**/__tests__/**/*.{ts,tsx,js}',
            'src/testHelpers.ts',
        ],
        plugins: {
            vitest,
        },
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.vitest,
            },
        },
        rules: {
            ...vitest.configs.recommended.rules,
            'vitest/prefer-to-have-length': 'error',
            // Vitest variant allows passing unbound methods to expect(); base rule must be off for it to apply
            '@typescript-eslint/unbound-method': 'off',
            'vitest/unbound-method': 'error',
        },
    },

    // Prettier compatibility
    prettier,
];

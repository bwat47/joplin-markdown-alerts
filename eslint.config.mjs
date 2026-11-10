// Flat config (ESM). Adds ignores, Node + Vitest globals, and TS-friendly rule tweaks.

import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importPlugin from 'eslint-plugin-import-x';
import sonarjs from 'eslint-plugin-sonarjs';
import tsdoc from 'eslint-plugin-tsdoc';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
    {
        ignores: ['api/**', 'dist/**', '.api-staging-*/**', '.prettierrc.js'],
    },

    js.configs.recommended,
    sonarjs.configs.recommended,

    // Project TS/JS sources
    {
        files: ['**/*.{ts,tsx,js}'],
        // Sets the TS parser and plugin, and disables core rules that TypeScript already checks
        extends: [tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                ...globals.node,
            },
        },
        plugins: {
            'import-x': importPlugin,
            tsdoc,
        },
        settings: {
            // Without these, import-x silently skips TS imports and rules like no-cycle never fire.
            // Resolve imports the way tsc does (.ts extensions, tsconfig paths)...
            'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
            // ...and follow resolved .ts files when walking the import graph (parsed with the
            // languageOptions parser set by typescript-eslint, so no import-x/parsers entry is needed).
            'import-x/extensions': ['.ts', '.tsx', '.js'],
        },
        rules: {
            // report an error if any circular dependency is found
            'import-x/no-cycle': ['error', { maxDepth: Infinity }],
            'import-x/no-self-import': 'error',
            // Merge duplicate imports using inline `type` specifiers, matching consistent-type-imports below
            'import-x/no-duplicates': ['error', { 'prefer-inline': true }],
            '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
            '@typescript-eslint/consistent-type-exports': ['error', { fixMixedExportsWithInlineTypeSpecifier: true }],
            // Use `import type { A }` rather than `import { type A }` when every specifier is a type
            '@typescript-eslint/no-import-type-side-effects': 'error',
            '@typescript-eslint/no-inferrable-types': 'error',
            '@typescript-eslint/no-unnecessary-condition': [
                'error',
                { allowConstantLoopConditions: 'only-allowed-literals' },
            ],
            '@typescript-eslint/explicit-module-boundary-types': 'error',
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'tsdoc/syntax': 'error',
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
        extends: [vitest.configs.recommended],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.vitest,
            },
        },
        rules: {
            'vitest/prefer-to-have-length': 'error',
            // Vitest variant allows passing unbound methods to expect(); base rule must be off for it to apply
            '@typescript-eslint/unbound-method': 'off',
            'vitest/unbound-method': 'error',
        },
    },

    // Prettier compatibility
    prettier,
]);

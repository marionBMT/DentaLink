import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Data-loading effects (calling an async load function inside
      // useEffect) and "reset page 1 when the search term changes" are
      // standard React patterns. The upstream rule is overly strict for
      // those cases, so we downgrade it to a warning rather than restructuring
      // working, tested UI code.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: { globals: globals.node },
  },
])

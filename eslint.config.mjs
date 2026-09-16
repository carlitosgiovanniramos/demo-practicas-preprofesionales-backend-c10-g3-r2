import js from '@eslint/js'
import sonarjs from 'eslint-plugin-sonarjs'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', '.jscpd', 'prisma'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Feeds Yura's technical-debt index: the reusable workflow tariffs these
  // violations per rule over the PR's new lines only.
  sonarjs.configs.recommended,
  {
    rules: {
      complexity: ['warn', 10],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
)

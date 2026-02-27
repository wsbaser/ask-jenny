import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'ui',
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/hooks/use-jira*.test.ts'],
    // Use node environment for simple unit tests
    // Tests that need DOM/jsdom should be in a separate config with jsdom installed
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['shared/**/*.test.ts', 'scripts/**/*.test.ts', 'web/**/*.test.{ts,tsx}', 'functions/**/*.test.ts'],
          setupFiles: ['web/test-setup.ts'],
          exclude: ['**/*.emu.test.ts', '**/node_modules/**'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'emu',
          include: ['**/*.emu.test.ts'],
          exclude: ['**/node_modules/**'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integ',
          include: ['test/integ-tests/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          globalSetup: ['test/integ-tests/global-setup.ts'],
        },
      },
    ],
  },
});

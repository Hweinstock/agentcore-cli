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
          include: ['integ-tests/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          globalSetup: ['integ-tests/global-setup.ts'],
        },
      },
    ],
  },
});

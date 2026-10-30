import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
    env: {
      DATABASE_URL: 'file:./test.db',
      GOOGLE_FAKE: '1',
      TZ: 'UTC',
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});

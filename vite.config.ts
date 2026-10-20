import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works both locally and under GitHub Pages (/node-wars/).
  base: './',
  build: {
    chunkSizeWarningLimit: 2000, // Phaser is large; that's expected.
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

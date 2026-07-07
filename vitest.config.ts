import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit-test harness (blueprint 11.1). Node environment (the modules under test are pure server logic).
// The `@/` alias mirrors tsconfig so tests import the same way app code does.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});

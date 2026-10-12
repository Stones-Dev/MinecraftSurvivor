import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tools/balance_probe.ts'], environment: 'node' },
});

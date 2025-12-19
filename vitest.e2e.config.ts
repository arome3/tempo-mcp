/**
 * Vitest Configuration for E2E Tests
 *
 * Separate configuration for end-to-end tests against the real Tempo testnet.
 * Uses longer timeouts and only includes E2E test files.
 *
 * Usage:
 *   npm run test:e2e          # Read-only tests
 *   npm run test:e2e:write    # All tests including write operations
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use global test APIs (describe, it, expect)
    globals: true,

    // Node environment for blockchain operations
    environment: 'node',

    // Only include E2E tests
    include: ['tests/e2e/**/*.test.ts'],

    // Longer timeouts for blockchain operations
    testTimeout: 120000, // 2 minutes per test
    hookTimeout: 60000, // 1 minute for setup/teardown

    // Run tests sequentially to avoid nonce conflicts
    sequence: {
      concurrent: false,
    },

    // Retry failed tests once (blockchain can be flaky)
    retry: 1,

    // More verbose output for E2E debugging
    reporters: ['verbose'],

    // Don't watch in E2E mode (run once and exit)
    watch: false,
  },
});

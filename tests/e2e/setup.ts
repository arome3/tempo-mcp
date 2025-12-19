/**
 * E2E Test Setup and Configuration
 *
 * Provides configuration and helpers for end-to-end tests against the real
 * Tempo testnet. Tests are divided into:
 * - Read-only: Safe, no funds needed, always run when TEMPO_PRIVATE_KEY is set
 * - Write: Requires testnet funds, skipped by default, run with E2E_WRITE=true
 *
 * @example
 * ```bash
 * # Run read-only E2E tests
 * npm run test:e2e
 *
 * # Run ALL E2E tests including write operations
 * npm run test:e2e:write
 * ```
 */

import { config } from 'dotenv';
import { type Address, type Hash } from 'viem';

// Load .env configuration (real credentials, not mocked)
config();

// =============================================================================
// E2E Configuration
// =============================================================================

/**
 * E2E test configuration.
 *
 * - skipIfNoKey: Skip all E2E tests if no private key is set
 * - skipWriteTests: Skip write tests unless E2E_WRITE=true
 * - timeout: Default timeout for blockchain operations (60s)
 */
export const E2E_CONFIG = {
  // Skip all E2E tests if no private key configured
  skipIfNoKey: !process.env.TEMPO_PRIVATE_KEY,

  // Skip write tests unless explicitly enabled with E2E_WRITE=true
  skipWriteTests: process.env.E2E_WRITE !== 'true',

  // Timeouts for blockchain operations
  timeout: 60000, // 60 seconds for most operations
  longTimeout: 120000, // 2 minutes for slow operations

  // Network configuration
  network: {
    rpcUrl: process.env.TEMPO_RPC_URL || 'https://rpc.testnet.tempo.xyz',
    chainId: parseInt(process.env.TEMPO_CHAIN_ID || '42429', 10),
    explorerUrl: process.env.TEMPO_EXPLORER_URL || 'https://explore.tempo.xyz',
  },

  // ==========================================================================
  // User-Provided Test Data
  // ==========================================================================
  // Replace these with real testnet values before running tests

  // Known transaction hash for verification (replace with your tx)
  knownTxHash: (process.env.E2E_KNOWN_TX_HASH ||
    '0x0000000000000000000000000000000000000000000000000000000000000000') as Hash,

  // Token addresses for testing
  tokens: {
    alphaUSD: '0x20c0000000000000000000000000000000000001' as Address,
    betaUSD: '0x20c0000000000000000000000000000000000002' as Address,
    thetaUSD: '0x20c0000000000000000000000000000000000003' as Address,
  },

  // Default token for testing (alias for backwards compatibility)
  knownTokenAddress:
    '0x20c0000000000000000000000000000000000001' as Address, // AlphaUSD

  // Test recipient for write operations (replace with your test address)
  testRecipient: (process.env.E2E_TEST_RECIPIENT ||
    '0x0000000000000000000000000000000000000001') as Address,

  // Small amounts for write tests (to minimize fund usage)
  testAmounts: {
    small: '0.01', // 0.01 tokens - for basic transfers
    medium: '1.00', // 1 token - for swap tests
  },
};

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Wrapper for read-only E2E test suites.
 *
 * Tests will be skipped if TEMPO_PRIVATE_KEY is not set.
 * These tests are safe and don't consume any funds.
 *
 * @example
 * ```typescript
 * describeE2E('E2E: Balance Queries', () => {
 *   it('should get balance', async () => {
 *     // test code
 *   }, E2E_CONFIG.timeout);
 * });
 * ```
 */
export function describeE2E(name: string, fn: () => void): void {
  if (E2E_CONFIG.skipIfNoKey) {
    describe.skip(`${name} (skipped: no TEMPO_PRIVATE_KEY)`, fn);
  } else {
    describe(name, fn);
  }
}

/**
 * Wrapper for write E2E test suites.
 *
 * Tests will be skipped unless:
 * 1. TEMPO_PRIVATE_KEY is set
 * 2. E2E_WRITE=true is set
 *
 * These tests consume testnet funds and should be run explicitly.
 *
 * @example
 * ```typescript
 * describeE2EWrite('E2E: Token Transfers', () => {
 *   it('should send payment', async () => {
 *     // test code that sends tokens
 *   }, E2E_CONFIG.timeout);
 * });
 * ```
 */
export function describeE2EWrite(name: string, fn: () => void): void {
  const skip = E2E_CONFIG.skipIfNoKey || E2E_CONFIG.skipWriteTests;

  if (E2E_CONFIG.skipIfNoKey) {
    describe.skip(`${name} (skipped: no TEMPO_PRIVATE_KEY)`, fn);
  } else if (E2E_CONFIG.skipWriteTests) {
    describe.skip(`${name} (skipped: E2E_WRITE not set)`, fn);
  } else {
    describe(name, fn);
  }
}

/**
 * Check if E2E tests should run.
 * Useful for conditional setup in beforeAll/afterAll.
 */
export function shouldRunE2E(): boolean {
  return !E2E_CONFIG.skipIfNoKey;
}

/**
 * Check if write E2E tests should run.
 */
export function shouldRunE2EWrite(): boolean {
  return !E2E_CONFIG.skipIfNoKey && !E2E_CONFIG.skipWriteTests;
}

/**
 * Wait for a specified number of milliseconds.
 * Useful for waiting between blockchain operations.
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff.
 * Useful for blockchain operations that may take time to propagate.
 *
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param initialDelay - Initial delay in ms (default: 1000)
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt);
        await wait(delay);
      }
    }
  }

  throw lastError;
}

// =============================================================================
// Test Data Validators
// =============================================================================

/**
 * Check if knownTxHash is configured (not the placeholder).
 */
export function hasKnownTxHash(): boolean {
  return (
    E2E_CONFIG.knownTxHash !==
    '0x0000000000000000000000000000000000000000000000000000000000000000'
  );
}

/**
 * Check if testRecipient is configured (not the placeholder).
 */
export function hasTestRecipient(): boolean {
  return (
    E2E_CONFIG.testRecipient !==
    '0x0000000000000000000000000000000000000001'
  );
}

// =============================================================================
// Console Output Helpers
// =============================================================================

/**
 * Log E2E test status at the start of the test run.
 */
export function logE2EStatus(): void {
  console.log('\n========================================');
  console.log('E2E Test Configuration');
  console.log('========================================');
  console.log(`Private Key:    ${E2E_CONFIG.skipIfNoKey ? 'NOT SET (tests skipped)' : 'SET'}`);
  console.log(`Write Tests:    ${E2E_CONFIG.skipWriteTests ? 'DISABLED (use E2E_WRITE=true)' : 'ENABLED'}`);
  console.log(`Network:        ${E2E_CONFIG.network.rpcUrl}`);
  console.log(`Chain ID:       ${E2E_CONFIG.network.chainId}`);
  console.log(`Known TX Hash:  ${hasKnownTxHash() ? 'SET' : 'NOT SET (some tests skipped)'}`);
  console.log(`Test Recipient: ${hasTestRecipient() ? 'SET' : 'NOT SET (write tests use default)'}`);
  console.log('========================================\n');
}

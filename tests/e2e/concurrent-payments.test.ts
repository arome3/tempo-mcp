/**
 * E2E Tests: Concurrent Payments
 *
 * Tests concurrent transaction execution against the real Tempo testnet.
 * These tests CONSUME FUNDS - they are skipped by default.
 *
 * Prerequisites:
 * - TEMPO_PRIVATE_KEY set in .env
 * - Wallet has testnet AlphaUSD balance (at least 1 token)
 * - E2E_WRITE=true environment variable
 *
 * Run with:
 *   npm run test:e2e:write
 *   # or
 *   E2E_WRITE=true npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Address, type Hash, parseUnits, formatUnits } from 'viem';

import {
  describeE2EWrite,
  describeE2E,
  E2E_CONFIG,
  shouldRunE2EWrite,
  shouldRunE2E,
  logE2EStatus,
  wait,
  retryWithBackoff,
} from './setup.js';

// =============================================================================
// Dynamic Imports
// =============================================================================

let getTempoClient: typeof import('../../src/services/tempo-client.js').getTempoClient;
let getConcurrentService: typeof import('../../src/services/concurrent-service.js').getConcurrentService;
let loadConfig: typeof import('../../src/config/index.js').loadConfig;

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  initialBalance: bigint;
  transactionHashes: Hash[];
  baseNonceKey: number;
}

const state: TestState = {
  initialBalance: 0n,
  transactionHashes: [],
  baseNonceKey: 50, // Will be set dynamically in beforeAll
};

// =============================================================================
// Read-Only Tests (Nonce Queries)
// =============================================================================

describeE2E('E2E: Concurrent Payments - Read Operations', () => {
  beforeAll(async () => {
    logE2EStatus();

    if (!shouldRunE2E()) {
      return;
    }

    // Dynamically import modules
    const configModule = await import('../../src/config/index.js');
    const concurrentModule = await import('../../src/services/concurrent-service.js');

    loadConfig = configModule.loadConfig;
    getConcurrentService = concurrentModule.getConcurrentService;

    // Load configuration
    loadConfig();
  });

  // ===========================================================================
  // Nonce Key Queries
  // ===========================================================================

  describe('Nonce Key Queries', () => {
    it('should get nonce for key 0', async () => {
      const service = getConcurrentService();

      const nonce = await service.getNonceForKey(0);

      expect(typeof nonce).toBe('bigint');
      expect(nonce).toBeGreaterThanOrEqual(0n);
      console.log(`  Nonce for key 0: ${nonce}`);
    }, E2E_CONFIG.timeout);

    it('should get nonce for multiple keys', async () => {
      const service = getConcurrentService();

      const keys = [0, 1, 10, 100, 255];
      const nonces = await Promise.all(keys.map((k) => service.getNonceForKey(k)));

      console.log('  Nonces:');
      for (let i = 0; i < keys.length; i++) {
        expect(typeof nonces[i]).toBe('bigint');
        console.log(`    Key ${keys[i]}: ${nonces[i]}`);
      }
    }, E2E_CONFIG.timeout);

    it('should list active nonce keys (may be rate limited)', async () => {
      const service = getConcurrentService();

      try {
        // This queries all 256 keys and may hit rate limits
        // Use retry with backoff to handle transient rate limiting
        const activeKeys = await retryWithBackoff(
          () => service.listActiveNonceKeys(),
          2, // Only 2 retries since this is expensive
          2000 // Start with 2 second delay
        );

        expect(Array.isArray(activeKeys)).toBe(true);
        console.log(`  Active nonce keys: ${activeKeys.length}`);

        if (activeKeys.length > 0) {
          console.log('  First 5 active keys:');
          for (const keyInfo of activeKeys.slice(0, 5)) {
            console.log(`    Key ${keyInfo.key}: nonce=${keyInfo.nonce}`);
          }
        }
      } catch (error) {
        // Rate limiting is expected for this heavy operation
        if ((error as Error).message.includes('rate limit')) {
          console.log('  Skipped: Rate limited by RPC (expected for 256 queries)');
          return; // Pass the test - rate limiting is expected
        }
        throw error;
      }
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Validation Tests
  // ===========================================================================

  describe('Validation', () => {
    it('should reject invalid nonce key (negative)', async () => {
      const service = getConcurrentService();

      await expect(service.getNonceForKey(-1)).rejects.toThrow(
        /Nonce key must be between 0 and 255/
      );
    }, E2E_CONFIG.timeout);

    it('should reject invalid nonce key (> 255)', async () => {
      const service = getConcurrentService();

      await expect(service.getNonceForKey(256)).rejects.toThrow(
        /Nonce key must be between 0 and 255/
      );
    }, E2E_CONFIG.timeout);
  });
});

// =============================================================================
// Write Tests (Concurrent Payments)
// =============================================================================

describeE2EWrite('E2E: Concurrent Payments - Write Operations', () => {
  beforeAll(async () => {
    logE2EStatus();

    if (!shouldRunE2EWrite()) {
      return;
    }

    // Dynamically import modules
    const tempoClientModule = await import('../../src/services/tempo-client.js');
    const concurrentModule = await import('../../src/services/concurrent-service.js');
    const configModule = await import('../../src/config/index.js');

    getTempoClient = tempoClientModule.getTempoClient;
    getConcurrentService = concurrentModule.getConcurrentService;
    loadConfig = configModule.loadConfig;

    // Load configuration
    loadConfig();

    // Generate unique base nonceKey for this test run to avoid conflicts with previous runs
    // Uses timestamp modulo 200 to leave room for multiple tests (each uses up to ~5 keys)
    // Add 30 to avoid low nonceKeys that might have been used heavily
    state.baseNonceKey = 30 + (Math.floor(Date.now() / 1000) % 200);
    console.log(`\n  Using base nonceKey: ${state.baseNonceKey} (unique per run)`);

    // Record initial balance for verification
    const client = getTempoClient();
    state.initialBalance = await client.getBalance(E2E_CONFIG.knownTokenAddress);

    console.log(`  Initial Balance: ${formatUnits(state.initialBalance, 6)} AlphaUSD`);

    // Verify we have enough balance for tests
    const minBalance = parseUnits('0.5', 6); // 0.5 AlphaUSD minimum
    if (state.initialBalance < minBalance) {
      throw new Error(
        `Insufficient balance for concurrent payment tests. Have: ${formatUnits(state.initialBalance, 6)}, Need: 0.5 AlphaUSD minimum`
      );
    }
  });

  afterAll(() => {
    if (state.transactionHashes.length > 0) {
      console.log('\n  Transaction Hashes:');
      for (const hash of state.transactionHashes) {
        console.log(`    ${E2E_CONFIG.network.explorerUrl}/tx/${hash}`);
      }
    }
  });

  // ===========================================================================
  // Basic Concurrent Payments
  // ===========================================================================

  describe('Concurrent Payment Execution', () => {
    it('should send 2 payments concurrently', async () => {
      const service = getConcurrentService();
      const amount = parseUnits(E2E_CONFIG.testAmounts.small, 6);

      console.log(`  Sending 2 concurrent payments of ${E2E_CONFIG.testAmounts.small} each...`);

      // Wait a bit before starting to avoid rate limits from previous tests
      await wait(2000);

      try {
        const startTime = Date.now();
        // Note: No retryWithBackoff for concurrent transactions
        // Retrying with same nonceKeys doesn't work if original txs are pending
        const result = await service.sendConcurrentPayments(
          [
            {
              token: E2E_CONFIG.knownTokenAddress,
              to: E2E_CONFIG.testRecipient,
              amount,
              tokenSymbol: 'AlphaUSD',
            },
            {
              token: E2E_CONFIG.knownTokenAddress,
              to: E2E_CONFIG.testRecipient,
              amount,
              tokenSymbol: 'AlphaUSD',
            },
          ],
          state.baseNonceKey, // Start at dynamic nonceKey (unique per run)
          false // Don't wait for confirmation - testnet can be slow
        );
        const duration = Date.now() - startTime;

        console.log(`  Duration: ${duration}ms`);
        console.log(`  Total Payments: ${result.totalPayments}`);
        console.log(`  Submitted: ${result.results.filter(r => r.hash).length}`);
        console.log(`  Failed: ${result.failedPayments}`);

        // Log individual results for debugging
        for (const txResult of result.results) {
          console.log(`  TX nonceKey=${txResult.nonceKey}: status=${txResult.status}, hash=${txResult.hash ?? 'none'}`);
          if (txResult.error) {
            console.log(`    Error: ${txResult.error}`);
          }
        }

        // Verify all transactions were submitted (have hashes)
        // Note: We don't wait for confirmation as testnet can be slow
        const submittedCount = result.results.filter(r => r.hash).length;
        expect(submittedCount).toBe(2);
        expect(result.totalPayments).toBe(2);
        expect(result.failedPayments).toBe(0);

        // Verify nonce keys (dynamic based on state.baseNonceKey)
        expect(result.results[0].nonceKey).toBe(state.baseNonceKey);
        expect(result.results[1].nonceKey).toBe(state.baseNonceKey + 1);

        // Store transaction hashes
        for (const txResult of result.results) {
          if (txResult.hash) {
            state.transactionHashes.push(txResult.hash);
            console.log(`  TX ${txResult.nonceKey}: ${txResult.hash}`);
          }
        }
      } catch (error) {
        if ((error as Error).message.includes('rate limit')) {
          console.log('  Skipped: Rate limited by RPC');
          return;
        }
        throw error;
      }
    }, E2E_CONFIG.longTimeout);

    it('should send payments with memos', async () => {
      const service = getConcurrentService();
      const { stringToHex, pad } = await import('viem');
      const amount = parseUnits(E2E_CONFIG.testAmounts.small, 6);

      const memo1 = pad(stringToHex('E2E-CONCURRENT-1'), { size: 32 });
      const memo2 = pad(stringToHex('E2E-CONCURRENT-2'), { size: 32 });

      console.log('  Sending 2 payments with memos...');

      // Wait to avoid rate limits
      await wait(3000);

      try {
        // Note: No retryWithBackoff for concurrent transactions
        const result = await service.sendConcurrentPayments(
          [
            {
              token: E2E_CONFIG.knownTokenAddress,
              to: E2E_CONFIG.testRecipient,
              amount,
              memo: memo1,
              tokenSymbol: 'AlphaUSD',
            },
            {
              token: E2E_CONFIG.knownTokenAddress,
              to: E2E_CONFIG.testRecipient,
              amount,
              memo: memo2,
              tokenSymbol: 'AlphaUSD',
            },
          ],
          state.baseNonceKey + 10, // Offset by 10 from base to avoid conflicts
          false // Don't wait for confirmation - testnet can be slow
        );

        // Verify all transactions were submitted (have hashes)
        const submittedCount = result.results.filter(r => r.hash).length;
        expect(submittedCount).toBe(2);
        expect(result.failedPayments).toBe(0);

        console.log(`  Submitted: ${submittedCount}/${result.totalPayments}`);

        for (const txResult of result.results) {
          if (txResult.hash) {
            state.transactionHashes.push(txResult.hash);
          }
        }
      } catch (error) {
        if ((error as Error).message.includes('rate limit')) {
          console.log('  Skipped: Rate limited by RPC');
          return;
        }
        throw error;
      }
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Performance Comparison
  // ===========================================================================

  describe('Performance', () => {
    it('should demonstrate parallel execution speed', async () => {
      const service = getConcurrentService();
      const amount = parseUnits('0.001', 6); // Very small amount

      console.log('  Sending 3 payments concurrently...');

      // Wait to avoid rate limits
      await wait(3000);

      try {
        const startTime = Date.now();
        // Note: No retryWithBackoff for concurrent transactions
        const result = await service.sendConcurrentPayments(
          Array.from({ length: 3 }, (_, i) => ({
            token: E2E_CONFIG.knownTokenAddress,
            to: E2E_CONFIG.testRecipient,
            amount,
            tokenSymbol: 'AlphaUSD',
          })),
          state.baseNonceKey + 20, // Offset by 20 from base to avoid conflicts
          false // Don't wait for confirmation - testnet can be slow
        );
        const duration = Date.now() - startTime;

        console.log(`  Submission Duration: ${duration}ms`);
        console.log(`  Average per payment: ${Math.round(duration / 3)}ms`);
        console.log(`  (Sequential submission would be similar, but confirmation waiting is eliminated)`);

        // Verify all transactions were submitted (have hashes)
        const submittedCount = result.results.filter(r => r.hash).length;
        expect(submittedCount).toBe(3);
        expect(result.totalPayments).toBe(3);
        expect(result.failedPayments).toBe(0);

        // With submission-only, the speed advantage is in not waiting for confirmations
        console.log(`  All 3 payments submitted in parallel - no sequential confirmation waiting`);

        for (const txResult of result.results) {
          if (txResult.hash) {
            state.transactionHashes.push(txResult.hash);
          }
        }
      } catch (error) {
        if ((error as Error).message.includes('rate limit')) {
          console.log('  Skipped: Rate limited by RPC');
          return;
        }
        throw error;
      }
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('Error Handling', () => {
    it('should reject payments exceeding nonce key range', async () => {
      const service = getConcurrentService();
      const amount = parseUnits('0.001', 6);

      // Try to send 10 payments starting at key 250 (only 6 keys available)
      await expect(
        service.sendConcurrentPayments(
          Array.from({ length: 10 }, () => ({
            token: E2E_CONFIG.knownTokenAddress,
            to: E2E_CONFIG.testRecipient,
            amount,
          })),
          250, // Only 6 keys available (250-255)
          true
        )
      ).rejects.toThrow(/Cannot send 10 payments starting at key 250/);
    }, E2E_CONFIG.timeout);

    it('should reject invalid start nonce key', async () => {
      const service = getConcurrentService();
      const amount = parseUnits('0.001', 6);

      await expect(
        service.sendConcurrentPayments(
          [
            {
              token: E2E_CONFIG.knownTokenAddress,
              to: E2E_CONFIG.testRecipient,
              amount,
            },
            {
              token: E2E_CONFIG.knownTokenAddress,
              to: E2E_CONFIG.testRecipient,
              amount,
            },
          ],
          256, // Invalid key
          true
        )
      ).rejects.toThrow(/Start nonce key must be between 0 and 255/);
    }, E2E_CONFIG.timeout);
  });
});

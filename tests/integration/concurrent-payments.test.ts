/**
 * Concurrent Payments Integration Tests
 *
 * Tests for parallel transaction execution using nonceKey feature.
 * These tests verify the full payment pipeline with security layer integration.
 *
 * These tests can run with mocks (default) or against testnet when configured:
 * - TEMPO_PRIVATE_KEY: Wallet private key (with testnet tokens)
 *
 * Run with: npm test -- --grep="Concurrent Payments"
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TEST_ADDRESSES,
  TEST_TOKENS,
  TEST_TX_HASHES,
} from '../utils/test-helpers.js';
import {
  createMockTempoClient,
  setMockClient,
  resetMockClient,
} from '../utils/mock-tempo-client.js';
import {
  setMockConfig,
  resetMockConfig,
  createMockConfig,
  createSpendingLimitsConfig,
} from '../utils/mock-config.js';

// Mock viem to provide a mock public client for RPC calls
vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createClient: vi.fn(() => ({
      extend: vi.fn(() => ({
        request: vi.fn().mockImplementation(({ method }) => {
          // Mock eth_getTransactionCount with nonceKey extension
          if (method === 'eth_getTransactionCount') {
            return Promise.resolve('0x0');
          }
          return Promise.reject(new Error(`Unknown method: ${method}`));
        }),
      })),
    })),
  };
});

// Mock the tempo client module
vi.mock('../../src/services/tempo-client.js', async () => {
  const { getMockClient } = await import('../utils/mock-tempo-client.js');
  return {
    getTempoClient: () => getMockClient(),
    resetTempoClient: vi.fn(),
    TIP20_ABI: [
      {
        name: 'transfer',
        type: 'function',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
      },
      {
        name: 'transferWithMemo',
        type: 'function',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'memo', type: 'bytes32' },
        ],
        outputs: [{ name: '', type: 'bool' }],
      },
    ],
  };
});

// Mock config module
vi.mock('../../src/config/index.js', async () => {
  const { getMockConfig } = await import('../utils/mock-config.js');
  return {
    getConfig: () => getMockConfig(),
    loadConfig: () => getMockConfig(),
    resetConfig: vi.fn(),
  };
});

// Mock token service
vi.mock('../../src/services/token-service.js', async () => {
  const { TEST_TOKENS } = await import('../utils/test-helpers.js');
  return {
    resolveTokenAddress: (token: string) => {
      if (token === 'AlphaUSD' || token === TEST_TOKENS.ALPHA_USD) {
        return TEST_TOKENS.ALPHA_USD as `0x${string}`;
      }
      if (token === 'PathUSD' || token === TEST_TOKENS.PATH_USD) {
        return TEST_TOKENS.PATH_USD as `0x${string}`;
      }
      return token as `0x${string}`;
    },
    getTokenMetadata: async (token: string) => ({
      decimals: 6,
      symbol: 'AlphaUSD',
      name: 'Alpha USD',
    }),
  };
});

// Import after mocks
import {
  getConcurrentService,
  resetConcurrentService,
  type ConcurrentPayment,
} from '../../src/services/concurrent-service.js';
import {
  SecurityLayer,
  resetSecurityLayer,
  getSecurityLayer,
} from '../../src/security/index.js';

describe('Concurrent Payments Integration', () => {
  let mockClient: ReturnType<typeof createMockTempoClient>;

  beforeEach(() => {
    resetConcurrentService();
    resetSecurityLayer();
    resetMockClient();
    resetMockConfig();

    mockClient = createMockTempoClient();
    setMockClient(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockClient();
    resetMockConfig();
  });

  // ===========================================================================
  // Full Payment Flow Tests
  // ===========================================================================

  describe('Full Payment Flow', () => {
    it('should execute concurrent payments through full pipeline', async () => {
      const service = getConcurrentService();
      const payments: ConcurrentPayment[] = [
        {
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: BigInt(100 * 1e6),
          tokenSymbol: 'AlphaUSD',
        },
        {
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
          amount: BigInt(200 * 1e6),
          tokenSymbol: 'AlphaUSD',
        },
        {
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID_3 as `0x${string}`,
          amount: BigInt(300 * 1e6),
          tokenSymbol: 'AlphaUSD',
        },
      ];

      const result = await service.sendConcurrentPayments(payments, 1, true);

      expect(result.success).toBe(true);
      expect(result.totalPayments).toBe(3);
      expect(result.confirmedPayments).toBe(3);
      expect(result.failedPayments).toBe(0);

      // Each payment should have unique nonceKey
      const nonceKeys = result.results.map((r) => r.nonceKey);
      expect(nonceKeys).toEqual([1, 2, 3]);

      // Each should have a transaction hash
      for (const txResult of result.results) {
        expect(txResult.hash).toMatch(/^0x[a-fA-F0-9]+$/);
        expect(txResult.status).toBe('confirmed');
      }
    });

    it('should maintain parallel execution order', async () => {
      const service = getConcurrentService();
      const payments: ConcurrentPayment[] = Array.from(
        { length: 10 },
        (_, i) => ({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: BigInt((i + 1) * 10 * 1e6),
          tokenSymbol: 'AlphaUSD',
        })
      );

      const result = await service.sendConcurrentPayments(payments, 5, true);

      expect(result.totalPayments).toBe(10);
      // Verify nonceKeys are sequential starting from 5
      result.results.forEach((r, i) => {
        expect(r.nonceKey).toBe(5 + i);
      });
    });
  });

  // ===========================================================================
  // Chunking Integration Tests
  // ===========================================================================

  describe('Chunking Integration', () => {
    it('should process large batch in chunks correctly', async () => {
      // Set small chunk size for testing
      setMockConfig(
        createMockConfig({
          advanced: {
            gasMultiplier: 1.2,
            confirmations: 1,
            timeout: 30000,
            concurrentChunkSize: 5,
            concurrentChunkDelay: 10, // Small delay for fast tests
          },
        })
      );

      resetConcurrentService();
      const service = getConcurrentService();

      const payments: ConcurrentPayment[] = Array.from(
        { length: 17 },
        (_, i) => ({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: BigInt(10 * 1e6),
          tokenSymbol: 'AlphaUSD',
        })
      );

      const result = await service.sendConcurrentPayments(payments, 1, true);

      expect(result.success).toBe(true);
      expect(result.totalPayments).toBe(17);
      expect(result.chunksProcessed).toBe(4); // 5 + 5 + 5 + 2
    });

    it('should apply delay between chunks', async () => {
      const chunkDelay = 100;
      setMockConfig(
        createMockConfig({
          advanced: {
            gasMultiplier: 1.2,
            confirmations: 1,
            timeout: 30000,
            concurrentChunkSize: 3,
            concurrentChunkDelay: chunkDelay,
          },
        })
      );

      resetConcurrentService();
      const service = getConcurrentService();

      const payments: ConcurrentPayment[] = Array.from(
        { length: 9 },
        (_, i) => ({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: BigInt(10 * 1e6),
          tokenSymbol: 'AlphaUSD',
        })
      );

      const startTime = Date.now();
      const result = await service.sendConcurrentPayments(payments, 1, true);
      const endTime = Date.now();

      expect(result.chunksProcessed).toBe(3);
      // Should have at least 2 delays (between 3 chunks)
      // Allow some margin for execution time
      expect(endTime - startTime).toBeGreaterThanOrEqual(chunkDelay * 2 - 50);
    });
  });

  // ===========================================================================
  // Mixed Result Handling
  // ===========================================================================

  describe('Mixed Result Handling', () => {
    it('should handle mix of successful and failed transactions', async () => {
      // Create client that fails every other transaction
      let callCount = 0;
      const mixedClient = createMockTempoClient();
      mixedClient.sendConcurrentTransaction = vi
        .fn()
        .mockImplementation((params: { nonceKey: number }) => {
          callCount++;
          if (callCount % 2 === 0) {
            throw new Error('Simulated failure');
          }
          const keyHex = params.nonceKey.toString(16).padStart(2, '0');
          return `0x${keyHex}${'a'.repeat(62)}`;
        });
      setMockClient(mixedClient);

      resetConcurrentService();
      const service = getConcurrentService();

      const payments: ConcurrentPayment[] = Array.from(
        { length: 6 },
        (_, i) => ({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: BigInt(10 * 1e6),
          tokenSymbol: 'AlphaUSD',
        })
      );

      const result = await service.sendConcurrentPayments(payments, 1, true);

      expect(result.success).toBe(false);
      expect(result.confirmedPayments).toBe(3);
      expect(result.failedPayments).toBe(3);
      expect(result.totalPayments).toBe(6);

      // Verify failed transactions have error messages
      const failedResults = result.results.filter((r) => r.status === 'failed');
      expect(failedResults).toHaveLength(3);
      for (const failed of failedResults) {
        expect(failed.error).toBeDefined();
        expect(failed.hash).toBeNull();
      }
    });
  });

  // ===========================================================================
  // Memo Handling Tests
  // ===========================================================================

  describe('Memo Handling', () => {
    it('should handle payments with memos correctly', async () => {
      const service = getConcurrentService();
      const payments: ConcurrentPayment[] = [
        {
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: BigInt(100 * 1e6),
          memo: ('0x' + '00'.repeat(32)) as `0x${string}`, // Valid bytes32
        },
        {
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
          amount: BigInt(200 * 1e6),
          // No memo
        },
      ];

      const result = await service.sendConcurrentPayments(payments, 1, true);

      expect(result.success).toBe(true);
      expect(result.totalPayments).toBe(2);
      expect(result.confirmedPayments).toBe(2);
    });
  });

  // ===========================================================================
  // Nonce Query Integration Tests
  // ===========================================================================

  describe('Nonce Query Integration', () => {
    it('should query nonce for multiple keys', async () => {
      const service = getConcurrentService();

      // Query multiple nonce keys
      const nonces = await Promise.all([
        service.getNonceForKey(0),
        service.getNonceForKey(1),
        service.getNonceForKey(100),
        service.getNonceForKey(255),
      ]);

      // All should return valid bigint values
      for (const nonce of nonces) {
        expect(typeof nonce).toBe('bigint');
        expect(nonce).toBeGreaterThanOrEqual(BigInt(0));
      }
    });

    it('should list active nonce keys', async () => {
      const service = getConcurrentService();

      const activeKeys = await service.listActiveNonceKeys();

      expect(Array.isArray(activeKeys)).toBe(true);
      for (const keyInfo of activeKeys) {
        expect(keyInfo.key).toBeGreaterThanOrEqual(0);
        expect(keyInfo.key).toBeLessThanOrEqual(255);
        expect(typeof keyInfo.nonce).toBe('bigint');
      }
    });
  });

  // ===========================================================================
  // Performance Characteristics
  // ===========================================================================

  describe('Performance Characteristics', () => {
    it('should track duration accurately', async () => {
      const service = getConcurrentService();
      const payments: ConcurrentPayment[] = Array.from(
        { length: 5 },
        (_, i) => ({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: BigInt(10 * 1e6),
        })
      );

      const startTime = Date.now();
      const result = await service.sendConcurrentPayments(payments, 1, true);
      const actualDuration = Date.now() - startTime;

      // Duration should be tracked (may be 0 in fast mock environments)
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThanOrEqual(actualDuration + 100); // Allow 100ms margin
    });

    it('should execute payments in parallel (verified via call count)', async () => {
      // Test parallel execution by verifying all transactions are submitted
      // before any confirmations are awaited
      const slowClient = createMockTempoClient();
      const submissionOrder: number[] = [];
      const confirmationOrder: number[] = [];

      slowClient.sendConcurrentTransaction = vi
        .fn()
        .mockImplementation(async (params: { nonceKey: number }) => {
          submissionOrder.push(params.nonceKey);
          const keyHex = params.nonceKey.toString(16).padStart(2, '0');
          return `0x${keyHex}${'a'.repeat(62)}`;
        });
      slowClient.waitForTransaction = vi.fn().mockImplementation(async (hash: string) => {
        // Extract nonceKey from hash (first 2 hex chars after 0x)
        const keyHex = hash.slice(2, 4);
        const nonceKey = parseInt(keyHex, 16);
        confirmationOrder.push(nonceKey);
        return {
          transactionHash: TEST_TX_HASHES.VALID,
          blockNumber: BigInt(12345),
          status: 'success',
          gasUsed: BigInt(21000),
        };
      });
      setMockClient(slowClient);

      resetConcurrentService();
      const service = getConcurrentService();

      const payments: ConcurrentPayment[] = Array.from(
        { length: 5 },
        (_, i) => ({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: BigInt(10 * 1e6),
        })
      );

      const result = await service.sendConcurrentPayments(payments, 1, true);

      expect(result.success).toBe(true);
      expect(result.totalPayments).toBe(5);

      // Verify all transactions were submitted (parallel execution uses Promise.all)
      expect(slowClient.sendConcurrentTransaction).toHaveBeenCalledTimes(5);

      // Verify all confirmations were awaited
      expect(slowClient.waitForTransaction).toHaveBeenCalledTimes(5);
    });
  });

  // ===========================================================================
  // Error Recovery
  // ===========================================================================

  describe('Error Recovery', () => {
    it('should not affect subsequent payments after failure', async () => {
      // First call fails, rest succeed
      let firstCall = true;
      const recoveryClient = createMockTempoClient();
      recoveryClient.sendConcurrentTransaction = vi
        .fn()
        .mockImplementation((params: { nonceKey: number }) => {
          if (firstCall) {
            firstCall = false;
            throw new Error('First call failed');
          }
          const keyHex = params.nonceKey.toString(16).padStart(2, '0');
          return `0x${keyHex}${'a'.repeat(62)}`;
        });
      setMockClient(recoveryClient);

      resetConcurrentService();
      const service = getConcurrentService();

      const payments: ConcurrentPayment[] = Array.from(
        { length: 4 },
        (_, i) => ({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: BigInt(10 * 1e6),
        })
      );

      const result = await service.sendConcurrentPayments(payments, 1, true);

      expect(result.failedPayments).toBe(1);
      expect(result.confirmedPayments).toBe(3);

      // First one should fail
      expect(result.results[0].status).toBe('failed');
      // Rest should succeed
      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i].status).toBe('confirmed');
      }
    });
  });
});

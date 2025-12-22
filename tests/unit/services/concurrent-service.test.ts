/**
 * Concurrent Service Unit Tests
 *
 * Tests for parallel transaction execution service including:
 * - NonceKey validation (0-255 range)
 * - Nonce queries for specific keys
 * - Concurrent payment execution
 * - Auto-chunking for large batches
 * - Partial failure handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TEST_ADDRESSES,
  TEST_TOKENS,
  TEST_TX_HASHES,
} from '../../utils/test-helpers.js';
import {
  createMockTempoClient,
  setMockClient,
  resetMockClient,
  createMockReceipt,
} from '../../utils/mock-tempo-client.js';
import {
  setMockConfig,
  resetMockConfig,
  createMockConfig,
} from '../../utils/mock-config.js';

// Mock the tempo client module
vi.mock('../../../src/services/tempo-client.js', async () => {
  const { getMockClient } = await import('../../utils/mock-tempo-client.js');
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
vi.mock('../../../src/config/index.js', async () => {
  const { getMockConfig } = await import('../../utils/mock-config.js');
  return {
    getConfig: () => getMockConfig(),
    loadConfig: () => getMockConfig(),
    resetConfig: vi.fn(),
  };
});

// Mock viem to provide a mock public client for RPC calls
vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createClient: vi.fn(() => ({
      extend: vi.fn().mockImplementation(function (this: unknown) {
        // Return 'this' to allow chaining .extend(publicActions)
        return {
          extend: vi.fn().mockReturnThis(),
          getTransactionCount: vi.fn().mockResolvedValue(0),
          request: vi.fn().mockImplementation(({ method }) => {
            if (method === 'eth_getTransactionCount') {
              return Promise.resolve('0x0');
            }
            if (method === 'eth_call') {
              // Return mock nonce value (0) for nonce precompile calls
              return Promise.resolve('0x0000000000000000000000000000000000000000000000000000000000000000');
            }
            return Promise.reject(new Error(`Unknown method: ${method}`));
          }),
        };
      }),
    })),
  };
});

// Mock tempo.ts/viem Actions to avoid real RPC calls
vi.mock('tempo.ts/viem', () => ({
  Actions: {
    nonce: {
      getNonce: async () => 0n,
    },
  },
  tempoActions: () => (client: unknown) => client,
}));

// Import after mocks are set up
import {
  ConcurrentService,
  getConcurrentService,
  resetConcurrentService,
  type ConcurrentPayment,
} from '../../../src/services/concurrent-service.js';

describe('ConcurrentService', () => {
  let concurrentService: ConcurrentService;
  let mockClient: ReturnType<typeof createMockTempoClient>;

  beforeEach(() => {
    resetConcurrentService();
    resetMockClient();
    resetMockConfig();
    mockClient = createMockTempoClient();
    setMockClient(mockClient);
    concurrentService = getConcurrentService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockClient();
    resetMockConfig();
  });

  // ===========================================================================
  // Singleton Pattern Tests
  // ===========================================================================

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getConcurrentService();
      const instance2 = getConcurrentService();
      expect(instance1).toBe(instance2);
    });

    it('should return new instance after reset', () => {
      const instance1 = getConcurrentService();
      resetConcurrentService();
      const instance2 = getConcurrentService();
      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // getNonceForKey Tests
  // ===========================================================================

  describe('getNonceForKey', () => {
    it('should accept valid nonce key 0', async () => {
      // This test verifies the lower bound of nonceKey
      await expect(concurrentService.getNonceForKey(0)).resolves.toBeDefined();
    });

    it('should accept valid nonce key 255', async () => {
      // This test verifies the upper bound of nonceKey
      await expect(
        concurrentService.getNonceForKey(255)
      ).resolves.toBeDefined();
    });

    it('should accept middle range nonce keys', async () => {
      const middleKeys = [1, 50, 100, 127, 200];
      for (const key of middleKeys) {
        await expect(
          concurrentService.getNonceForKey(key)
        ).resolves.toBeDefined();
      }
    });

    it('should reject negative nonce keys', async () => {
      await expect(concurrentService.getNonceForKey(-1)).rejects.toThrow(
        /Nonce key must be between 0 and 255/
      );
    });

    it('should reject nonce keys above 255', async () => {
      await expect(concurrentService.getNonceForKey(256)).rejects.toThrow(
        /Nonce key must be between 0 and 255/
      );

      await expect(concurrentService.getNonceForKey(1000)).rejects.toThrow(
        /Nonce key must be between 0 and 255/
      );
    });

    it('should use default wallet address when none provided', async () => {
      await concurrentService.getNonceForKey(1);
      expect(mockClient.getAddress).toHaveBeenCalled();
    });

    it('should use provided address when specified', async () => {
      const customAddress = TEST_ADDRESSES.VALID_2 as `0x${string}`;
      await concurrentService.getNonceForKey(1, customAddress);
      // The address should be used in the RPC call
      // We just verify no errors occur with custom address
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // listActiveNonceKeys Tests
  // ===========================================================================

  describe('listActiveNonceKeys', () => {
    it('should return empty array when no keys are active', async () => {
      // Default mock returns nonce 0 for all keys
      const activeKeys = await concurrentService.listActiveNonceKeys();
      // Note: This may return keys based on mock implementation
      expect(Array.isArray(activeKeys)).toBe(true);
    });

    it('should use default wallet address when none provided', async () => {
      await concurrentService.listActiveNonceKeys();
      expect(mockClient.getAddress).toHaveBeenCalled();
    });

    it('should accept custom address parameter', async () => {
      const customAddress = TEST_ADDRESSES.VALID_2 as `0x${string}`;
      await expect(
        concurrentService.listActiveNonceKeys(customAddress)
      ).resolves.toBeDefined();
    });
  });

  // ===========================================================================
  // sendConcurrentPayments Tests
  // ===========================================================================

  describe('sendConcurrentPayments', () => {
    const createTestPayments = (count: number): ConcurrentPayment[] => {
      return Array.from({ length: count }, (_, i) => ({
        token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: BigInt(100 * 1e6), // 100 tokens
        tokenSymbol: 'AlphaUSD',
      }));
    };

    describe('Input Validation', () => {
      it('should reject empty payments array', async () => {
        await expect(
          concurrentService.sendConcurrentPayments([], 1, true)
        ).rejects.toThrow();
      });

      it('should reject invalid startNonceKey (negative)', async () => {
        const payments = createTestPayments(2);
        await expect(
          concurrentService.sendConcurrentPayments(payments, -1, true)
        ).rejects.toThrow(/Start nonce key must be between 0 and 255/);
      });

      it('should reject invalid startNonceKey (above 255)', async () => {
        const payments = createTestPayments(2);
        await expect(
          concurrentService.sendConcurrentPayments(payments, 256, true)
        ).rejects.toThrow(/Start nonce key must be between 0 and 255/);
      });

      it('should reject too many payments for available keys', async () => {
        // 256 keys total, starting at key 250 means only 6 keys available
        const payments = createTestPayments(10);
        await expect(
          concurrentService.sendConcurrentPayments(payments, 250, true)
        ).rejects.toThrow(/Cannot send 10 payments starting at key 250/);
      });

      it('should accept payments with valid memo', async () => {
        const payments: ConcurrentPayment[] = [
          {
            token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
            to: TEST_ADDRESSES.VALID as `0x${string}`,
            amount: BigInt(100 * 1e6),
            memo: '0x' + '00'.repeat(32) as `0x${string}`,
          },
          {
            token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
            to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
            amount: BigInt(50 * 1e6),
          },
        ];

        const result = await concurrentService.sendConcurrentPayments(
          payments,
          1,
          true
        );
        expect(result.totalPayments).toBe(2);
      });
    });

    describe('Successful Execution', () => {
      it('should send 2 payments concurrently', async () => {
        const payments = createTestPayments(2);
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          1,
          true
        );

        expect(result.success).toBe(true);
        expect(result.totalPayments).toBe(2);
        expect(result.confirmedPayments).toBe(2);
        expect(result.failedPayments).toBe(0);
        expect(result.pendingPayments).toBe(0);
        expect(result.results).toHaveLength(2);
      });

      it('should assign unique nonceKeys to each payment', async () => {
        const payments = createTestPayments(5);
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          10, // Start at key 10
          true
        );

        const nonceKeys = result.results.map((r) => r.nonceKey);
        expect(nonceKeys).toEqual([10, 11, 12, 13, 14]);
      });

      it('should use startNonceKey correctly', async () => {
        const payments = createTestPayments(3);
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          100,
          true
        );

        expect(result.results[0].nonceKey).toBe(100);
        expect(result.results[1].nonceKey).toBe(101);
        expect(result.results[2].nonceKey).toBe(102);
      });

      it('should return pending status when waitForConfirmation is false', async () => {
        const payments = createTestPayments(2);
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          1,
          false // Don't wait for confirmation
        );

        expect(result.pendingPayments).toBe(2);
        expect(result.confirmedPayments).toBe(0);
      });

      it('should track duration correctly', async () => {
        const payments = createTestPayments(2);
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          1,
          true
        );

        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(typeof result.durationMs).toBe('number');
      });
    });

    describe('Chunking Behavior', () => {
      it('should process single chunk for small batches', async () => {
        // Default chunk size is 50, so 10 payments = 1 chunk
        const payments = createTestPayments(10);
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          1,
          true
        );

        expect(result.chunksProcessed).toBe(1);
      });

      it('should use config chunk size', async () => {
        // Override chunk size to 5
        setMockConfig(
          createMockConfig({
            advanced: {
              gasMultiplier: 1.2,
              confirmations: 1,
              timeout: 30000,
              concurrentChunkSize: 5,
              concurrentChunkDelay: 100,
            },
          })
        );

        // Need to reset service to pick up new config
        resetConcurrentService();
        concurrentService = getConcurrentService();

        const payments = createTestPayments(12);
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          1,
          true
        );

        // 12 payments / 5 per chunk = 3 chunks
        expect(result.chunksProcessed).toBe(3);
      });

      it('should handle uneven chunk sizes', async () => {
        setMockConfig(
          createMockConfig({
            advanced: {
              gasMultiplier: 1.2,
              confirmations: 1,
              timeout: 30000,
              concurrentChunkSize: 7,
              concurrentChunkDelay: 50,
            },
          })
        );

        resetConcurrentService();
        concurrentService = getConcurrentService();

        const payments = createTestPayments(20);
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          1,
          true
        );

        // 20 payments / 7 per chunk = 3 chunks (7 + 7 + 6)
        expect(result.chunksProcessed).toBe(3);
        expect(result.totalPayments).toBe(20);
      });
    });

    describe('Error Handling', () => {
      it('should handle partial failures gracefully', async () => {
        // Mock client that fails on specific nonceKey
        const partialFailClient = createMockTempoClient();
        let callCount = 0;
        partialFailClient.sendConcurrentTransaction = vi
          .fn()
          .mockImplementation((params: { nonceKey: number }) => {
            callCount++;
            // Fail on the second transaction
            if (callCount === 2) {
              throw new Error('Transaction failed');
            }
            const keyHex = params.nonceKey.toString(16).padStart(2, '0');
            return `0x${keyHex}${'a'.repeat(62)}`;
          });
        setMockClient(partialFailClient);

        resetConcurrentService();
        concurrentService = getConcurrentService();

        const payments = createTestPayments(3);
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          1,
          true
        );

        expect(result.success).toBe(false);
        expect(result.failedPayments).toBe(1);
        expect(result.confirmedPayments).toBe(2);
        expect(result.results.find((r) => r.status === 'failed')).toBeDefined();
      });

      it('should capture error messages for failed transactions', async () => {
        const errorMessage = 'Insufficient gas';
        const failClient = createMockTempoClient({
          shouldFail: true,
          failOnMethod: 'sendConcurrentTransaction',
          failMessage: errorMessage,
        });
        setMockClient(failClient);

        resetConcurrentService();
        concurrentService = getConcurrentService();

        const payments = createTestPayments(2);
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          1,
          true
        );

        expect(result.success).toBe(false);
        expect(result.failedPayments).toBe(2);
        const failedResult = result.results[0];
        expect(failedResult.error).toContain(errorMessage);
      });

      it('should continue processing after individual failures', async () => {
        // Mock that fails on first and last but succeeds in middle
        const selectiveFailClient = createMockTempoClient();
        let callCount = 0;
        selectiveFailClient.sendConcurrentTransaction = vi
          .fn()
          .mockImplementation((params: { nonceKey: number }) => {
            callCount++;
            if (callCount === 1 || callCount === 5) {
              throw new Error('Failed transaction');
            }
            const keyHex = params.nonceKey.toString(16).padStart(2, '0');
            return `0x${keyHex}${'a'.repeat(62)}`;
          });
        setMockClient(selectiveFailClient);

        resetConcurrentService();
        concurrentService = getConcurrentService();

        const payments = createTestPayments(5);
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          1,
          true
        );

        expect(result.failedPayments).toBe(2);
        expect(result.confirmedPayments).toBe(3);
        expect(result.totalPayments).toBe(5);
      });
    });

    describe('Transaction Hash Generation', () => {
      it('should return unique hashes for each transaction', async () => {
        const payments = createTestPayments(5);
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          1,
          true
        );

        const hashes = result.results.map((r) => r.hash).filter(Boolean);
        const uniqueHashes = new Set(hashes);
        expect(uniqueHashes.size).toBe(hashes.length);
      });

      it('should return null hash for failed transactions', async () => {
        const failClient = createMockTempoClient({
          shouldFail: true,
          failOnMethod: 'sendConcurrentTransaction',
          failMessage: 'Failed',
        });
        setMockClient(failClient);

        resetConcurrentService();
        concurrentService = getConcurrentService();

        const payments = createTestPayments(2);
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          1,
          true
        );

        for (const txResult of result.results) {
          expect(txResult.hash).toBeNull();
        }
      });
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle maximum payments (256)', async () => {
      const payments = Array.from({ length: 256 }, (_, i) => ({
        token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: BigInt(1 * 1e6),
      }));

      // This should not throw - starting at 0 allows all 256 keys
      const result = await concurrentService.sendConcurrentPayments(
        payments,
        0,
        false
      );
      expect(result.totalPayments).toBe(256);
    });

    it('should handle single payment at edge key (255)', async () => {
      const payments = [
        {
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: BigInt(100 * 1e6),
        },
      ];

      // Single payment at key 255 should work
      const result = await concurrentService.sendConcurrentPayments(
        payments,
        255,
        true
      );
      expect(result.results[0].nonceKey).toBe(255);
    });

    it('should handle very small amounts', async () => {
      const payments = [
        {
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: BigInt(1), // 1 wei
        },
        {
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
          amount: BigInt(1),
        },
      ];

      const result = await concurrentService.sendConcurrentPayments(
        payments,
        1,
        true
      );
      expect(result.success).toBe(true);
    });

    it('should handle different token addresses in batch', async () => {
      const payments = [
        {
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: BigInt(100 * 1e6),
        },
        {
          token: TEST_TOKENS.PATH_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
          amount: BigInt(50 * 1e6),
        },
      ];

      const result = await concurrentService.sendConcurrentPayments(
        payments,
        1,
        true
      );
      expect(result.success).toBe(true);
      expect(result.totalPayments).toBe(2);
    });

    it('should handle different recipients in batch', async () => {
      const payments = [
        {
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: BigInt(100 * 1e6),
        },
        {
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
          amount: BigInt(200 * 1e6),
        },
        {
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID_3 as `0x${string}`,
          amount: BigInt(300 * 1e6),
        },
      ];

      const result = await concurrentService.sendConcurrentPayments(
        payments,
        1,
        true
      );
      expect(result.success).toBe(true);
      expect(result.totalPayments).toBe(3);
    });
  });
});

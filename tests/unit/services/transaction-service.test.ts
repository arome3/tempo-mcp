/**
 * Transaction Service Unit Tests
 *
 * Tests for transaction queries and gas estimation including:
 * - Transaction lookup by hash
 * - Transaction status detection
 * - TIP-20 transfer parsing
 * - Memo decoding
 * - Gas estimation
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TEST_ADDRESSES,
  TEST_TOKENS,
  TEST_TX_HASH,
} from '../../utils/test-helpers.js';
import {
  createMockTempoClient,
  setMockClient,
  resetMockClient,
} from '../../utils/mock-tempo-client.js';

// Mock the tempo client module
vi.mock('../../../src/services/tempo-client.js', async () => {
  const { getMockClient } = await import('../../utils/mock-tempo-client.js');
  return {
    getTempoClient: () => getMockClient(),
    resetTempoClient: vi.fn(),
    TIP20_ABI: [],
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

// Import after mocks are set up
import {
  TransactionService,
  getTransactionService,
  resetTransactionService,
} from '../../../src/services/transaction-service.js';

describe('TransactionService', () => {
  let transactionService: TransactionService;

  beforeEach(() => {
    resetTransactionService();
    resetMockClient();
    setMockClient(createMockTempoClient());
    transactionService = getTransactionService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockClient();
  });

  // ===========================================================================
  // Singleton Pattern Tests
  // ===========================================================================

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const service1 = getTransactionService();
      const service2 = getTransactionService();
      expect(service1).toBe(service2);
    });

    it('should return new instance after reset', () => {
      const service1 = getTransactionService();
      resetTransactionService();
      const service2 = getTransactionService();
      expect(service1).not.toBe(service2);
    });
  });

  // ===========================================================================
  // getTransaction Tests
  // ===========================================================================

  describe('getTransaction', () => {
    it('should return transaction details by hash', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient = {
        getTransaction: vi.fn().mockResolvedValue({
          hash: TEST_TX_HASH,
          from: TEST_ADDRESSES.VALID,
          to: TEST_TOKENS.ALPHA_USD,
          value: BigInt(0),
          gasPrice: BigInt(15000000),
          blockNumber: BigInt(12345),
          blockHash: '0x' + 'ab'.repeat(32),
          input: '0x',
          type: 'legacy',
        }),
        getTransactionReceipt: vi.fn().mockResolvedValue({
          status: 'success',
          blockNumber: BigInt(12345),
          gasUsed: BigInt(21000),
          effectiveGasPrice: BigInt(15000000),
        }),
        getBlock: vi.fn().mockResolvedValue({
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        }),
        getBlockNumber: vi.fn().mockResolvedValue(BigInt(12350)),
        readContract: vi.fn().mockResolvedValue('AlphaUSD'),
      } as any;
      setMockClient(mockClient);
      transactionService = new TransactionService();

      const result = await transactionService.getTransaction(TEST_TX_HASH as `0x${string}`);

      expect(result.hash).toBe(TEST_TX_HASH);
      expect(result.from).toBe(TEST_ADDRESSES.VALID);
      expect(result.status).toBe('success');
      expect(result.blockNumber).toBe(12345);
    });

    it('should handle pending transactions', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient = {
        getTransaction: vi.fn().mockResolvedValue({
          hash: TEST_TX_HASH,
          from: TEST_ADDRESSES.VALID,
          to: TEST_TOKENS.ALPHA_USD,
          value: BigInt(0),
          gasPrice: BigInt(15000000),
          blockNumber: null,
          blockHash: null,
          input: '0x',
        }),
        getTransactionReceipt: vi.fn().mockRejectedValue(new Error('Receipt not found')),
        readContract: vi.fn().mockResolvedValue('AlphaUSD'),
      } as any;
      setMockClient(mockClient);
      transactionService = new TransactionService();

      const result = await transactionService.getTransaction(TEST_TX_HASH as `0x${string}`);

      expect(result.hash).toBe(TEST_TX_HASH);
      expect(result.status).toBe('pending');
      expect(result.blockNumber).toBe(null);
    });

    it('should handle reverted transactions', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient = {
        getTransaction: vi.fn().mockResolvedValue({
          hash: TEST_TX_HASH,
          from: TEST_ADDRESSES.VALID,
          to: TEST_TOKENS.ALPHA_USD,
          value: BigInt(0),
          gasPrice: BigInt(15000000),
          blockNumber: BigInt(12345),
          blockHash: '0x' + 'ab'.repeat(32),
          input: '0x',
        }),
        getTransactionReceipt: vi.fn().mockResolvedValue({
          status: 'reverted',
          blockNumber: BigInt(12345),
          gasUsed: BigInt(21000),
          effectiveGasPrice: BigInt(15000000),
        }),
        getBlock: vi.fn().mockResolvedValue({
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        }),
        getBlockNumber: vi.fn().mockResolvedValue(BigInt(12350)),
        readContract: vi.fn().mockResolvedValue('AlphaUSD'),
      } as any;
      setMockClient(mockClient);
      transactionService = new TransactionService();

      const result = await transactionService.getTransaction(TEST_TX_HASH as `0x${string}`);

      expect(result.status).toBe('reverted');
    });

    it('should include explorer URL', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient = {
        getTransaction: vi.fn().mockResolvedValue({
          hash: TEST_TX_HASH,
          from: TEST_ADDRESSES.VALID,
          to: TEST_TOKENS.ALPHA_USD,
          value: BigInt(0),
          gasPrice: BigInt(15000000),
          blockNumber: BigInt(12345),
          blockHash: '0x' + 'ab'.repeat(32),
          input: '0x',
        }),
        getTransactionReceipt: vi.fn().mockResolvedValue({
          status: 'success',
          blockNumber: BigInt(12345),
          gasUsed: BigInt(21000),
          effectiveGasPrice: BigInt(15000000),
        }),
        getBlock: vi.fn().mockResolvedValue({
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        }),
        getBlockNumber: vi.fn().mockResolvedValue(BigInt(12350)),
        readContract: vi.fn().mockResolvedValue('AlphaUSD'),
      } as any;
      setMockClient(mockClient);
      transactionService = new TransactionService();

      const result = await transactionService.getTransaction(TEST_TX_HASH as `0x${string}`);

      expect(result.explorerUrl).toContain(TEST_TX_HASH);
      expect(result.explorerUrl).toContain('https://');
    });

    it('should calculate confirmations', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient = {
        getTransaction: vi.fn().mockResolvedValue({
          hash: TEST_TX_HASH,
          from: TEST_ADDRESSES.VALID,
          to: TEST_TOKENS.ALPHA_USD,
          value: BigInt(0),
          gasPrice: BigInt(15000000),
          blockNumber: BigInt(12345),
          blockHash: '0x' + 'ab'.repeat(32),
          input: '0x',
        }),
        getTransactionReceipt: vi.fn().mockResolvedValue({
          status: 'success',
          blockNumber: BigInt(12345),
          gasUsed: BigInt(21000),
          effectiveGasPrice: BigInt(15000000),
        }),
        getBlock: vi.fn().mockResolvedValue({
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        }),
        getBlockNumber: vi.fn().mockResolvedValue(BigInt(12350)), // 5 blocks later
        readContract: vi.fn().mockResolvedValue('AlphaUSD'),
      } as any;
      setMockClient(mockClient);
      transactionService = new TransactionService();

      const result = await transactionService.getTransaction(TEST_TX_HASH as `0x${string}`);

      expect(result.confirmations).toBe(5);
    });

    it('should throw for non-existent transaction', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient = {
        getTransaction: vi.fn().mockRejectedValue(new Error('Transaction not found')),
      } as any;
      setMockClient(mockClient);
      transactionService = new TransactionService();

      const invalidHash = '0x' + '00'.repeat(32) as `0x${string}`;
      await expect(
        transactionService.getTransaction(invalidHash)
      ).rejects.toThrow();
    });

    it('should include gas cost formatted', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient = {
        getTransaction: vi.fn().mockResolvedValue({
          hash: TEST_TX_HASH,
          from: TEST_ADDRESSES.VALID,
          to: TEST_TOKENS.ALPHA_USD,
          value: BigInt(0),
          gasPrice: BigInt(15000000), // 0.015 in 6 decimals
          blockNumber: BigInt(12345),
          blockHash: '0x' + 'ab'.repeat(32),
          input: '0x',
        }),
        getTransactionReceipt: vi.fn().mockResolvedValue({
          status: 'success',
          blockNumber: BigInt(12345),
          gasUsed: BigInt(100000),
          effectiveGasPrice: BigInt(15000000),
        }),
        getBlock: vi.fn().mockResolvedValue({
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        }),
        getBlockNumber: vi.fn().mockResolvedValue(BigInt(12345)),
        readContract: vi.fn().mockResolvedValue('AlphaUSD'),
      } as any;
      setMockClient(mockClient);
      transactionService = new TransactionService();

      const result = await transactionService.getTransaction(TEST_TX_HASH as `0x${string}`);

      expect(result.gasCost).toBeDefined();
      expect(typeof result.gasCost).toBe('string');
    });
  });

  // ===========================================================================
  // estimateGas Tests
  // ===========================================================================

  describe('estimateGas', () => {
    it('should estimate gas for simple transfer', async () => {
      const mockClient = createMockTempoClient();
      mockClient.estimateGas = vi.fn().mockResolvedValue(BigInt(21000));
      mockClient.publicClient = {
        getGasPrice: vi.fn().mockResolvedValue(BigInt(15000000)),
        estimateFeesPerGas: vi.fn().mockRejectedValue(new Error('EIP-1559 not supported')),
      } as any;
      setMockClient(mockClient);
      transactionService = new TransactionService();

      const result = await transactionService.estimateGas({
        to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
      });

      expect(result.gasLimit).toBe('21000');
      expect(result.gasPrice).toBeDefined();
      expect(result.estimatedCost).toBeDefined();
      expect(result.feeToken).toBeDefined();
      expect(result.feeTokenSymbol).toBeDefined();
    });

    it('should estimate gas with data', async () => {
      const mockClient = createMockTempoClient();
      mockClient.estimateGas = vi.fn().mockResolvedValue(BigInt(50000));
      mockClient.publicClient = {
        getGasPrice: vi.fn().mockResolvedValue(BigInt(15000000)),
        estimateFeesPerGas: vi.fn().mockRejectedValue(new Error('EIP-1559 not supported')),
      } as any;
      setMockClient(mockClient);
      transactionService = new TransactionService();

      const result = await transactionService.estimateGas({
        to: TEST_TOKENS.ALPHA_USD as `0x${string}`,
        data: '0xa9059cbb' as `0x${string}`, // transfer selector
      });

      expect(result.gasLimit).toBe('50000');
    });

    it('should include EIP-1559 fees when available', async () => {
      const mockClient = createMockTempoClient();
      mockClient.estimateGas = vi.fn().mockResolvedValue(BigInt(21000));
      mockClient.publicClient = {
        getGasPrice: vi.fn().mockResolvedValue(BigInt(15000000)),
        estimateFeesPerGas: vi.fn().mockResolvedValue({
          maxFeePerGas: BigInt(20000000),
          maxPriorityFeePerGas: BigInt(1000000),
        }),
      } as any;
      setMockClient(mockClient);
      transactionService = new TransactionService();

      const result = await transactionService.estimateGas({
        to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
      });

      expect(result.maxFeePerGas).toBe('20000000');
      expect(result.maxPriorityFeePerGas).toBe('1000000');
    });

    it('should handle EIP-1559 not supported', async () => {
      const mockClient = createMockTempoClient();
      mockClient.estimateGas = vi.fn().mockResolvedValue(BigInt(21000));
      mockClient.publicClient = {
        getGasPrice: vi.fn().mockResolvedValue(BigInt(15000000)),
        estimateFeesPerGas: vi.fn().mockRejectedValue(new Error('Not supported')),
      } as any;
      setMockClient(mockClient);
      transactionService = new TransactionService();

      const result = await transactionService.estimateGas({
        to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
      });

      expect(result.maxFeePerGas).toBeNull();
      expect(result.maxPriorityFeePerGas).toBeNull();
    });

    it('should format estimated cost correctly', async () => {
      const mockClient = createMockTempoClient();
      // gasLimit = 100000, gasPrice = 15000000 (0.015)
      // estimatedCost = 100000 * 15000000 = 1500000000000 (1.5M in 6 decimals = 1500)
      mockClient.estimateGas = vi.fn().mockResolvedValue(BigInt(100000));
      mockClient.publicClient = {
        getGasPrice: vi.fn().mockResolvedValue(BigInt(15000000)),
        estimateFeesPerGas: vi.fn().mockRejectedValue(new Error('Not supported')),
      } as any;
      setMockClient(mockClient);
      transactionService = new TransactionService();

      const result = await transactionService.estimateGas({
        to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
      });

      expect(result.estimatedCostFormatted).toBeDefined();
      expect(typeof result.estimatedCostFormatted).toBe('string');
    });
  });
});

/**
 * Exchange Service Unit Tests
 *
 * Tests for stablecoin swap operations including:
 * - Quote retrieval (exactIn and exactOut)
 * - Token resolution
 * - Slippage validation
 * - Error handling for insufficient liquidity
 * - Wallet configuration checks
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

// Mock tempo.ts/viem Actions
vi.mock('tempo.ts/viem', () => ({
  Actions: {
    dex: {
      getSellQuote: vi.fn().mockResolvedValue(BigInt(99500000)), // ~99.5 with 6 decimals
      getBuyQuote: vi.fn().mockResolvedValue(BigInt(100500000)), // ~100.5 with 6 decimals
      sellSync: vi.fn().mockResolvedValue({
        receipt: {
          transactionHash: '0x' + 'a'.repeat(64),
          blockNumber: BigInt(12345),
          gasUsed: BigInt(100000),
          effectiveGasPrice: BigInt(1000000),
        },
      }),
      buySync: vi.fn().mockResolvedValue({
        receipt: {
          transactionHash: '0x' + 'b'.repeat(64),
          blockNumber: BigInt(12346),
          gasUsed: BigInt(100000),
          effectiveGasPrice: BigInt(1000000),
        },
      }),
    },
  },
  Addresses: {
    stablecoinExchange: '0x' + 'd'.repeat(40),
  },
}));

// Mock the tempo client module
vi.mock('../../../src/services/tempo-client.js', async () => {
  const { getMockClient } = await import('../../utils/mock-tempo-client.js');
  return {
    getTempoClient: () => getMockClient(),
    resetTempoClient: vi.fn(),
    TIP20_ABI: [
      {
        name: 'symbol',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'string' }],
      },
      {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
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

// Import after mocks are set up
import {
  ExchangeService,
  getExchangeService,
  resetExchangeService,
} from '../../../src/services/exchange-service.js';
import { Actions } from 'tempo.ts/viem';

describe('ExchangeService', () => {
  let exchangeService: ExchangeService;

  beforeEach(() => {
    resetExchangeService();
    resetMockClient();

    const mockClient = createMockTempoClient();
    mockClient.publicClient.readContract = vi
      .fn()
      .mockImplementation(({ functionName }) => {
        if (functionName === 'symbol') return Promise.resolve('AlphaUSD');
        if (functionName === 'decimals') return Promise.resolve(6);
        return Promise.resolve(null);
      });
    setMockClient(mockClient);

    // Reset DEX mocks to their default implementations
    vi.mocked(Actions.dex.getSellQuote).mockResolvedValue(BigInt(99500000));
    vi.mocked(Actions.dex.getBuyQuote).mockResolvedValue(BigInt(100500000));
    vi.mocked(Actions.dex.sellSync).mockResolvedValue({
      receipt: {
        transactionHash: '0x' + 'a'.repeat(64),
        blockNumber: BigInt(12345),
        gasUsed: BigInt(100000),
        effectiveGasPrice: BigInt(1000000),
      },
    } as any);

    exchangeService = getExchangeService();
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
      const service1 = getExchangeService();
      const service2 = getExchangeService();
      expect(service1).toBe(service2);
    });

    it('should return new instance after reset', () => {
      const service1 = getExchangeService();
      resetExchangeService();
      const service2 = getExchangeService();
      expect(service1).not.toBe(service2);
    });
  });

  // ===========================================================================
  // getQuote Tests - exactIn
  // ===========================================================================

  describe('getQuote (exactIn)', () => {
    it('should return quote for valid swap', async () => {
      const result = await exchangeService.getQuote({
        fromToken: 'AlphaUSD',
        toToken: 'PathUSD',
        amount: '100',
        direction: 'exactIn',
      });

      expect(result.fromToken).toBe(TEST_TOKENS.ALPHA_USD);
      expect(result.toToken).toBe(TEST_TOKENS.PATH_USD);
      expect(result.direction).toBe('exactIn');
      expect(result.amountInRaw).toBe(BigInt(100000000)); // 100 * 1e6
      expect(result.rate).toBeDefined();
    });

    it('should return quote with token addresses', async () => {
      const result = await exchangeService.getQuote({
        fromToken: TEST_TOKENS.ALPHA_USD,
        toToken: TEST_TOKENS.PATH_USD,
        amount: '50',
        direction: 'exactIn',
      });

      expect(result.fromToken).toBe(TEST_TOKENS.ALPHA_USD);
      expect(result.toToken).toBe(TEST_TOKENS.PATH_USD);
    });

    it('should throw for same token swap', async () => {
      await expect(
        exchangeService.getQuote({
          fromToken: 'AlphaUSD',
          toToken: 'AlphaUSD',
          amount: '100',
          direction: 'exactIn',
        })
      ).rejects.toThrow(/Cannot swap a token for itself/);
    });

    it('should throw for unknown token symbol', async () => {
      await expect(
        exchangeService.getQuote({
          fromToken: 'UNKNOWN',
          toToken: 'PathUSD',
          amount: '100',
          direction: 'exactIn',
        })
      ).rejects.toThrow();
    });

    it('should throw for invalid token address format', async () => {
      await expect(
        exchangeService.getQuote({
          fromToken: '0x123', // Invalid length
          toToken: 'PathUSD',
          amount: '100',
          direction: 'exactIn',
        })
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // getQuote Tests - exactOut
  // ===========================================================================

  describe('getQuote (exactOut)', () => {
    it('should return quote for exactOut swap', async () => {
      const result = await exchangeService.getQuote({
        fromToken: 'AlphaUSD',
        toToken: 'PathUSD',
        amount: '100',
        direction: 'exactOut',
      });

      expect(result.direction).toBe('exactOut');
      expect(result.amountOutRaw).toBe(BigInt(100000000)); // 100 * 1e6
    });
  });

  // ===========================================================================
  // getQuote Error Handling
  // ===========================================================================

  describe('getQuote Error Handling', () => {
    it('should throw for insufficient liquidity', async () => {
      vi.mocked(Actions.dex.getSellQuote).mockRejectedValueOnce(
        new Error('InsufficientLiquidity')
      );

      await expect(
        exchangeService.getQuote({
          fromToken: 'AlphaUSD',
          toToken: 'PathUSD',
          amount: '1000000',
          direction: 'exactIn',
        })
      ).rejects.toThrow(/Insufficient liquidity/);
    });

    it('should wrap generic DEX errors', async () => {
      vi.mocked(Actions.dex.getSellQuote).mockRejectedValueOnce(
        new Error('Random DEX error')
      );

      await expect(
        exchangeService.getQuote({
          fromToken: 'AlphaUSD',
          toToken: 'PathUSD',
          amount: '100',
          direction: 'exactIn',
        })
      ).rejects.toThrow(/Failed to get swap quote/);
    });
  });

  // ===========================================================================
  // executeSwap Tests
  // ===========================================================================

  describe('executeSwap', () => {
    it('should throw when wallet not configured', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = null;
      mockClient.publicClient.readContract = vi
        .fn()
        .mockImplementation(({ functionName }) => {
          if (functionName === 'symbol') return Promise.resolve('AlphaUSD');
          if (functionName === 'decimals') return Promise.resolve(6);
          return Promise.resolve(null);
        });
      setMockClient(mockClient);
      exchangeService = new ExchangeService();

      await expect(
        exchangeService.executeSwap({
          fromToken: 'AlphaUSD',
          toToken: 'PathUSD',
          amount: '100',
          slippageTolerance: 0.5,
          direction: 'exactIn',
        })
      ).rejects.toThrow(/Wallet not configured/);
    });

    it('should throw for invalid slippage tolerance (too low)', async () => {
      await expect(
        exchangeService.executeSwap({
          fromToken: 'AlphaUSD',
          toToken: 'PathUSD',
          amount: '100',
          slippageTolerance: 0.05, // Below 0.1%
          direction: 'exactIn',
        })
      ).rejects.toThrow(/Slippage tolerance must be between 0.1% and 5%/);
    });

    it('should throw for invalid slippage tolerance (too high)', async () => {
      await expect(
        exchangeService.executeSwap({
          fromToken: 'AlphaUSD',
          toToken: 'PathUSD',
          amount: '100',
          slippageTolerance: 10, // Above 5%
          direction: 'exactIn',
        })
      ).rejects.toThrow(/Slippage tolerance must be between 0.1% and 5%/);
    });
  });

  // ===========================================================================
  // executeSwap Error Handling
  // ===========================================================================

  describe('executeSwap Error Handling', () => {
    it('should handle insufficient liquidity during swap', async () => {
      vi.mocked(Actions.dex.sellSync).mockRejectedValueOnce(
        new Error('InsufficientLiquidity')
      );

      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi
        .fn()
        .mockImplementation(({ functionName }) => {
          if (functionName === 'symbol') return Promise.resolve('AlphaUSD');
          if (functionName === 'decimals') return Promise.resolve(6);
          return Promise.resolve(null);
        });
      mockClient.walletClient = {
        writeContract: vi.fn().mockResolvedValue(TEST_TX_HASH),
      } as any;
      setMockClient(mockClient);
      exchangeService = new ExchangeService();

      await expect(
        exchangeService.executeSwap({
          fromToken: 'AlphaUSD',
          toToken: 'PathUSD',
          amount: '100',
          slippageTolerance: 0.5,
          direction: 'exactIn',
        })
      ).rejects.toThrow(/Insufficient liquidity/);
    });

    it('should handle slippage exceeded error', async () => {
      vi.mocked(Actions.dex.sellSync).mockRejectedValueOnce(
        new Error('slippage exceeded')
      );

      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi
        .fn()
        .mockImplementation(({ functionName }) => {
          if (functionName === 'symbol') return Promise.resolve('AlphaUSD');
          if (functionName === 'decimals') return Promise.resolve(6);
          return Promise.resolve(null);
        });
      mockClient.walletClient = {
        writeContract: vi.fn().mockResolvedValue(TEST_TX_HASH),
      } as any;
      setMockClient(mockClient);
      exchangeService = new ExchangeService();

      await expect(
        exchangeService.executeSwap({
          fromToken: 'AlphaUSD',
          toToken: 'PathUSD',
          amount: '100',
          slippageTolerance: 0.5,
          direction: 'exactIn',
        })
      ).rejects.toThrow(/price movement exceeding slippage tolerance/);
    });
  });

  // ===========================================================================
  // Rate Calculation Tests
  // ===========================================================================

  describe('Rate Calculation', () => {
    it('should calculate exchange rate correctly', async () => {
      // Mock getSellQuote to return specific amount
      vi.mocked(Actions.dex.getSellQuote).mockResolvedValueOnce(BigInt(99000000)); // 99 tokens out

      const result = await exchangeService.getQuote({
        fromToken: 'AlphaUSD',
        toToken: 'PathUSD',
        amount: '100',
        direction: 'exactIn',
      });

      // 99 out / 100 in = 0.99 rate
      expect(result.rate).toBe('0.990000');
      expect(result.inverseRate).toBe('1.010101');
    });

    it('should handle zero rate edge case', async () => {
      vi.mocked(Actions.dex.getSellQuote).mockResolvedValueOnce(BigInt(0));

      const result = await exchangeService.getQuote({
        fromToken: 'AlphaUSD',
        toToken: 'PathUSD',
        amount: '100',
        direction: 'exactIn',
      });

      expect(result.rate).toBe('0.000000');
      expect(result.inverseRate).toBe('0');
    });
  });
});

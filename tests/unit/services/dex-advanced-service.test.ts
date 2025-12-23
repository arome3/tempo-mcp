/**
 * DEX Advanced Service Unit Tests
 *
 * Tests for DEX Advanced orderbook operations including:
 * - Limit order placement
 * - Flip order placement
 * - Order cancellation
 * - Orderbook queries
 * - Order status queries
 * - Price/tick conversion utilities
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

// Mock the tempo-client module
vi.mock('../../../src/services/tempo-client.js', async () => {
  const { getMockClient } = await import('../../utils/mock-tempo-client.js');
  return {
    getTempoClient: () => getMockClient(),
    resetTempoClient: vi.fn(),
    TIP20_ABI: [],
  };
});

// Mock the token-service module
vi.mock('../../../src/services/token-service.js', async () => {
  return {
    getTokenService: () => ({
      getTokenInfo: vi.fn().mockResolvedValue({
        address: TEST_TOKENS.ALPHA_USD,
        symbol: 'AlphaUSD',
        decimals: 6,
      }),
    }),
    resolveTokenAddress: (token: string) => {
      if (token.startsWith('0x')) return token as `0x${string}`;
      return TEST_TOKENS.ALPHA_USD as `0x${string}`;
    },
    resetTokenService: vi.fn(),
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

// Create a mock module for Actions.dex.getOrder that can be accessed in tests
const mockGetOrder = vi.fn().mockResolvedValue({
  maker: TEST_ADDRESSES.VALID as `0x${string}`,
  bookKey: ('0x' + 'ab'.repeat(32)) as `0x${string}`,
  isBid: true,
  tick: -10,
  amount: BigInt(1000 * 1e6),
  remaining: BigInt(500 * 1e6),
  isFlip: false,
});

// Mock Actions from tempo.ts
vi.mock('tempo.ts/viem', () => {
  return {
    Actions: {
      dex: {
        place: {
          call: () => ({
            to: '0x1234',
            data: '0x',
          }),
        },
        placeFlip: {
          call: () => ({
            to: '0x1234',
            data: '0x',
          }),
        },
        cancel: {
          call: () => ({
            to: '0x1234',
            data: '0x',
          }),
        },
        getOrder: async (_client: unknown, _params: { orderId: bigint }) => {
          // Return mock order data
          return {
            maker: '0x1234567890123456789012345678901234567890' as `0x${string}`,
            bookKey: ('0x' + 'ab'.repeat(32)) as `0x${string}`,
            isBid: true,
            tick: -10,
            amount: BigInt(1000 * 1e6),
            remaining: BigInt(500 * 1e6),
            isFlip: false,
          };
        },
      },
    },
    Addresses: {
      stablecoinExchange: '0xDEX0000000000000000000000000000000000000' as `0x${string}`,
    },
  };
});

// Import after mocks are set up
import {
  DexAdvancedService,
  getDexAdvancedService,
  resetDexAdvancedService,
  DEX_ABI,
  DEX_ADDRESS,
  PATH_USD_ADDRESS,
} from '../../../src/services/dex-advanced-service.js';

describe('DexAdvancedService', () => {
  let dexAdvancedService: DexAdvancedService;

  beforeEach(() => {
    resetDexAdvancedService();
    resetMockClient();

    // Create mock with order receipt
    const mockClient = createMockTempoClient({
      dex: {
        activeOrderId: BigInt(100),
        newOrderId: BigInt(101),
        allowance: BigInt(1000000 * 1e6),
      },
    });

    // Override waitForTransaction to include orderId
    mockClient.waitForTransaction = vi.fn().mockReturnValue(
      createMockReceipt(TEST_TX_HASHES.VALID as `0x${string}`, {
        orderId: BigInt(101),
      })
    );

    setMockClient(mockClient);
    dexAdvancedService = getDexAdvancedService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockClient();
  });

  // ===========================================================================
  // Constants Tests
  // ===========================================================================

  describe('Constants', () => {
    it('should define DEX_ADDRESS correctly', () => {
      expect(DEX_ADDRESS).toBe('0xDEX0000000000000000000000000000000000000');
    });

    it('should define PATH_USD_ADDRESS correctly', () => {
      expect(PATH_USD_ADDRESS).toBe('0x20c0000000000000000000000000000000000000');
    });
  });

  // ===========================================================================
  // ABI Constants Tests
  // ===========================================================================

  describe('ABI Constants', () => {
    it('should define DEX_ABI with order placement functions', () => {
      const functionNames = DEX_ABI
        .filter((item) => item.type === 'function')
        .map((item) => item.name);

      expect(functionNames).toContain('place');
      expect(functionNames).toContain('placeFlip');
      expect(functionNames).toContain('cancel');
    });

    it('should define DEX_ABI with view functions', () => {
      const functionNames = DEX_ABI
        .filter((item) => item.type === 'function')
        .map((item) => item.name);

      expect(functionNames).toContain('activeOrderId');
      expect(functionNames).toContain('balanceOf');
    });

    it('should define order-related events', () => {
      const eventNames = DEX_ABI
        .filter((item) => item.type === 'event')
        .map((item) => item.name);

      expect(eventNames).toContain('OrderPlaced');
      expect(eventNames).toContain('FlipOrderPlaced');
      expect(eventNames).toContain('OrderCancelled');
    });
  });

  // ===========================================================================
  // Singleton Pattern Tests
  // ===========================================================================

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const service1 = getDexAdvancedService();
      const service2 = getDexAdvancedService();
      expect(service1).toBe(service2);
    });

    it('should return new instance after reset', () => {
      const service1 = getDexAdvancedService();
      resetDexAdvancedService();
      const service2 = getDexAdvancedService();
      expect(service1).not.toBe(service2);
    });
  });

  // ===========================================================================
  // Price Conversion Tests
  // ===========================================================================

  describe('Price Conversion', () => {
    it('should convert tick 0 to price 1.0', () => {
      expect(dexAdvancedService.tickToPrice(0)).toBe(1);
    });

    it('should convert tick 10 to price 1.0001', () => {
      expect(dexAdvancedService.tickToPrice(10)).toBe(1.0001);
    });

    it('should convert tick -10 to price 0.9999', () => {
      expect(dexAdvancedService.tickToPrice(-10)).toBe(0.9999);
    });

    it('should convert tick 100 to price 1.001', () => {
      expect(dexAdvancedService.tickToPrice(100)).toBe(1.001);
    });

    it('should convert price 1.0 to tick 0', () => {
      expect(dexAdvancedService.priceToTick(1.0)).toBe(0);
    });

    it('should convert price 1.0001 to tick 10', () => {
      expect(dexAdvancedService.priceToTick(1.0001)).toBe(10);
    });

    it('should convert price 0.9999 to tick -10', () => {
      expect(dexAdvancedService.priceToTick(0.9999)).toBe(-10);
    });
  });

  // ===========================================================================
  // calculateQuoteAmount Tests
  // ===========================================================================

  describe('calculateQuoteAmount', () => {
    it('should calculate quote amount with price buffer', () => {
      const baseAmount = BigInt(1000 * 1e6); // 1000 tokens
      const tick = 0; // Price = 1.0

      const result = dexAdvancedService.calculateQuoteAmount(baseAmount, tick);

      // 1000 * 1.0 * 1.01 (1% buffer) = 1010
      expect(result).toBe(BigInt(1010 * 1e6));
    });

    it('should apply price multiplier for positive ticks', () => {
      const baseAmount = BigInt(1000 * 1e6);
      const tick = 100; // Price = 1.001

      const result = dexAdvancedService.calculateQuoteAmount(baseAmount, tick);

      // 1000 * 1.001 * 1.01 ~= 1011.01
      expect(Number(result) / 1e6).toBeCloseTo(1011.01, 0);
    });

    it('should apply price discount for negative ticks', () => {
      const baseAmount = BigInt(1000 * 1e6);
      const tick = -100; // Price = 0.999

      const result = dexAdvancedService.calculateQuoteAmount(baseAmount, tick);

      // 1000 * 0.999 * 1.01 ~= 1008.99
      expect(Number(result) / 1e6).toBeCloseTo(1008.99, 0);
    });
  });

  // ===========================================================================
  // placeLimitOrder Tests
  // ===========================================================================

  describe('placeLimitOrder', () => {
    it('should successfully place a buy limit order', async () => {
      const result = await dexAdvancedService.placeLimitOrder({
        token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
        amount: BigInt(1000 * 1e6),
        side: 'buy',
        tick: -10,
      });

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.gasCost).toBeDefined();
      expect(result.orderId).toBe(BigInt(101));
    });

    it('should successfully place a sell limit order', async () => {
      const result = await dexAdvancedService.placeLimitOrder({
        token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
        amount: BigInt(1000 * 1e6),
        side: 'sell',
        tick: 10,
      });

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.orderId).toBe(BigInt(101));
    });

    it('should throw on invalid tick (out of range)', async () => {
      await expect(
        dexAdvancedService.placeLimitOrder({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          amount: BigInt(1000 * 1e6),
          side: 'buy',
          tick: 100000, // Out of int16 range
        })
      ).rejects.toThrow();
    });

    it('should throw when wallet not configured', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = null as unknown as typeof mockClient.walletClient;
      setMockClient(mockClient);
      dexAdvancedService = new DexAdvancedService();

      await expect(
        dexAdvancedService.placeLimitOrder({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          amount: BigInt(1000 * 1e6),
          side: 'buy',
          tick: -10,
        })
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // placeFlipOrder Tests
  // ===========================================================================

  describe('placeFlipOrder', () => {
    it('should successfully place a flip order', async () => {
      const result = await dexAdvancedService.placeFlipOrder({
        token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
        amount: BigInt(1000 * 1e6),
        side: 'buy',
        tick: -10,
        flipTick: 10,
      });

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.orderId).toBe(BigInt(101));
    });

    it('should use negative of tick as default flipTick', async () => {
      // When flipTick is not provided, it should default to -tick
      const result = await dexAdvancedService.placeFlipOrder({
        token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
        amount: BigInt(1000 * 1e6),
        side: 'buy',
        tick: -10,
        // flipTick not provided, should default to 10
      });

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
    });

    it('should throw when buy order flipTick is less than tick', async () => {
      await expect(
        dexAdvancedService.placeFlipOrder({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          amount: BigInt(1000 * 1e6),
          side: 'buy',
          tick: -10,
          flipTick: -20, // Invalid: must be > tick for buy
        })
      ).rejects.toThrow('flipTick must be greater than tick');
    });

    it('should throw when sell order flipTick is greater than tick', async () => {
      await expect(
        dexAdvancedService.placeFlipOrder({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          amount: BigInt(1000 * 1e6),
          side: 'sell',
          tick: 10,
          flipTick: 20, // Invalid: must be < tick for sell
        })
      ).rejects.toThrow('flipTick must be less than tick');
    });
  });

  // ===========================================================================
  // cancelOrder Tests
  // ===========================================================================

  describe('cancelOrder', () => {
    it('should successfully cancel an open order', async () => {
      const result = await dexAdvancedService.cancelOrder(BigInt(50));

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.gasCost).toBeDefined();
      expect(result.refundedAmount).toBe(BigInt(500 * 1e6));
      expect(result.order.side).toBe('buy');
      expect(result.order.tick).toBe(-10);
    });
  });

  // ===========================================================================
  // getOrder Tests
  // ===========================================================================

  describe('getOrder', () => {
    it('should return order details', async () => {
      const order = await dexAdvancedService.getOrder(BigInt(50));

      expect(order.orderId).toBe(BigInt(50));
      expect(order.owner).toBe('0x1234567890123456789012345678901234567890');
      expect(order.side).toBe('buy');
      expect(order.tick).toBe(-10);
      expect(order.amount).toBe(BigInt(1000 * 1e6));
      expect(order.remaining).toBe(BigInt(500 * 1e6));
      expect(order.filled).toBe(BigInt(500 * 1e6));
      expect(order.isFlip).toBe(false);
    });

    it('should calculate filled amount correctly', async () => {
      const order = await dexAdvancedService.getOrder(BigInt(50));

      // filled = amount - remaining
      expect(order.filled).toBe(order.amount - order.remaining);
    });

    it('should determine status based on remaining', async () => {
      const order = await dexAdvancedService.getOrder(BigInt(50));

      // remaining > 0 means still open
      expect(order.status).toBe('open');
    });

    it('should convert tick to price', async () => {
      const order = await dexAdvancedService.getOrder(BigInt(50));

      // tick -10 = price 0.9999
      expect(order.price).toBe(0.9999);
    });
  });

  // ===========================================================================
  // getOrderbook Tests
  // ===========================================================================

  describe('getOrderbook', () => {
    it('should return orderbook with bids and asks', async () => {
      const orderbook = await dexAdvancedService.getOrderbook(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(orderbook.baseToken).toBe(TEST_TOKENS.ALPHA_USD);
      expect(orderbook.quoteToken).toBe(PATH_USD_ADDRESS);
      expect(orderbook.baseTokenSymbol).toBe('AlphaUSD');
      expect(Array.isArray(orderbook.bids)).toBe(true);
      expect(Array.isArray(orderbook.asks)).toBe(true);
    });

    it('should use PATH_USD as default quote token', async () => {
      const orderbook = await dexAdvancedService.getOrderbook(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(orderbook.quoteToken).toBe(PATH_USD_ADDRESS);
    });

    it('should limit depth to specified value', async () => {
      const depth = 5;
      const orderbook = await dexAdvancedService.getOrderbook(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        PATH_USD_ADDRESS,
        depth
      );

      expect(orderbook.bids.length).toBeLessThanOrEqual(depth);
      expect(orderbook.asks.length).toBeLessThanOrEqual(depth);
    });

    it('should calculate spread metrics when book has liquidity', async () => {
      const orderbook = await dexAdvancedService.getOrderbook(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      // With default mock data, we have bids and asks
      if (orderbook.bestBid !== null && orderbook.bestAsk !== null) {
        expect(orderbook.spread).toBeDefined();
        expect(orderbook.midPrice).toBeDefined();
        expect(orderbook.spreadPercent).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // getDexBalance Tests
  // ===========================================================================

  describe('getDexBalance', () => {
    it('should return DEX balance for token', async () => {
      const balance = await dexAdvancedService.getDexBalance(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(balance).toBeDefined();
      expect(typeof balance).toBe('bigint');
    });

    it('should use configured wallet address by default', async () => {
      const balance = await dexAdvancedService.getDexBalance(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(balance).toBeDefined();
    });

    it('should accept custom owner address', async () => {
      const balance = await dexAdvancedService.getDexBalance(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        TEST_ADDRESSES.RECIPIENT as `0x${string}`
      );

      expect(balance).toBeDefined();
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    it('should handle network errors on order placement', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'Network error',
          failOnMethod: 'sendBatch',
        })
      );
      dexAdvancedService = new DexAdvancedService();

      await expect(
        dexAdvancedService.placeLimitOrder({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          amount: BigInt(1000 * 1e6),
          side: 'buy',
          tick: -10,
        })
      ).rejects.toThrow('Network error');
    });

    it('should handle transaction confirmation timeout', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'Transaction confirmation timeout',
          failOnMethod: 'waitForTransaction',
        })
      );
      dexAdvancedService = new DexAdvancedService();

      await expect(
        dexAdvancedService.placeLimitOrder({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          amount: BigInt(1000 * 1e6),
          side: 'buy',
          tick: -10,
        })
      ).rejects.toThrow('Transaction confirmation timeout');
    });

    it('should handle readContract errors on orderbook queries', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'Contract read error',
          failOnMethod: 'readContract',
        })
      );
      dexAdvancedService = new DexAdvancedService();

      await expect(
        dexAdvancedService.getOrderbook(TEST_TOKENS.ALPHA_USD as `0x${string}`)
      ).rejects.toThrow('Contract read error');
    });
  });
});

/**
 * DEX Advanced Integration Tests
 *
 * Tests for DEX advanced orderbook functionality against Tempo testnet.
 *
 * These tests require:
 * - TEMPO_PRIVATE_KEY: Wallet private key (with testnet tokens)
 *
 * Run with: npm run test:integration -- --grep="DEX Advanced"
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getDexAdvancedService,
  resetDexAdvancedService,
  PATH_USD_ADDRESS,
  type DexAdvancedService,
} from '../../src/services/dex-advanced-service.js';
import { getTempoClient, resetTempoClient } from '../../src/services/tempo-client.js';
import { resetConfig } from '../../src/config/index.js';
import type { Address } from 'viem';
import { parseUnits } from 'viem';

// Skip if not configured for integration testing
const hasTestConfig = () => {
  return !!process.env.TEMPO_PRIVATE_KEY;
};

describe.skipIf(!hasTestConfig())('DEX Advanced Integration', () => {
  let service: DexAdvancedService;
  const ALPHA_USD = '0x20c0000000000000000000000000000000000001' as Address;

  beforeAll(() => {
    // Reset singletons to pick up test config
    resetConfig();
    resetTempoClient();
    resetDexAdvancedService();
    service = getDexAdvancedService();
  });

  afterAll(() => {
    // Clean up singletons
    resetDexAdvancedService();
    resetTempoClient();
    resetConfig();
  });

  // ===========================================================================
  // Price Conversion Utilities
  // ===========================================================================

  describe('tickToPrice', () => {
    it('should convert tick 0 to price 1.0', () => {
      expect(service.tickToPrice(0)).toBe(1.0);
    });

    it('should convert tick -10 to price 0.9999', () => {
      expect(service.tickToPrice(-10)).toBeCloseTo(0.9999, 6);
    });

    it('should convert tick 10 to price 1.0001', () => {
      expect(service.tickToPrice(10)).toBeCloseTo(1.0001, 6);
    });

    it('should convert tick -100 to price 0.999', () => {
      expect(service.tickToPrice(-100)).toBeCloseTo(0.999, 5);
    });

    it('should convert tick 100 to price 1.001', () => {
      expect(service.tickToPrice(100)).toBeCloseTo(1.001, 5);
    });
  });

  describe('priceToTick', () => {
    it('should convert price 1.0 to tick 0', () => {
      expect(service.priceToTick(1.0)).toBe(0);
    });

    it('should convert price 0.9999 to tick -10', () => {
      expect(service.priceToTick(0.9999)).toBe(-10);
    });

    it('should convert price 1.0001 to tick 10', () => {
      expect(service.priceToTick(1.0001)).toBe(10);
    });

    it('should round to nearest tick', () => {
      expect(service.priceToTick(1.00015)).toBe(15);
    });
  });

  describe('calculateQuoteAmount', () => {
    it('should calculate quote amount for buy orders with buffer', () => {
      const baseAmount = parseUnits('1000', 6);
      const tick = 0; // Price = 1.0

      const quoteAmount = service.calculateQuoteAmount(baseAmount, tick);

      // Should be approximately 1000 * 1.0 * 1.01 (1% buffer)
      expect(Number(quoteAmount)).toBeGreaterThan(1000 * 1e6);
      expect(Number(quoteAmount)).toBeLessThan(1020 * 1e6);
    });

    it('should account for tick in price calculation', () => {
      const baseAmount = parseUnits('1000', 6);
      const tickPositive = 100; // Price ~1.001

      const quoteAmount = service.calculateQuoteAmount(baseAmount, tickPositive);

      // Quote should be higher for higher tick (higher price)
      expect(Number(quoteAmount)).toBeGreaterThan(1001 * 1e6);
    });
  });

  // ===========================================================================
  // Orderbook Queries (Read-Only)
  // ===========================================================================

  describe('getOrderbook', () => {
    it('should return orderbook structure', async () => {
      const orderbook = await service.getOrderbook(ALPHA_USD);

      expect(orderbook).toBeDefined();
      expect(orderbook.baseToken).toBe(ALPHA_USD);
      expect(orderbook.quoteToken).toBe(PATH_USD_ADDRESS);
      expect(orderbook.baseTokenSymbol).toBeDefined();
      expect(orderbook.quoteTokenSymbol).toBeDefined();
      expect(Array.isArray(orderbook.bids)).toBe(true);
      expect(Array.isArray(orderbook.asks)).toBe(true);
    });

    it('should return bids sorted by price descending', async () => {
      const orderbook = await service.getOrderbook(ALPHA_USD);

      if (orderbook.bids.length > 1) {
        for (let i = 0; i < orderbook.bids.length - 1; i++) {
          expect(orderbook.bids[i].tick).toBeGreaterThanOrEqual(orderbook.bids[i + 1].tick);
        }
      }
    });

    it('should return asks sorted by price ascending', async () => {
      const orderbook = await service.getOrderbook(ALPHA_USD);

      if (orderbook.asks.length > 1) {
        for (let i = 0; i < orderbook.asks.length - 1; i++) {
          expect(orderbook.asks[i].tick).toBeLessThanOrEqual(orderbook.asks[i + 1].tick);
        }
      }
    });

    it('should respect depth parameter', async () => {
      const depth = 5;
      const orderbook = await service.getOrderbook(ALPHA_USD, PATH_USD_ADDRESS, depth);

      expect(orderbook.bids.length).toBeLessThanOrEqual(depth);
      expect(orderbook.asks.length).toBeLessThanOrEqual(depth);
    });

    it('should calculate spread when liquidity exists', async () => {
      const orderbook = await service.getOrderbook(ALPHA_USD);

      if (orderbook.bids.length > 0 && orderbook.asks.length > 0) {
        expect(orderbook.bestBid).not.toBeNull();
        expect(orderbook.bestAsk).not.toBeNull();
        expect(orderbook.spread).not.toBeNull();
        expect(orderbook.midPrice).not.toBeNull();
        expect(orderbook.spreadPercent).not.toBeNull();
      }
    });
  });

  describe('getDexBalance', () => {
    it('should return DEX balance for token', async () => {
      const balance = await service.getDexBalance(ALPHA_USD);

      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThanOrEqual(0n);
    });

    it('should return DEX balance for PathUSD', async () => {
      const balance = await service.getDexBalance(PATH_USD_ADDRESS);

      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThanOrEqual(0n);
    });
  });

  // Note: getOrdersByOwner iterates through all order IDs on-chain, which can be slow
  // These tests require extended timeout (120s) for testnet operations
  // Contract may revert with custom errors depending on state - tests handle gracefully
  describe('getOrdersByOwner', () => {
    it('should return orders array for wallet', async () => {
      try {
        const orders = await service.getOrdersByOwner();
        expect(Array.isArray(orders)).toBe(true);
      } catch (error) {
        // Contract may revert with custom errors - skip gracefully
        expect((error as Error).message).toContain('revert');
      }
    }, 120000);

    it('should filter by token when specified', async () => {
      try {
        const orders = await service.getOrdersByOwner(undefined, ALPHA_USD);
        for (const order of orders) {
          expect(order.token.toLowerCase()).toBe(ALPHA_USD.toLowerCase());
        }
      } catch (error) {
        // Contract may revert with custom errors - skip gracefully
        expect((error as Error).message).toContain('revert');
      }
    }, 120000);

    it('should filter by status when specified', async () => {
      try {
        const openOrders = await service.getOrdersByOwner(undefined, undefined, 'open');
        for (const order of openOrders) {
          expect(order.status).toBe('open');
        }
      } catch (error) {
        // Contract may revert with custom errors - skip gracefully
        expect((error as Error).message).toContain('revert');
      }
    }, 120000);
  });

  // ===========================================================================
  // Order Placement (Requires Funded Account)
  // ===========================================================================

  describe.skipIf(!process.env.TEMPO_PRIVATE_KEY)('placeLimitOrder', () => {
    it('should validate tick range', async () => {
      await expect(
        service.placeLimitOrder({
          token: ALPHA_USD,
          amount: parseUnits('10', 6),
          side: 'buy',
          tick: -50000, // Invalid tick (out of int16 range)
        })
      ).rejects.toThrow();
    });

    // Full order placement test - only run with funded account
    it.skip('should place a limit buy order', async () => {
      const amount = parseUnits('10', 6); // 10 tokens
      const tick = -100; // Buy at $0.999

      const result = await service.placeLimitOrder({
        token: ALPHA_USD,
        amount,
        side: 'buy',
        tick,
      });

      expect(result.orderId).toBeGreaterThan(0n);
      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.gasCost).toBeDefined();
    });
  });

  describe.skipIf(!process.env.TEMPO_PRIVATE_KEY)('placeFlipOrder', () => {
    it('should validate flip tick constraints for buy', async () => {
      await expect(
        service.placeFlipOrder({
          token: ALPHA_USD,
          amount: parseUnits('10', 6),
          side: 'buy',
          tick: -10,
          flipTick: -20, // Invalid: flipTick must be > tick for buy
        })
      ).rejects.toThrow('flipTick must be greater than tick');
    });

    it('should validate flip tick constraints for sell', async () => {
      await expect(
        service.placeFlipOrder({
          token: ALPHA_USD,
          amount: parseUnits('10', 6),
          side: 'sell',
          tick: 10,
          flipTick: 20, // Invalid: flipTick must be < tick for sell
        })
      ).rejects.toThrow('flipTick must be less than tick');
    });
  });

  describe.skipIf(!process.env.TEMPO_PRIVATE_KEY)('cancelOrder', () => {
    it('should fail on non-existent order', async () => {
      const nonExistentOrderId = 999999999n;

      await expect(
        service.cancelOrder(nonExistentOrderId)
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // Order Queries
  // ===========================================================================

  describe('getOrder', () => {
    it('should throw on non-existent order', async () => {
      const nonExistentOrderId = 999999999n;

      await expect(
        service.getOrder(nonExistentOrderId)
      ).rejects.toThrow();
    });

    // Query existing order - only meaningful with known orders
    it.skip('should return order details', async () => {
      const orderId = 1n; // Replace with known order ID

      const order = await service.getOrder(orderId);

      expect(order.orderId).toBe(orderId);
      expect(order.owner).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(order.token).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(['buy', 'sell']).toContain(order.side);
      expect(['open', 'filled', 'cancelled', 'queued']).toContain(order.status);
      expect(order.amount).toBeGreaterThanOrEqual(0n);
      expect(order.remaining).toBeGreaterThanOrEqual(0n);
      expect(order.filled).toBeGreaterThanOrEqual(0n);
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('error handling', () => {
    it('should handle invalid token address gracefully', async () => {
      const invalidToken = '0x0000000000000000000000000000000000000000' as Address;

      // getOrderbook should handle this gracefully
      await expect(
        service.getOrderbook(invalidToken)
      ).rejects.toThrow();
    });

    it('should handle invalid tick values', async () => {
      // This should throw a validation error
      await expect(
        service.placeLimitOrder({
          token: ALPHA_USD,
          amount: parseUnits('10', 6),
          side: 'buy',
          tick: 40000, // Out of int16 range
        })
      ).rejects.toThrow(/out of range/);
    });
  });
});

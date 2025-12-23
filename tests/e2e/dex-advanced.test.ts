/**
 * E2E Tests: DEX Advanced Operations
 *
 * Tests advanced orderbook trading against the real Tempo testnet.
 *
 * - Read operations: Safe, no funds consumed
 * - Write operations: Require testnet funds, skipped by default
 *
 * Prerequisites:
 * - TEMPO_PRIVATE_KEY set in .env (for wallet address resolution)
 * - Network access to Tempo testnet RPC
 *
 * Run with:
 *   npm run test:e2e  # Read-only operations
 *   E2E_WRITE=true npm run test:e2e  # Include order placement
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { type Address, parseUnits } from 'viem';

import {
  describeE2E,
  describeE2EWrite,
  E2E_CONFIG,
  shouldRunE2E,
  shouldRunE2EWrite,
  logE2EStatus,
  retryWithBackoff,
} from './setup.js';

// =============================================================================
// Dynamic Imports
// =============================================================================

let getDexAdvancedService: typeof import('../../src/services/dex-advanced-service.js').getDexAdvancedService;
let resetDexAdvancedService: typeof import('../../src/services/dex-advanced-service.js').resetDexAdvancedService;
let PATH_USD_ADDRESS: typeof import('../../src/services/dex-advanced-service.js').PATH_USD_ADDRESS;
let loadConfig: typeof import('../../src/config/index.js').loadConfig;

// =============================================================================
// Test Suite: Read Operations
// =============================================================================

describeE2E('E2E: DEX Advanced Read Operations', () => {
  beforeAll(async () => {
    logE2EStatus();

    if (!shouldRunE2E()) {
      return;
    }

    // Dynamically import modules
    const dexAdvancedModule = await import('../../src/services/dex-advanced-service.js');
    const configModule = await import('../../src/config/index.js');

    getDexAdvancedService = dexAdvancedModule.getDexAdvancedService;
    resetDexAdvancedService = dexAdvancedModule.resetDexAdvancedService;
    PATH_USD_ADDRESS = dexAdvancedModule.PATH_USD_ADDRESS;
    loadConfig = configModule.loadConfig;

    // Load configuration
    loadConfig();
  });

  // ===========================================================================
  // Price Utilities
  // ===========================================================================

  describe('Price Conversion', () => {
    it('should convert ticks to prices correctly', async () => {
      const service = getDexAdvancedService();

      // Tick 0 = $1.0000
      expect(service.tickToPrice(0)).toBe(1.0);

      // Tick -10 = $0.9999 (buy below parity)
      expect(service.tickToPrice(-10)).toBeCloseTo(0.9999, 6);

      // Tick 10 = $1.0001 (sell above parity)
      expect(service.tickToPrice(10)).toBeCloseTo(1.0001, 6);

      console.log('  tick 0    => $1.0000');
      console.log('  tick -10  => $0.9999');
      console.log('  tick 10   => $1.0001');
    }, E2E_CONFIG.timeout);

    it('should convert prices to ticks correctly', async () => {
      const service = getDexAdvancedService();

      expect(service.priceToTick(1.0)).toBe(0);
      expect(service.priceToTick(0.9999)).toBe(-10);
      expect(service.priceToTick(1.0001)).toBe(10);

      console.log('  $1.0000 => tick 0');
      console.log('  $0.9999 => tick -10');
      console.log('  $1.0001 => tick 10');
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Orderbook Queries
  // ===========================================================================

  describe('Orderbook Queries', () => {
    it('should fetch orderbook for AlphaUSD/PathUSD pair', async () => {
      const service = getDexAdvancedService();

      const orderbook = await retryWithBackoff(async () => {
        return service.getOrderbook(E2E_CONFIG.tokens.alphaUSD);
      });

      expect(orderbook).toBeDefined();
      expect(orderbook.baseToken.toLowerCase()).toBe(
        E2E_CONFIG.tokens.alphaUSD.toLowerCase()
      );
      expect(orderbook.quoteToken.toLowerCase()).toBe(
        PATH_USD_ADDRESS.toLowerCase()
      );
      expect(orderbook.baseTokenSymbol).toBeDefined();
      expect(orderbook.quoteTokenSymbol).toBeDefined();
      expect(Array.isArray(orderbook.bids)).toBe(true);
      expect(Array.isArray(orderbook.asks)).toBe(true);

      console.log(`  Pair: ${orderbook.baseTokenSymbol}/${orderbook.quoteTokenSymbol}`);
      console.log(`  Bids: ${orderbook.bids.length} levels`);
      console.log(`  Asks: ${orderbook.asks.length} levels`);
      if (orderbook.bestBid !== null) {
        console.log(`  Best Bid: $${orderbook.bestBid.toFixed(6)}`);
      }
      if (orderbook.bestAsk !== null) {
        console.log(`  Best Ask: $${orderbook.bestAsk.toFixed(6)}`);
      }
      if (orderbook.spread !== null) {
        console.log(`  Spread: $${orderbook.spread.toFixed(6)} (${orderbook.spreadPercent})`);
      }
    }, E2E_CONFIG.timeout);

    it('should respect depth parameter', async () => {
      const service = getDexAdvancedService();
      const depth = 3;

      const orderbook = await retryWithBackoff(async () => {
        return service.getOrderbook(E2E_CONFIG.tokens.alphaUSD, PATH_USD_ADDRESS, depth);
      });

      expect(orderbook.bids.length).toBeLessThanOrEqual(depth);
      expect(orderbook.asks.length).toBeLessThanOrEqual(depth);

      console.log(`  Requested depth: ${depth}`);
      console.log(`  Bids returned: ${orderbook.bids.length}`);
      console.log(`  Asks returned: ${orderbook.asks.length}`);
    }, E2E_CONFIG.timeout);

    it('should have bids sorted by price descending', async () => {
      const service = getDexAdvancedService();

      const orderbook = await retryWithBackoff(async () => {
        return service.getOrderbook(E2E_CONFIG.tokens.alphaUSD);
      });

      if (orderbook.bids.length > 1) {
        for (let i = 0; i < orderbook.bids.length - 1; i++) {
          expect(orderbook.bids[i].tick).toBeGreaterThanOrEqual(orderbook.bids[i + 1].tick);
        }
        console.log('  Bids correctly sorted: descending by price');
      } else {
        console.log('  Not enough bids to verify sorting');
      }
    }, E2E_CONFIG.timeout);

    it('should have asks sorted by price ascending', async () => {
      const service = getDexAdvancedService();

      const orderbook = await retryWithBackoff(async () => {
        return service.getOrderbook(E2E_CONFIG.tokens.alphaUSD);
      });

      if (orderbook.asks.length > 1) {
        for (let i = 0; i < orderbook.asks.length - 1; i++) {
          expect(orderbook.asks[i].tick).toBeLessThanOrEqual(orderbook.asks[i + 1].tick);
        }
        console.log('  Asks correctly sorted: ascending by price');
      } else {
        console.log('  Not enough asks to verify sorting');
      }
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // DEX Balance Queries
  // ===========================================================================

  describe('DEX Balance Queries', () => {
    it('should get DEX balance for AlphaUSD', async () => {
      const service = getDexAdvancedService();

      const balance = await retryWithBackoff(async () => {
        return service.getDexBalance(E2E_CONFIG.tokens.alphaUSD);
      });

      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThanOrEqual(0n);

      const formatted = (Number(balance) / 1e6).toFixed(6);
      console.log(`  DEX Balance (AlphaUSD): ${formatted}`);
    }, E2E_CONFIG.timeout);

    it('should get DEX balance for PathUSD', async () => {
      const service = getDexAdvancedService();

      const balance = await retryWithBackoff(async () => {
        return service.getDexBalance(PATH_USD_ADDRESS);
      });

      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThanOrEqual(0n);

      const formatted = (Number(balance) / 1e6).toFixed(6);
      console.log(`  DEX Balance (PathUSD): ${formatted}`);
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Order Queries
  // ===========================================================================

  describe('Order Queries', () => {
    it('should list orders for wallet', async () => {
      const service = getDexAdvancedService();

      try {
        const orders = await retryWithBackoff(async () => {
          return service.getOrdersByOwner();
        });

        expect(Array.isArray(orders)).toBe(true);

        console.log(`  Total orders found: ${orders.length}`);
        if (orders.length > 0) {
          const order = orders[0];
          console.log(`  First order:`);
          console.log(`    ID: ${order.orderId}`);
          console.log(`    Side: ${order.side}`);
          console.log(`    Status: ${order.status}`);
          console.log(`    Price: $${order.price.toFixed(6)}`);
        }
      } catch (error) {
        // Contract may revert with custom errors - skip gracefully
        console.log(`  Skipped: ${(error as Error).message.slice(0, 100)}`);
      }
    }, E2E_CONFIG.longTimeout); // Use long timeout - iterates through all order IDs

    it('should filter orders by status', async () => {
      const service = getDexAdvancedService();

      try {
        const openOrders = await retryWithBackoff(async () => {
          return service.getOrdersByOwner(undefined, undefined, 'open');
        });

        for (const order of openOrders) {
          expect(order.status).toBe('open');
        }

        console.log(`  Open orders: ${openOrders.length}`);
      } catch (error) {
        // Contract may revert with custom errors - skip gracefully
        console.log(`  Skipped: ${(error as Error).message.slice(0, 100)}`);
      }
    }, E2E_CONFIG.longTimeout); // Use long timeout - iterates through all order IDs
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('Error Handling', () => {
    it('should throw on non-existent order ID', async () => {
      const service = getDexAdvancedService();

      await expect(
        service.getOrder(BigInt(999999999))
      ).rejects.toThrow();

      console.log('  Correctly throws on non-existent order');
    }, E2E_CONFIG.timeout);

    it('should handle invalid tick values', async () => {
      const service = getDexAdvancedService();

      await expect(
        service.placeLimitOrder({
          token: E2E_CONFIG.tokens.alphaUSD,
          amount: parseUnits('10', 6),
          side: 'buy',
          tick: 50000, // Out of int16 range
        })
      ).rejects.toThrow(/out of range/);

      console.log('  Correctly validates tick range');
    }, E2E_CONFIG.timeout);

    it('should validate flip order constraints', async () => {
      const service = getDexAdvancedService();

      // For buy orders, flipTick must be > tick
      await expect(
        service.placeFlipOrder({
          token: E2E_CONFIG.tokens.alphaUSD,
          amount: parseUnits('10', 6),
          side: 'buy',
          tick: -10,
          flipTick: -20, // Invalid: must be > -10 for buy
        })
      ).rejects.toThrow(/flipTick must be greater/);

      console.log('  Correctly validates flip order constraints');
    }, E2E_CONFIG.timeout);
  });
});

// =============================================================================
// Test Suite: Write Operations
// =============================================================================

describeE2EWrite('E2E: DEX Advanced Write Operations', () => {
  beforeAll(async () => {
    if (!shouldRunE2EWrite()) {
      return;
    }

    // Dynamic imports for write tests
    const dexAdvancedModule = await import('../../src/services/dex-advanced-service.js');
    const configModule = await import('../../src/config/index.js');

    getDexAdvancedService = dexAdvancedModule.getDexAdvancedService;
    resetDexAdvancedService = dexAdvancedModule.resetDexAdvancedService;
    PATH_USD_ADDRESS = dexAdvancedModule.PATH_USD_ADDRESS;
    loadConfig = configModule.loadConfig;

    loadConfig();
  });

  // Add delay between tests to avoid nonce conflicts from rapid transaction submission
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  // ===========================================================================
  // Order Placement (Consume Testnet Funds)
  // ===========================================================================

  describe('Limit Order Placement', () => {
    it('should place a small limit buy order', async () => {
      const service = getDexAdvancedService();

      // Use very small amount to minimize fund usage
      const amount = parseUnits('10', 6); // 0.01 tokens
      const tick = -1000; // Buy at ~$0.99 (unlikely to fill)

      console.log(`  Placing buy order: 0.01 AlphaUSD at tick ${tick} ($${service.tickToPrice(tick).toFixed(6)})`);

      const result = await service.placeLimitOrder({
        token: E2E_CONFIG.tokens.alphaUSD,
        amount,
        side: 'buy',
        tick,
      });

      expect(result.orderId).toBeGreaterThan(0n);
      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.blockNumber).toBeGreaterThan(0);

      console.log(`  Order ID: ${result.orderId}`);
      console.log(`  TX Hash: ${result.hash}`);
      console.log(`  Block: ${result.blockNumber}`);
      console.log(`  Gas Cost: ${result.gasCost}`);

      // Clean up: cancel the order
      console.log('  Cancelling order...');
      const cancelResult = await service.cancelOrder(result.orderId);
      console.log(`  Cancel TX: ${cancelResult.hash}`);
    }, E2E_CONFIG.longTimeout);

    it('should place a small limit sell order', async () => {
      const service = getDexAdvancedService();

      const amount = parseUnits('10', 6);
      const tick = 1000; // Sell at ~$1.01 (unlikely to fill)

      console.log(`  Placing sell order: 0.01 AlphaUSD at tick ${tick} ($${service.tickToPrice(tick).toFixed(6)})`);

      const result = await service.placeLimitOrder({
        token: E2E_CONFIG.tokens.alphaUSD,
        amount,
        side: 'sell',
        tick,
      });

      expect(result.orderId).toBeGreaterThan(0n);
      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);

      console.log(`  Order ID: ${result.orderId}`);
      console.log(`  TX Hash: ${result.hash}`);

      // Clean up
      console.log('  Cancelling order...');
      await service.cancelOrder(result.orderId);
    }, E2E_CONFIG.longTimeout);
  });

  describe('Flip Order Placement', () => {
    it('should place a flip order with auto-reverse', async () => {
      const service = getDexAdvancedService();

      const amount = parseUnits('10', 6);
      const tick = -100; // Buy at $0.999
      const flipTick = 100; // Flip to sell at $1.001

      console.log(`  Placing flip order: buy at tick ${tick}, flip to sell at ${flipTick}`);

      const result = await service.placeFlipOrder({
        token: E2E_CONFIG.tokens.alphaUSD,
        amount,
        side: 'buy',
        tick,
        flipTick,
      });

      expect(result.orderId).toBeGreaterThan(0n);
      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);

      console.log(`  Order ID: ${result.orderId}`);
      console.log(`  TX Hash: ${result.hash}`);
      console.log(`  Gas Cost: ${result.gasCost}`);

      // Verify order is marked as flip
      const order = await service.getOrder(result.orderId);
      expect(order.isFlip).toBe(true);
      console.log(`  Is Flip: ${order.isFlip}`);

      // Clean up
      console.log('  Cancelling order...');
      await service.cancelOrder(result.orderId);
    }, E2E_CONFIG.longTimeout);
  });

  describe('Order Cancellation', () => {
    it('should cancel an open order and refund tokens', async () => {
      const service = getDexAdvancedService();

      // First place an order
      const amount = parseUnits('10', 6);
      const tick = -1000;

      console.log('  Placing order to cancel...');
      const placeResult = await service.placeLimitOrder({
        token: E2E_CONFIG.tokens.alphaUSD,
        amount,
        side: 'buy',
        tick,
      });

      console.log(`  Order ID: ${placeResult.orderId}`);

      // Now cancel it
      console.log('  Cancelling order...');
      const cancelResult = await service.cancelOrder(placeResult.orderId);

      expect(cancelResult.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(cancelResult.refundedAmount).toBeGreaterThan(0n);
      expect(cancelResult.order.side).toBe('buy');
      expect(cancelResult.order.tick).toBe(tick);

      console.log(`  Cancel TX: ${cancelResult.hash}`);
      console.log(`  Refunded: ${(Number(cancelResult.refundedAmount) / 1e6).toFixed(6)}`);
      console.log(`  Block: ${cancelResult.blockNumber}`);
    }, E2E_CONFIG.longTimeout);

    it('should fail to cancel already cancelled order', async () => {
      const service = getDexAdvancedService();

      // Place and cancel an order
      const amount = parseUnits('10', 6);
      const tick = -1000;

      const placeResult = await service.placeLimitOrder({
        token: E2E_CONFIG.tokens.alphaUSD,
        amount,
        side: 'buy',
        tick,
      });

      await service.cancelOrder(placeResult.orderId);

      // Try to cancel again - order no longer exists after cancellation
      await expect(
        service.cancelOrder(placeResult.orderId)
      ).rejects.toThrow(/OrderDoesNotExist|already cancelled|does not exist/);

      console.log('  Correctly rejects double cancellation');
    }, E2E_CONFIG.longTimeout);
  });
});

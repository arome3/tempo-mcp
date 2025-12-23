/**
 * DEX Advanced Tool Schemas Unit Tests
 *
 * Tests for Zod schemas used in DEX advanced orderbook tools.
 * Validates input parsing and response helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  // Input schemas
  placeLimitOrderInputZodSchema,
  placeFlipOrderInputZodSchema,
  cancelOrderInputZodSchema,
  getOrderbookInputZodSchema,
  getMyOrdersInputZodSchema,
  getOrderStatusInputZodSchema,
  // Response helpers
  createPlaceLimitOrderResponse,
  createPlaceFlipOrderResponse,
  createCancelOrderResponse,
  createGetOrderbookResponse,
  createGetMyOrdersResponse,
  createGetOrderStatusResponse,
  createDexAdvancedErrorResponse,
} from '../../../src/tools/dex-advanced/schemas.js';
import {
  TEST_TOKENS,
  TEST_TX_HASHES,
} from '../../utils/test-helpers.js';

// =============================================================================
// Input Schema Tests
// =============================================================================

describe('placeLimitOrderInputSchema', () => {
  it('should accept valid limit order input', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      amount: '1000.50',
      side: 'buy',
      tick: -10,
    };

    const result = placeLimitOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.side).toBe('buy');
      expect(result.data.tick).toBe(-10);
    }
  });

  it('should accept sell side', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      amount: '500',
      side: 'sell',
      tick: 10,
    };

    const result = placeLimitOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept token alias', () => {
    const input = {
      token: 'AlphaUSD',
      amount: '100',
      side: 'buy',
      tick: 0,
    };

    const result = placeLimitOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid amount format', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      amount: 'not-a-number',
      side: 'buy',
      tick: 0,
    };

    const result = placeLimitOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject invalid side', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      amount: '100',
      side: 'invalid',
      tick: 0,
    };

    const result = placeLimitOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject tick out of int16 range', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      amount: '100',
      side: 'buy',
      tick: 50000, // > 32767
    };

    const result = placeLimitOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept negative tick within range', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      amount: '100',
      side: 'buy',
      tick: -32768, // min int16
    };

    const result = placeLimitOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject empty token', () => {
    const input = {
      token: '',
      amount: '100',
      side: 'buy',
      tick: 0,
    };

    const result = placeLimitOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('placeFlipOrderInputSchema', () => {
  it('should accept valid flip order with flipTick', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      amount: '1000',
      side: 'buy',
      tick: -10,
      flipTick: 10,
    };

    const result = placeFlipOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.flipTick).toBe(10);
    }
  });

  it('should accept flip order without flipTick (optional)', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      amount: '1000',
      side: 'buy',
      tick: -10,
    };

    const result = placeFlipOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.flipTick).toBeUndefined();
    }
  });

  it('should accept sell side flip order', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      amount: '500',
      side: 'sell',
      tick: 10,
      flipTick: -10,
    };

    const result = placeFlipOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('cancelOrderInputSchema', () => {
  it('should accept valid order ID', () => {
    const input = {
      orderId: '12345',
    };

    const result = cancelOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject empty order ID', () => {
    const input = {
      orderId: '',
    };

    const result = cancelOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject missing order ID', () => {
    const input = {};

    const result = cancelOrderInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('getOrderbookInputSchema', () => {
  it('should accept valid orderbook query', () => {
    const input = {
      baseToken: TEST_TOKENS.ALPHA_USD,
      depth: 10,
    };

    const result = getOrderbookInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept optional quote token', () => {
    const input = {
      baseToken: TEST_TOKENS.ALPHA_USD,
      quoteToken: TEST_TOKENS.BETA_USD,
      depth: 5,
    };

    const result = getOrderbookInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should use default depth of 10', () => {
    const input = {
      baseToken: TEST_TOKENS.ALPHA_USD,
    };

    const result = getOrderbookInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.depth).toBe(10);
    }
  });

  it('should reject depth > 50', () => {
    const input = {
      baseToken: TEST_TOKENS.ALPHA_USD,
      depth: 100,
    };

    const result = getOrderbookInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject depth < 1', () => {
    const input = {
      baseToken: TEST_TOKENS.ALPHA_USD,
      depth: 0,
    };

    const result = getOrderbookInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('getMyOrdersInputSchema', () => {
  it('should accept empty input (all defaults)', () => {
    const input = {};

    const result = getMyOrdersInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('open');
    }
  });

  it('should accept token filter', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
    };

    const result = getMyOrdersInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept status filter', () => {
    const input = {
      status: 'filled',
    };

    const result = getMyOrdersInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('filled');
    }
  });

  it('should accept "all" status', () => {
    const input = {
      status: 'all',
    };

    const result = getMyOrdersInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid status', () => {
    const input = {
      status: 'invalid',
    };

    const result = getMyOrdersInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('getOrderStatusInputSchema', () => {
  it('should accept valid order ID', () => {
    const input = {
      orderId: '67890',
    };

    const result = getOrderStatusInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject empty order ID', () => {
    const input = {
      orderId: '',
    };

    const result = getOrderStatusInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Response Helper Tests
// =============================================================================

describe('createPlaceLimitOrderResponse', () => {
  it('should create valid response with all fields', () => {
    const response = createPlaceLimitOrderResponse({
      orderId: '101',
      token: TEST_TOKENS.ALPHA_USD,
      tokenSymbol: 'AlphaUSD',
      side: 'buy',
      amount: '1000',
      amountRaw: '1000000000',
      tick: -10,
      price: '0.9999',
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      gasCost: '0.001',
      explorerUrl: 'https://explorer.tempo.network/tx/0x123',
    });

    expect(response.success).toBe(true);
    expect(response.orderId).toBe('101');
    expect(response.status).toBe('queued');
    expect(response.note).toContain('MEV protection');
    expect(response.timestamp).toBeDefined();
  });
});

describe('createPlaceFlipOrderResponse', () => {
  it('should create valid response with flip details', () => {
    const response = createPlaceFlipOrderResponse({
      orderId: '102',
      token: TEST_TOKENS.ALPHA_USD,
      tokenSymbol: 'AlphaUSD',
      side: 'buy',
      amount: '1000',
      amountRaw: '1000000000',
      tick: -10,
      tickPrice: '0.9999',
      flipTick: 10,
      flipPrice: '1.0001',
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      gasCost: '0.001',
      explorerUrl: 'https://explorer.tempo.network/tx/0x123',
    });

    expect(response.success).toBe(true);
    expect(response.flipTick).toBe(10);
    expect(response.flipPrice).toBe('1.0001');
    expect(response.behavior).toContain('auto-reverse');
  });
});

describe('createCancelOrderResponse', () => {
  it('should create valid cancel response', () => {
    const response = createCancelOrderResponse({
      orderId: '50',
      cancelledOrder: {
        side: 'buy',
        amount: '1000',
        filled: '500',
        tick: -10,
        price: '0.9999',
      },
      refundedAmount: '500',
      refundedAmountRaw: '500000000',
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12346,
      gasCost: '0.0005',
      explorerUrl: 'https://explorer.tempo.network/tx/0x456',
    });

    expect(response.success).toBe(true);
    expect(response.orderId).toBe('50');
    expect(response.refundedAmount).toBe('500');
    expect(response.cancelledOrder.filled).toBe('500');
    expect(response.timestamp).toBeDefined();
  });
});

describe('createGetOrderbookResponse', () => {
  it('should create valid orderbook response', () => {
    const response = createGetOrderbookResponse({
      pair: 'AlphaUSD/PathUSD',
      baseToken: TEST_TOKENS.ALPHA_USD,
      quoteToken: TEST_TOKENS.PATH_USD,
      midPrice: '1.0000',
      spread: '0.0002',
      spreadPercent: '0.02%',
      asks: [
        { price: '1.0001', tick: 10, amount: '10000' },
        { price: '1.0002', tick: 20, amount: '5000' },
      ],
      bids: [
        { price: '0.9999', tick: -10, amount: '8000' },
        { price: '0.9998', tick: -20, amount: '3000' },
      ],
    });

    expect(response.pair).toBe('AlphaUSD/PathUSD');
    expect(response.asks.length).toBe(2);
    expect(response.bids.length).toBe(2);
    expect(response.midPrice).toBe('1.0000');
    expect(response.spread).toBe('0.0002');
  });

  it('should handle null spread metrics', () => {
    const response = createGetOrderbookResponse({
      pair: 'AlphaUSD/PathUSD',
      baseToken: TEST_TOKENS.ALPHA_USD,
      quoteToken: TEST_TOKENS.PATH_USD,
      midPrice: null,
      spread: null,
      spreadPercent: null,
      asks: [],
      bids: [],
    });

    expect(response.midPrice).toBeNull();
    expect(response.spread).toBeNull();
    expect(response.spreadPercent).toBeNull();
  });
});

describe('createGetMyOrdersResponse', () => {
  it('should create valid orders list response', () => {
    const response = createGetMyOrdersResponse({
      totalOrders: 2,
      orders: [
        {
          orderId: '1',
          token: TEST_TOKENS.ALPHA_USD,
          tokenSymbol: 'AlphaUSD',
          side: 'buy',
          amount: '1000',
          filled: '500',
          remaining: '500',
          tick: -10,
          price: '0.9999',
          status: 'open',
          isFlip: false,
        },
        {
          orderId: '2',
          token: TEST_TOKENS.ALPHA_USD,
          tokenSymbol: 'AlphaUSD',
          side: 'sell',
          amount: '2000',
          filled: '2000',
          remaining: '0',
          tick: 10,
          price: '1.0001',
          status: 'filled',
          isFlip: true,
        },
      ],
    });

    expect(response.totalOrders).toBe(2);
    expect(response.orders.length).toBe(2);
    expect(response.orders[0].isFlip).toBe(false);
    expect(response.orders[1].isFlip).toBe(true);
  });

  it('should handle empty orders list', () => {
    const response = createGetMyOrdersResponse({
      totalOrders: 0,
      orders: [],
    });

    expect(response.totalOrders).toBe(0);
    expect(response.orders).toEqual([]);
  });
});

describe('createGetOrderStatusResponse', () => {
  it('should create valid order status response', () => {
    const response = createGetOrderStatusResponse({
      orderId: '100',
      owner: '0x1234567890123456789012345678901234567890',
      token: TEST_TOKENS.ALPHA_USD,
      tokenSymbol: 'AlphaUSD',
      side: 'buy',
      tick: -10,
      price: '0.9999',
      amount: '1000',
      filled: '750',
      remaining: '250',
      fillPercent: '75.00%',
      status: 'open',
      isFlip: false,
    });

    expect(response.orderId).toBe('100');
    expect(response.fillPercent).toBe('75.00%');
    expect(response.status).toBe('open');
  });
});

describe('createDexAdvancedErrorResponse', () => {
  it('should create valid error response', () => {
    const response = createDexAdvancedErrorResponse({
      code: 1012,
      message: 'Tick out of range',
      details: {
        field: 'tick',
        expected: '-32768 to 32767',
        received: '50000',
      },
      recoverable: false,
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(1012);
    expect(response.error.message).toBe('Tick out of range');
    expect(response.error.details?.field).toBe('tick');
    expect(response.error.recoverable).toBe(false);
  });

  it('should handle error without details', () => {
    const response = createDexAdvancedErrorResponse({
      code: 3001,
      message: 'Network error',
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(3001);
    expect(response.error.details).toBeUndefined();
  });

  it('should include retry information when provided', () => {
    const response = createDexAdvancedErrorResponse({
      code: 4001,
      message: 'Rate limited',
      recoverable: true,
      retryAfter: 5000,
    });

    expect(response.error.recoverable).toBe(true);
    expect(response.error.retryAfter).toBe(5000);
  });
});

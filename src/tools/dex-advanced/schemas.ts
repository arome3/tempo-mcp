/**
 * DEX Advanced Tool Schemas
 *
 * Zod schemas for DEX advanced orderbook tool inputs and outputs.
 * These define the structure of data flowing through DEX advanced tools:
 * - place_limit_order: Place a resting limit order
 * - place_flip_order: Place an auto-reversing flip order
 * - cancel_order: Cancel an open order
 * - get_orderbook: View orderbook depth
 * - get_my_orders: List your open orders
 * - get_order_status: Check specific order status
 */

import { z } from 'zod';

// =============================================================================
// Shared Schema Parts
// =============================================================================

const tokenAddressSchema = z
  .string()
  .min(1)
  .describe(
    'Token address (0x-prefixed 40-character hex string) or token alias (e.g., "AlphaUSD")'
  );

const optionalTokenAddressSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    'Quote token address or alias (defaults to PathUSD if not specified)'
  );

const amountSchema = z
  .string()
  .min(1)
  .regex(/^\d+(\.\d+)?$/, 'Amount must be a valid decimal number')
  .describe('Amount in human-readable units (e.g., "1000.50")');

const orderSideSchema = z
  .enum(['buy', 'sell'])
  .describe('Order side: "buy" to purchase tokens, "sell" to sell tokens');

const tickSchema = z
  .number()
  .int()
  .min(-32768)
  .max(32767)
  .describe(
    'Price tick: (price - 1) × 100,000. Examples: tick 0 = $1.0000, tick -10 = $0.9999, tick 10 = $1.0001'
  );

const orderIdSchema = z
  .string()
  .min(1)
  .describe('Order ID (numeric string)');

const orderStatusSchema = z
  .enum(['open', 'filled', 'cancelled', 'all'])
  .default('open')
  .describe('Filter orders by status');

// =============================================================================
// place_limit_order Schemas
// =============================================================================

/**
 * Input schema for the place_limit_order tool.
 */
export const placeLimitOrderInputSchema = {
  token: tokenAddressSchema.describe('Token to trade (e.g., "AlphaUSD" or 0x address)'),
  amount: amountSchema.describe('Amount of tokens to trade'),
  side: orderSideSchema,
  tick: tickSchema,
};

export const placeLimitOrderInputZodSchema = z.object(placeLimitOrderInputSchema);
export type PlaceLimitOrderInput = z.infer<typeof placeLimitOrderInputZodSchema>;

/**
 * Output schema for successful place_limit_order response.
 */
export const placeLimitOrderOutputSchema = z.object({
  success: z.literal(true),
  orderId: z.string(),
  token: z.string(),
  tokenSymbol: z.string(),
  side: orderSideSchema,
  amount: z.string(),
  amountRaw: z.string(),
  tick: z.number(),
  price: z.string(),
  status: z.string(),
  note: z.string(),
  transactionHash: z.string(),
  blockNumber: z.number(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type PlaceLimitOrderOutput = z.infer<typeof placeLimitOrderOutputSchema>;

// =============================================================================
// place_flip_order Schemas
// =============================================================================

/**
 * Input schema for the place_flip_order tool.
 */
export const placeFlipOrderInputSchema = {
  token: tokenAddressSchema.describe('Token to trade'),
  amount: amountSchema.describe('Amount per side'),
  side: orderSideSchema.describe('Initial order side'),
  tick: tickSchema.describe('Initial price tick'),
  flipTick: z
    .number()
    .int()
    .min(-32768)
    .max(32767)
    .optional()
    .describe('Tick for reverse order (defaults to negative of initial tick)'),
};

export const placeFlipOrderInputZodSchema = z.object(placeFlipOrderInputSchema);
export type PlaceFlipOrderInput = z.infer<typeof placeFlipOrderInputZodSchema>;

/**
 * Output schema for successful place_flip_order response.
 */
export const placeFlipOrderOutputSchema = z.object({
  success: z.literal(true),
  orderId: z.string(),
  token: z.string(),
  tokenSymbol: z.string(),
  side: orderSideSchema,
  amount: z.string(),
  amountRaw: z.string(),
  tick: z.number(),
  tickPrice: z.string(),
  flipTick: z.number(),
  flipPrice: z.string(),
  status: z.string(),
  behavior: z.string(),
  transactionHash: z.string(),
  blockNumber: z.number(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type PlaceFlipOrderOutput = z.infer<typeof placeFlipOrderOutputSchema>;

// =============================================================================
// cancel_order Schemas
// =============================================================================

/**
 * Input schema for the cancel_order tool.
 */
export const cancelOrderInputSchema = {
  orderId: orderIdSchema,
};

export const cancelOrderInputZodSchema = z.object(cancelOrderInputSchema);
export type CancelOrderInput = z.infer<typeof cancelOrderInputZodSchema>;

/**
 * Output schema for successful cancel_order response.
 */
export const cancelOrderOutputSchema = z.object({
  success: z.literal(true),
  orderId: z.string(),
  cancelledOrder: z.object({
    side: z.string(),
    amount: z.string(),
    filled: z.string(),
    tick: z.number(),
    price: z.string(),
  }),
  refundedAmount: z.string(),
  refundedAmountRaw: z.string(),
  transactionHash: z.string(),
  blockNumber: z.number(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type CancelOrderOutput = z.infer<typeof cancelOrderOutputSchema>;

// =============================================================================
// get_orderbook Schemas
// =============================================================================

/**
 * Input schema for the get_orderbook tool.
 */
export const getOrderbookInputSchema = {
  baseToken: tokenAddressSchema.describe('Base token (e.g., "AlphaUSD")'),
  quoteToken: optionalTokenAddressSchema,
  depth: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Number of price levels to return per side'),
};

export const getOrderbookInputZodSchema = z.object(getOrderbookInputSchema);
export type GetOrderbookInput = z.infer<typeof getOrderbookInputZodSchema>;

/**
 * Output schema for get_orderbook response.
 */
export const getOrderbookOutputSchema = z.object({
  pair: z.string(),
  baseToken: z.string(),
  quoteToken: z.string(),
  midPrice: z.string().nullable(),
  spread: z.string().nullable(),
  spreadPercent: z.string().nullable(),
  asks: z.array(
    z.object({
      price: z.string(),
      tick: z.number(),
      amount: z.string(),
    })
  ),
  bids: z.array(
    z.object({
      price: z.string(),
      tick: z.number(),
      amount: z.string(),
    })
  ),
});

export type GetOrderbookOutput = z.infer<typeof getOrderbookOutputSchema>;

// =============================================================================
// get_my_orders Schemas
// =============================================================================

/**
 * Input schema for the get_my_orders tool.
 */
export const getMyOrdersInputSchema = {
  token: tokenAddressSchema.optional().describe('Filter by token (optional)'),
  status: orderStatusSchema,
};

export const getMyOrdersInputZodSchema = z.object(getMyOrdersInputSchema);
export type GetMyOrdersInput = z.infer<typeof getMyOrdersInputZodSchema>;

/**
 * Output schema for get_my_orders response.
 */
export const getMyOrdersOutputSchema = z.object({
  totalOrders: z.number(),
  orders: z.array(
    z.object({
      orderId: z.string(),
      token: z.string(),
      tokenSymbol: z.string(),
      side: z.string(),
      amount: z.string(),
      filled: z.string(),
      remaining: z.string(),
      tick: z.number(),
      price: z.string(),
      status: z.string(),
      isFlip: z.boolean(),
    })
  ),
});

export type GetMyOrdersOutput = z.infer<typeof getMyOrdersOutputSchema>;

// =============================================================================
// get_order_status Schemas
// =============================================================================

/**
 * Input schema for the get_order_status tool.
 */
export const getOrderStatusInputSchema = {
  orderId: orderIdSchema,
};

export const getOrderStatusInputZodSchema = z.object(getOrderStatusInputSchema);
export type GetOrderStatusInput = z.infer<typeof getOrderStatusInputZodSchema>;

/**
 * Output schema for get_order_status response.
 */
export const getOrderStatusOutputSchema = z.object({
  orderId: z.string(),
  owner: z.string(),
  token: z.string(),
  tokenSymbol: z.string(),
  side: z.string(),
  tick: z.number(),
  price: z.string(),
  amount: z.string(),
  filled: z.string(),
  remaining: z.string(),
  fillPercent: z.string(),
  status: z.string(),
  isFlip: z.boolean(),
});

export type GetOrderStatusOutput = z.infer<typeof getOrderStatusOutputSchema>;

// =============================================================================
// Error Schema (shared)
// =============================================================================

/**
 * Output schema for failed DEX Advanced operation response.
 */
export const dexAdvancedErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.number(),
    message: z.string(),
    details: z
      .object({
        field: z.string().optional(),
        expected: z.string().optional(),
        received: z.string().optional(),
        suggestion: z.string().optional(),
      })
      .optional(),
    recoverable: z.boolean().optional(),
    retryAfter: z.number().optional(),
  }),
});

export type DexAdvancedError = z.infer<typeof dexAdvancedErrorSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a success response for place_limit_order.
 */
export function createPlaceLimitOrderResponse(data: {
  orderId: string;
  token: string;
  tokenSymbol: string;
  side: 'buy' | 'sell';
  amount: string;
  amountRaw: string;
  tick: number;
  price: string;
  transactionHash: string;
  blockNumber: number;
  gasCost: string;
  explorerUrl: string;
}): PlaceLimitOrderOutput {
  return {
    success: true,
    ...data,
    status: 'queued',
    note: 'Order will be added to the orderbook at end of block (MEV protection)',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for place_flip_order.
 */
export function createPlaceFlipOrderResponse(data: {
  orderId: string;
  token: string;
  tokenSymbol: string;
  side: 'buy' | 'sell';
  amount: string;
  amountRaw: string;
  tick: number;
  tickPrice: string;
  flipTick: number;
  flipPrice: string;
  transactionHash: string;
  blockNumber: number;
  gasCost: string;
  explorerUrl: string;
}): PlaceFlipOrderOutput {
  return {
    success: true,
    ...data,
    status: 'queued',
    behavior: 'Order will auto-reverse to opposite side when filled, providing perpetual liquidity',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for cancel_order.
 */
export function createCancelOrderResponse(data: {
  orderId: string;
  cancelledOrder: {
    side: string;
    amount: string;
    filled: string;
    tick: number;
    price: string;
  };
  refundedAmount: string;
  refundedAmountRaw: string;
  transactionHash: string;
  blockNumber: number;
  gasCost: string;
  explorerUrl: string;
}): CancelOrderOutput {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a response for get_orderbook.
 */
export function createGetOrderbookResponse(data: {
  pair: string;
  baseToken: string;
  quoteToken: string;
  midPrice: string | null;
  spread: string | null;
  spreadPercent: string | null;
  asks: Array<{ price: string; tick: number; amount: string }>;
  bids: Array<{ price: string; tick: number; amount: string }>;
}): GetOrderbookOutput {
  return data;
}

/**
 * Create a response for get_my_orders.
 */
export function createGetMyOrdersResponse(data: {
  totalOrders: number;
  orders: Array<{
    orderId: string;
    token: string;
    tokenSymbol: string;
    side: string;
    amount: string;
    filled: string;
    remaining: string;
    tick: number;
    price: string;
    status: string;
    isFlip: boolean;
  }>;
}): GetMyOrdersOutput {
  return data;
}

/**
 * Create a response for get_order_status.
 */
export function createGetOrderStatusResponse(data: {
  orderId: string;
  owner: string;
  token: string;
  tokenSymbol: string;
  side: string;
  tick: number;
  price: string;
  amount: string;
  filled: string;
  remaining: string;
  fillPercent: string;
  status: string;
  isFlip: boolean;
}): GetOrderStatusOutput {
  return data;
}

/**
 * Create an error response for DEX Advanced operations.
 */
export function createDexAdvancedErrorResponse(error: {
  code: number;
  message: string;
  details?: {
    field?: string;
    expected?: string;
    received?: string;
    suggestion?: string;
  };
  recoverable?: boolean;
  retryAfter?: number;
}): DexAdvancedError {
  return {
    success: false,
    error,
  };
}

/**
 * Exchange Tool Schemas
 *
 * Zod schemas for exchange tool inputs and outputs.
 * These define the structure of data flowing through the swap tools.
 */

import { z } from 'zod';

// =============================================================================
// Input Schemas
// =============================================================================

/**
 * Input schema for the get_swap_quote tool.
 *
 * Accepts:
 * - fromToken: Token to sell (address or symbol)
 * - toToken: Token to buy (address or symbol)
 * - amount: Amount to swap in human-readable units
 * - direction: Whether amount is input (exactIn) or output (exactOut)
 */
export const getSwapQuoteInputSchema = {
  fromToken: z
    .string()
    .min(1)
    .describe(
      'Token to sell - address or symbol (e.g., "AlphaUSD" or "0x20c0...")'
    ),
  toToken: z
    .string()
    .min(1)
    .describe(
      'Token to buy - address or symbol (e.g., "BetaUSD" or "0x20c0...")'
    ),
  amount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Invalid amount format')
    .describe('Amount to swap in human-readable units (e.g., "100" or "100.50")'),
  direction: z
    .enum(['exactIn', 'exactOut'])
    .default('exactIn')
    .describe(
      'Swap direction: "exactIn" = specify sell amount, "exactOut" = specify buy amount'
    ),
};

/**
 * Zod object schema for get_swap_quote validation.
 */
export const getSwapQuoteInputZodSchema = z.object(getSwapQuoteInputSchema);

/**
 * TypeScript type for get_swap_quote input.
 */
export type GetSwapQuoteInput = z.infer<typeof getSwapQuoteInputZodSchema>;

/**
 * Input schema for the swap_stablecoins tool.
 *
 * Extends get_swap_quote with slippage tolerance.
 */
export const swapStablecoinsInputSchema = {
  ...getSwapQuoteInputSchema,
  slippageTolerance: z
    .number()
    .min(0.1, 'Slippage must be at least 0.1%')
    .max(5, 'Slippage cannot exceed 5%')
    .default(0.5)
    .describe(
      'Maximum slippage tolerance percentage (0.1-5%). Default: 0.5%'
    ),
};

/**
 * Zod object schema for swap_stablecoins validation.
 */
export const swapStablecoinsInputZodSchema = z.object(swapStablecoinsInputSchema);

/**
 * TypeScript type for swap_stablecoins input.
 */
export type SwapStablecoinsInput = z.infer<typeof swapStablecoinsInputZodSchema>;

// =============================================================================
// Output Schemas
// =============================================================================

/**
 * Output schema for successful get_swap_quote response.
 */
export const getSwapQuoteOutputSchema = z.object({
  /** Token being sold (address) */
  fromToken: z.string(),
  /** Token being sold (symbol) */
  fromTokenSymbol: z.string(),
  /** Token being bought (address) */
  toToken: z.string(),
  /** Token being bought (symbol) */
  toTokenSymbol: z.string(),
  /** Amount of fromToken to spend */
  amountIn: z.string(),
  /** Amount of toToken to receive */
  amountOut: z.string(),
  /** Exchange rate (amountOut / amountIn) */
  rate: z.string(),
  /** Inverse exchange rate (amountIn / amountOut) */
  inverseRate: z.string(),
  /** Direction of the quote */
  direction: z.enum(['exactIn', 'exactOut']),
  /** Seconds until quote expires */
  validFor: z.number(),
});

/**
 * TypeScript type for successful get_swap_quote output.
 */
export type GetSwapQuoteOutput = z.infer<typeof getSwapQuoteOutputSchema>;

/**
 * Output schema for successful swap_stablecoins response.
 */
export const swapStablecoinsOutputSchema = z.object({
  /** Whether the swap succeeded */
  success: z.literal(true),
  /** Transaction hash */
  transactionHash: z.string(),
  /** Block number where tx was included */
  blockNumber: z.number(),
  /** Token sold (address) */
  fromToken: z.string(),
  /** Token sold (symbol) */
  fromTokenSymbol: z.string(),
  /** Token bought (address) */
  toToken: z.string(),
  /** Token bought (symbol) */
  toTokenSymbol: z.string(),
  /** Amount of fromToken spent */
  amountIn: z.string(),
  /** Amount of toToken received */
  amountOut: z.string(),
  /** Effective exchange rate achieved */
  effectiveRate: z.string(),
  /** Actual slippage percentage (can be negative if better than quoted) */
  slippage: z.string(),
  /** Gas cost in fee token units */
  gasCost: z.string(),
  /** URL to view transaction on block explorer */
  explorerUrl: z.string(),
  /** ISO 8601 timestamp of transaction */
  timestamp: z.string(),
});

/**
 * TypeScript type for successful swap_stablecoins output.
 */
export type SwapStablecoinsOutput = z.infer<typeof swapStablecoinsOutputSchema>;

/**
 * Output schema for failed exchange tool response.
 */
export const exchangeErrorSchema = z.object({
  /** Indicates failure */
  success: z.literal(false),
  /** Error details */
  error: z.object({
    /** Numeric error code */
    code: z.number(),
    /** Human-readable error message */
    message: z.string(),
    /** Additional error details */
    details: z
      .object({
        field: z.string().optional(),
        expected: z.string().optional(),
        received: z.string().optional(),
        suggestion: z.string().optional(),
      })
      .optional(),
    /** Whether the error is recoverable */
    recoverable: z.boolean().optional(),
    /** Seconds to wait before retry */
    retryAfter: z.number().optional(),
  }),
});

/**
 * TypeScript type for failed exchange tool output.
 */
export type ExchangeError = z.infer<typeof exchangeErrorSchema>;

/**
 * Combined output type for get_swap_quote.
 */
export type GetSwapQuoteResult = GetSwapQuoteOutput | ExchangeError;

/**
 * Combined output type for swap_stablecoins.
 */
export type SwapStablecoinsResult = SwapStablecoinsOutput | ExchangeError;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a quote response object.
 */
export function createQuoteResponse(data: {
  fromToken: string;
  fromTokenSymbol: string;
  toToken: string;
  toTokenSymbol: string;
  amountIn: string;
  amountOut: string;
  rate: string;
  inverseRate: string;
  direction: 'exactIn' | 'exactOut';
}): GetSwapQuoteOutput {
  return {
    ...data,
    validFor: 60, // Quote valid for 60 seconds
  };
}

/**
 * Create a swap success response object.
 */
export function createSwapSuccessResponse(data: {
  transactionHash: string;
  blockNumber: number;
  fromToken: string;
  fromTokenSymbol: string;
  toToken: string;
  toTokenSymbol: string;
  amountIn: string;
  amountOut: string;
  effectiveRate: string;
  slippage: string;
  gasCost: string;
  explorerUrl: string;
}): SwapStablecoinsOutput {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error response object.
 */
export function createExchangeErrorResponse(error: {
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
}): ExchangeError {
  return {
    success: false,
    error,
  };
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate get_swap_quote input.
 */
export function validateGetSwapQuoteInput(input: unknown): GetSwapQuoteInput {
  return getSwapQuoteInputZodSchema.parse(input);
}

/**
 * Validate swap_stablecoins input.
 */
export function validateSwapStablecoinsInput(input: unknown): SwapStablecoinsInput {
  return swapStablecoinsInputZodSchema.parse(input);
}

/**
 * Safe parse get_swap_quote input.
 */
export function safeParseGetSwapQuoteInput(
  input: unknown
): z.SafeParseReturnType<unknown, GetSwapQuoteInput> {
  return getSwapQuoteInputZodSchema.safeParse(input);
}

/**
 * Safe parse swap_stablecoins input.
 */
export function safeParseSwapStablecoinsInput(
  input: unknown
): z.SafeParseReturnType<unknown, SwapStablecoinsInput> {
  return swapStablecoinsInputZodSchema.safeParse(input);
}

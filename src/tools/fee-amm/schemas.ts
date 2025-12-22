/**
 * Fee AMM Tool Schemas
 *
 * Zod schemas for Fee AMM liquidity management tool inputs and outputs.
 * These define the structure of data flowing through Fee AMM tools:
 * - get_fee_pool_info: Get pool reserves and statistics
 * - add_fee_liquidity: Add liquidity to a fee pool
 * - remove_fee_liquidity: Remove liquidity from a fee pool
 * - get_lp_position: Get LP token balance and underlying value
 * - estimate_fee_swap: Estimate output for a fee token swap
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
    'Validator token address or alias (defaults to PathUSD if not specified)'
  );

const accountAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .optional()
  .describe('Account address to query (defaults to configured wallet address)');

const amountSchema = z
  .string()
  .min(1)
  .describe('Amount in human-readable units (e.g., "1000.50")');

// =============================================================================
// get_fee_pool_info Schemas
// =============================================================================

/**
 * Input schema for the get_fee_pool_info tool.
 */
export const getFeePoolInfoInputSchema = {
  userToken: tokenAddressSchema.describe('User fee token address or symbol'),
  validatorToken: optionalTokenAddressSchema,
};

export const getFeePoolInfoInputZodSchema = z.object(getFeePoolInfoInputSchema);
export type GetFeePoolInfoInput = z.infer<typeof getFeePoolInfoInputZodSchema>;

/**
 * Output schema for get_fee_pool_info response.
 */
export const getFeePoolInfoOutputSchema = z.object({
  pool: z.string().describe('Pool identifier (e.g., "AlphaUSD/PathUSD")'),
  userToken: z.object({
    address: z.string(),
    symbol: z.string().optional(),
    reserve: z.string(),
    reserveRaw: z.string(),
  }),
  validatorToken: z.object({
    address: z.string(),
    symbol: z.string().optional(),
    reserve: z.string(),
    reserveRaw: z.string(),
  }),
  totalLpSupply: z.string(),
  totalLpSupplyRaw: z.string(),
  swapRate: z.number(),
  protocolFee: z.string(),
});

export type GetFeePoolInfoOutput = z.infer<typeof getFeePoolInfoOutputSchema>;

// =============================================================================
// add_fee_liquidity Schemas
// =============================================================================

/**
 * Input schema for the add_fee_liquidity tool.
 */
export const addFeeLiquidityInputSchema = {
  userToken: tokenAddressSchema.describe('User fee token to add'),
  validatorToken: optionalTokenAddressSchema,
  amountUserToken: amountSchema.describe('Amount of user token to add'),
  amountValidatorToken: amountSchema.describe('Amount of validator token to add'),
};

export const addFeeLiquidityInputZodSchema = z.object(addFeeLiquidityInputSchema);
export type AddFeeLiquidityInput = z.infer<typeof addFeeLiquidityInputZodSchema>;

/**
 * Output schema for successful add_fee_liquidity response.
 */
export const addFeeLiquidityOutputSchema = z.object({
  success: z.literal(true),
  lpTokensMinted: z.string(),
  lpTokensMintedRaw: z.string(),
  userTokenAdded: z.string(),
  validatorTokenAdded: z.string(),
  poolShare: z.string(),
  transactionHash: z.string(),
  blockNumber: z.number(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  message: z.string(),
  timestamp: z.string(),
});

export type AddFeeLiquidityOutput = z.infer<typeof addFeeLiquidityOutputSchema>;

// =============================================================================
// remove_fee_liquidity Schemas
// =============================================================================

/**
 * Input schema for the remove_fee_liquidity tool.
 */
export const removeFeeLiquidityInputSchema = {
  userToken: tokenAddressSchema.describe('User fee token in the pool'),
  validatorToken: optionalTokenAddressSchema,
  lpTokenAmount: amountSchema.describe('Amount of LP tokens to burn'),
};

export const removeFeeLiquidityInputZodSchema = z.object(removeFeeLiquidityInputSchema);
export type RemoveFeeLiquidityInput = z.infer<typeof removeFeeLiquidityInputZodSchema>;

/**
 * Output schema for successful remove_fee_liquidity response.
 */
export const removeFeeLiquidityOutputSchema = z.object({
  success: z.literal(true),
  lpTokensBurned: z.string(),
  userTokenReceived: z.string(),
  userTokenReceivedRaw: z.string(),
  validatorTokenReceived: z.string(),
  validatorTokenReceivedRaw: z.string(),
  transactionHash: z.string(),
  blockNumber: z.number(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  message: z.string(),
  timestamp: z.string(),
});

export type RemoveFeeLiquidityOutput = z.infer<typeof removeFeeLiquidityOutputSchema>;

// =============================================================================
// get_lp_position Schemas
// =============================================================================

/**
 * Input schema for the get_lp_position tool.
 */
export const getLpPositionInputSchema = {
  userToken: tokenAddressSchema.describe('User fee token in the pool'),
  validatorToken: optionalTokenAddressSchema,
  address: accountAddressSchema,
};

export const getLpPositionInputZodSchema = z.object(getLpPositionInputSchema);
export type GetLpPositionInput = z.infer<typeof getLpPositionInputZodSchema>;

/**
 * Output schema for get_lp_position response.
 */
export const getLpPositionOutputSchema = z.object({
  pool: z.string().describe('Pool identifier'),
  address: z.string(),
  lpBalance: z.string(),
  lpBalanceRaw: z.string(),
  shareOfPool: z.string(),
  underlyingValue: z.object({
    userToken: z.string(),
    userTokenRaw: z.string(),
    validatorToken: z.string(),
    validatorTokenRaw: z.string(),
    total: z.string(),
  }),
});

export type GetLpPositionOutput = z.infer<typeof getLpPositionOutputSchema>;

// =============================================================================
// estimate_fee_swap Schemas
// =============================================================================

/**
 * Input schema for the estimate_fee_swap tool.
 */
export const estimateFeeSwapInputSchema = {
  fromToken: tokenAddressSchema.describe('Token to swap from'),
  toToken: tokenAddressSchema.describe('Token to swap to'),
  amount: amountSchema.describe('Amount to swap'),
};

export const estimateFeeSwapInputZodSchema = z.object(estimateFeeSwapInputSchema);
export type EstimateFeeSwapInput = z.infer<typeof estimateFeeSwapInputZodSchema>;

/**
 * Output schema for estimate_fee_swap response.
 */
export const estimateFeeSwapOutputSchema = z.object({
  fromToken: z.string(),
  toToken: z.string(),
  amountIn: z.string(),
  amountInRaw: z.string(),
  amountOut: z.string(),
  amountOutRaw: z.string(),
  effectiveRate: z.string(),
  slippage: z.string(),
});

export type EstimateFeeSwapOutput = z.infer<typeof estimateFeeSwapOutputSchema>;

// =============================================================================
// Error Schema (shared)
// =============================================================================

/**
 * Output schema for failed Fee AMM operation response.
 */
export const feeAmmOperationErrorSchema = z.object({
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

export type FeeAmmOperationError = z.infer<typeof feeAmmOperationErrorSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a response for get_fee_pool_info.
 */
export function createGetFeePoolInfoResponse(data: {
  pool: string;
  userToken: {
    address: string;
    symbol?: string;
    reserve: string;
    reserveRaw: string;
  };
  validatorToken: {
    address: string;
    symbol?: string;
    reserve: string;
    reserveRaw: string;
  };
  totalLpSupply: string;
  totalLpSupplyRaw: string;
  swapRate: number;
}): GetFeePoolInfoOutput {
  return {
    ...data,
    protocolFee: '0.15%',
  };
}

/**
 * Create a success response for add_fee_liquidity.
 */
export function createAddFeeLiquidityResponse(data: {
  lpTokensMinted: string;
  lpTokensMintedRaw: string;
  userTokenAdded: string;
  validatorTokenAdded: string;
  poolShare: string;
  transactionHash: string;
  blockNumber: number;
  gasCost: string;
  explorerUrl: string;
}): AddFeeLiquidityOutput {
  return {
    success: true,
    ...data,
    message: `Successfully added liquidity. Minted ${data.lpTokensMinted} LP tokens (${data.poolShare} of pool).`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for remove_fee_liquidity.
 */
export function createRemoveFeeLiquidityResponse(data: {
  lpTokensBurned: string;
  userTokenReceived: string;
  userTokenReceivedRaw: string;
  validatorTokenReceived: string;
  validatorTokenReceivedRaw: string;
  transactionHash: string;
  blockNumber: number;
  gasCost: string;
  explorerUrl: string;
}): RemoveFeeLiquidityOutput {
  return {
    success: true,
    ...data,
    message: `Successfully removed liquidity. Received ${data.userTokenReceived} user tokens and ${data.validatorTokenReceived} validator tokens.`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a response for get_lp_position.
 */
export function createGetLpPositionResponse(data: {
  pool: string;
  address: string;
  lpBalance: string;
  lpBalanceRaw: string;
  shareOfPool: string;
  underlyingValue: {
    userToken: string;
    userTokenRaw: string;
    validatorToken: string;
    validatorTokenRaw: string;
    total: string;
  };
}): GetLpPositionOutput {
  return data;
}

/**
 * Create a response for estimate_fee_swap.
 */
export function createEstimateFeeSwapResponse(data: {
  fromToken: string;
  toToken: string;
  amountIn: string;
  amountInRaw: string;
  amountOut: string;
  amountOutRaw: string;
  effectiveRate: string;
  slippage: string;
}): EstimateFeeSwapOutput {
  return data;
}

/**
 * Create an error response for Fee AMM operations.
 */
export function createFeeAmmErrorResponse(error: {
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
}): FeeAmmOperationError {
  return {
    success: false,
    error,
  };
}

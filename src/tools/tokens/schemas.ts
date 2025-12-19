/**
 * Token Tool Schemas
 *
 * Zod schemas for token operation tool inputs and outputs.
 * These define the structure of data flowing through token tools:
 * - create_token: Deploy new TIP-20 token
 * - get_token_info: Get token metadata
 * - mint_tokens: Mint tokens to address
 * - burn_tokens: Burn tokens from balance
 */

import { z } from 'zod';

// =============================================================================
// create_token Schemas
// =============================================================================

/**
 * Input schema for the create_token tool.
 *
 * Accepts:
 * - name: Token name (e.g., "Acme Dollar")
 * - symbol: Token symbol (e.g., "ACME")
 * - currency: Currency identifier (defaults to "USD")
 * - quoteToken: Quote token address (defaults to pathUSD)
 */
export const createTokenInputSchema = {
  name: z
    .string()
    .min(1)
    .max(64)
    .describe('Token name (e.g., "Acme Dollar")'),
  symbol: z
    .string()
    .min(1)
    .max(10)
    .describe('Token symbol (e.g., "ACME")'),
  currency: z
    .string()
    .min(1)
    .max(10)
    .default('USD')
    .describe('Currency identifier (e.g., "USD", "EUR")'),
  quoteToken: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid quote token address')
    .optional()
    .describe('Quote token address (defaults to pathUSD)'),
};

export const createTokenInputZodSchema = z.object(createTokenInputSchema);
export type CreateTokenInput = z.infer<typeof createTokenInputZodSchema>;

/**
 * Output schema for successful create_token response.
 */
export const createTokenOutputSchema = z.object({
  /** Whether the operation succeeded */
  success: z.literal(true),
  /** Deployed token contract address */
  tokenAddress: z.string(),
  /** Transaction hash */
  transactionHash: z.string(),
  /** Block number where tx was included */
  blockNumber: z.number(),
  /** Token name */
  name: z.string(),
  /** Token symbol */
  symbol: z.string(),
  /** Token decimals (always 6 for TIP-20) */
  decimals: z.literal(6),
  /** Currency identifier */
  currency: z.string(),
  /** Admin address (receives DEFAULT_ADMIN_ROLE) */
  admin: z.string(),
  /** Quote token used for pricing */
  quoteToken: z.string(),
  /** Gas cost in fee token units */
  gasCost: z.string(),
  /** URL to view transaction on block explorer */
  explorerUrl: z.string(),
  /** ISO 8601 timestamp */
  timestamp: z.string(),
});

export type CreateTokenOutput = z.infer<typeof createTokenOutputSchema>;

// =============================================================================
// get_token_info Schemas
// =============================================================================

/**
 * Input schema for the get_token_info tool.
 */
export const getTokenInfoInputSchema = {
  token: z
    .string()
    .min(1)
    .describe('Token address or symbol (e.g., "AlphaUSD" or "0x20c0...")'),
};

export const getTokenInfoInputZodSchema = z.object(getTokenInfoInputSchema);
export type GetTokenInfoInput = z.infer<typeof getTokenInfoInputZodSchema>;

/**
 * Output schema for successful get_token_info response.
 */
export const getTokenInfoOutputSchema = z.object({
  /** Token contract address */
  address: z.string(),
  /** Token name */
  name: z.string(),
  /** Token symbol */
  symbol: z.string(),
  /** Token decimals */
  decimals: z.number(),
  /** Total supply in human-readable units */
  totalSupply: z.string(),
  /** Total supply in smallest units (wei) */
  totalSupplyRaw: z.string(),
});

export type GetTokenInfoOutput = z.infer<typeof getTokenInfoOutputSchema>;

// =============================================================================
// mint_tokens Schemas
// =============================================================================

/**
 * Input schema for the mint_tokens tool.
 *
 * Accepts:
 * - token: Token address or symbol
 * - to: Recipient address
 * - amount: Amount to mint in human-readable units
 * - memo: Optional 32-byte memo
 */
export const mintTokensInputSchema = {
  token: z
    .string()
    .min(1)
    .describe('Token address or symbol'),
  to: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address format')
    .describe('Recipient address (0x-prefixed 40-character hex string)'),
  amount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Invalid amount format')
    .describe('Amount to mint in human-readable units (e.g., "1000" or "1000.50")'),
  memo: z
    .string()
    .max(32, 'Memo must be 32 bytes or less when UTF-8 encoded')
    .optional()
    .describe('Optional memo for tracking (max 32 bytes)'),
};

export const mintTokensInputZodSchema = z.object(mintTokensInputSchema);
export type MintTokensInput = z.infer<typeof mintTokensInputZodSchema>;

/**
 * Output schema for successful mint_tokens response.
 */
export const mintTokensOutputSchema = z.object({
  /** Whether the operation succeeded */
  success: z.literal(true),
  /** Transaction hash */
  transactionHash: z.string(),
  /** Block number where tx was included */
  blockNumber: z.number(),
  /** Token contract address */
  token: z.string(),
  /** Token symbol */
  tokenSymbol: z.string(),
  /** Recipient address */
  to: z.string(),
  /** Amount minted in human-readable units */
  amount: z.string(),
  /** Amount minted in smallest units (wei) */
  amountRaw: z.string(),
  /** Memo if provided, null otherwise */
  memo: z.string().nullable(),
  /** Gas cost in fee token units */
  gasCost: z.string(),
  /** URL to view transaction on block explorer */
  explorerUrl: z.string(),
  /** ISO 8601 timestamp */
  timestamp: z.string(),
});

export type MintTokensOutput = z.infer<typeof mintTokensOutputSchema>;

// =============================================================================
// burn_tokens Schemas
// =============================================================================

/**
 * Input schema for the burn_tokens tool.
 *
 * Accepts:
 * - token: Token address or symbol
 * - amount: Amount to burn in human-readable units
 * - memo: Optional 32-byte memo
 */
export const burnTokensInputSchema = {
  token: z
    .string()
    .min(1)
    .describe('Token address or symbol'),
  amount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Invalid amount format')
    .describe('Amount to burn in human-readable units (e.g., "1000" or "1000.50")'),
  memo: z
    .string()
    .max(32, 'Memo must be 32 bytes or less when UTF-8 encoded')
    .optional()
    .describe('Optional memo for tracking (max 32 bytes)'),
};

export const burnTokensInputZodSchema = z.object(burnTokensInputSchema);
export type BurnTokensInput = z.infer<typeof burnTokensInputZodSchema>;

/**
 * Output schema for successful burn_tokens response.
 */
export const burnTokensOutputSchema = z.object({
  /** Whether the operation succeeded */
  success: z.literal(true),
  /** Transaction hash */
  transactionHash: z.string(),
  /** Block number where tx was included */
  blockNumber: z.number(),
  /** Token contract address */
  token: z.string(),
  /** Token symbol */
  tokenSymbol: z.string(),
  /** Amount burned in human-readable units */
  amount: z.string(),
  /** Amount burned in smallest units (wei) */
  amountRaw: z.string(),
  /** Memo if provided, null otherwise */
  memo: z.string().nullable(),
  /** Gas cost in fee token units */
  gasCost: z.string(),
  /** URL to view transaction on block explorer */
  explorerUrl: z.string(),
  /** ISO 8601 timestamp */
  timestamp: z.string(),
});

export type BurnTokensOutput = z.infer<typeof burnTokensOutputSchema>;

// =============================================================================
// Error Schema (shared)
// =============================================================================

/**
 * Output schema for failed token operation response.
 */
export const tokenOperationErrorSchema = z.object({
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

export type TokenOperationError = z.infer<typeof tokenOperationErrorSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a success response for create_token.
 */
export function createCreateTokenResponse(data: {
  tokenAddress: string;
  transactionHash: string;
  blockNumber: number;
  name: string;
  symbol: string;
  currency: string;
  admin: string;
  quoteToken: string;
  gasCost: string;
  explorerUrl: string;
}): CreateTokenOutput {
  return {
    success: true,
    ...data,
    decimals: 6, // TIP-20 tokens always have 6 decimals
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for mint_tokens.
 */
export function createMintTokensResponse(data: {
  transactionHash: string;
  blockNumber: number;
  token: string;
  tokenSymbol: string;
  to: string;
  amount: string;
  amountRaw: string;
  memo: string | null;
  gasCost: string;
  explorerUrl: string;
}): MintTokensOutput {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for burn_tokens.
 */
export function createBurnTokensResponse(data: {
  transactionHash: string;
  blockNumber: number;
  token: string;
  tokenSymbol: string;
  amount: string;
  amountRaw: string;
  memo: string | null;
  gasCost: string;
  explorerUrl: string;
}): BurnTokensOutput {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error response for token operations.
 */
export function createTokenErrorResponse(error: {
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
}): TokenOperationError {
  return {
    success: false,
    error,
  };
}

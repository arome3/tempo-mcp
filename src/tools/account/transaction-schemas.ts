/**
 * Transaction Tools Schemas
 *
 * Zod schemas for transaction-related MCP tools including transaction
 * lookups and gas estimation.
 */

import { z } from 'zod';

// =============================================================================
// get_transaction Schemas
// =============================================================================

/**
 * Input schema for get_transaction tool.
 */
export const getTransactionInputSchema = {
  hash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash format')
    .describe('Transaction hash (66 characters including 0x prefix)'),
};

/**
 * Token transfer info embedded in transaction response.
 */
export const tokenTransferInfoSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  amount: z.string(),
  amountRaw: z.string(),
  decimals: z.number(),
});

/**
 * Output schema for get_transaction tool.
 */
export const getTransactionOutputSchema = z.object({
  hash: z.string(),
  blockNumber: z.number().nullable(),
  blockHash: z.string().nullable(),
  from: z.string(),
  to: z.string().nullable(),
  value: z.string(),
  status: z.enum(['success', 'reverted', 'pending']),
  type: z.string(),
  token: tokenTransferInfoSchema.nullable(),
  memo: z.string().nullable(),
  memoDecoded: z.string().nullable(),
  gasUsed: z.string(),
  gasPrice: z.string(),
  gasCost: z.string(),
  timestamp: z.string().nullable(),
  confirmations: z.number(),
  explorerUrl: z.string(),
});

/** Type for get_transaction input */
export type GetTransactionInput = {
  hash: string;
};

/** Type for get_transaction output */
export type GetTransactionOutput = z.infer<typeof getTransactionOutputSchema>;

/** Type for token transfer info */
export type TokenTransferInfo = z.infer<typeof tokenTransferInfoSchema>;

// =============================================================================
// get_gas_estimate Schemas
// =============================================================================

/**
 * Input schema for get_gas_estimate tool.
 */
export const getGasEstimateInputSchema = {
  to: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
    .describe('Destination address (42 characters including 0x prefix)'),
  data: z
    .string()
    .regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex data format')
    .optional()
    .describe('Transaction data (hex encoded, optional)'),
  value: z
    .string()
    .regex(/^\d+$/, 'Value must be a non-negative integer')
    .optional()
    .describe('Value to send in wei (optional, defaults to 0)'),
};

/**
 * Output schema for get_gas_estimate tool.
 */
export const getGasEstimateOutputSchema = z.object({
  gasLimit: z.string(),
  gasPrice: z.string(),
  maxFeePerGas: z.string().nullable(),
  maxPriorityFeePerGas: z.string().nullable(),
  estimatedCost: z.string(),
  estimatedCostFormatted: z.string(),
  feeToken: z.string(),
  feeTokenSymbol: z.string(),
});

/** Type for get_gas_estimate input */
export type GetGasEstimateInput = {
  to: string;
  data?: string;
  value?: string;
};

/** Type for get_gas_estimate output */
export type GetGasEstimateOutput = z.infer<typeof getGasEstimateOutputSchema>;

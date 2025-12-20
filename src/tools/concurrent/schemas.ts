/**
 * Concurrent Transaction Tool Schemas
 *
 * Zod schemas for concurrent transaction tool inputs and outputs.
 * These define the structure of data flowing through concurrent transaction tools:
 * - send_concurrent_payments: Send multiple payments in parallel using different nonce keys
 * - get_nonce_for_key: Get the current nonce for a specific nonce key
 * - list_active_nonce_keys: List all active nonce keys for an address
 */

import { z } from 'zod';

// =============================================================================
// Shared Schema Parts
// =============================================================================

const tokenAddressSchema = z
  .string()
  .min(1)
  .describe(
    'TIP-20 token address (0x-prefixed 40-character hex string) or token symbol (e.g., "AlphaUSD")'
  );

const recipientAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .describe('Recipient address (0x-prefixed 40-character hex string)');

const amountSchema = z
  .string()
  .min(1)
  .describe('Amount to send in human-readable format (e.g., "100.50")');

const memoSchema = z
  .string()
  .max(32)
  .optional()
  .describe(
    'Optional memo for reconciliation (max 32 characters, will be padded to 32 bytes)'
  );

const ethereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .optional()
  .describe('Ethereum address (0x-prefixed 40-character hex string)');

const nonceKeySchema = z
  .number()
  .int()
  .min(0)
  .max(255)
  .describe('Nonce key for parallel execution channel (0-255)');

// =============================================================================
// Payment Item Schema (for concurrent payments array)
// =============================================================================

const concurrentPaymentItemSchema = z.object({
  token: tokenAddressSchema,
  to: recipientAddressSchema,
  amount: amountSchema,
  memo: memoSchema,
});

export type ConcurrentPaymentItem = z.infer<typeof concurrentPaymentItemSchema>;

// =============================================================================
// send_concurrent_payments Schemas
// =============================================================================

/**
 * Input schema for the send_concurrent_payments tool.
 */
export const sendConcurrentPaymentsInputSchema = {
  payments: z
    .array(concurrentPaymentItemSchema)
    .min(2, 'At least 2 payments required for concurrent execution')
    .max(256, 'Maximum 256 payments per call (limited by nonce key range)')
    .describe('Array of payments to execute concurrently'),
  startNonceKey: z
    .number()
    .int()
    .min(0)
    .max(255)
    .default(1)
    .describe(
      'Starting nonce key for parallel execution (default: 1, reserving key 0 for sequential transactions)'
    ),
  waitForConfirmation: z
    .boolean()
    .default(true)
    .describe('Wait for all transactions to be confirmed before returning'),
};

export const sendConcurrentPaymentsInputZodSchema = z.object(
  sendConcurrentPaymentsInputSchema
);
export type SendConcurrentPaymentsInput = z.infer<
  typeof sendConcurrentPaymentsInputZodSchema
>;

/**
 * Single transaction result in concurrent payments response.
 */
const concurrentTransactionResultSchema = z.object({
  nonceKey: z.number(),
  transactionHash: z.string().nullable(),
  to: z.string(),
  amount: z.string(),
  token: z.string(),
  tokenSymbol: z.string(),
  memo: z.string().nullable(),
  status: z.enum(['confirmed', 'pending', 'failed']),
  error: z.string().optional(),
  explorerUrl: z.string().optional(),
});

export type ConcurrentTransactionResult = z.infer<
  typeof concurrentTransactionResultSchema
>;

/**
 * Output schema for successful send_concurrent_payments response.
 */
export const sendConcurrentPaymentsOutputSchema = z.object({
  success: z.boolean(),
  totalPayments: z.number(),
  confirmedPayments: z.number(),
  failedPayments: z.number(),
  pendingPayments: z.number(),
  transactions: z.array(concurrentTransactionResultSchema),
  totalAmount: z.string(),
  totalDuration: z.string(),
  chunksProcessed: z.number().optional(),
  timestamp: z.string(),
});

export type SendConcurrentPaymentsOutput = z.infer<
  typeof sendConcurrentPaymentsOutputSchema
>;

// =============================================================================
// get_nonce_for_key Schemas
// =============================================================================

/**
 * Input schema for the get_nonce_for_key tool.
 */
export const getNonceForKeyInputSchema = {
  nonceKey: nonceKeySchema.describe('The nonce key to query (0-255)'),
  address: ethereumAddressSchema.describe(
    'Address to query (defaults to configured wallet)'
  ),
};

export const getNonceForKeyInputZodSchema = z.object(getNonceForKeyInputSchema);
export type GetNonceForKeyInput = z.infer<typeof getNonceForKeyInputZodSchema>;

/**
 * Output schema for get_nonce_for_key response.
 */
export const getNonceForKeyOutputSchema = z.object({
  nonceKey: z.number(),
  nonce: z.string(),
  address: z.string(),
});

export type GetNonceForKeyOutput = z.infer<typeof getNonceForKeyOutputSchema>;

// =============================================================================
// list_active_nonce_keys Schemas
// =============================================================================

/**
 * Input schema for the list_active_nonce_keys tool.
 */
export const listActiveNonceKeysInputSchema = {
  address: ethereumAddressSchema.describe(
    'Address to query (defaults to configured wallet)'
  ),
};

export const listActiveNonceKeysInputZodSchema = z.object(
  listActiveNonceKeysInputSchema
);
export type ListActiveNonceKeysInput = z.infer<
  typeof listActiveNonceKeysInputZodSchema
>;

/**
 * Single nonce key info in list response.
 */
const nonceKeyInfoSchema = z.object({
  nonceKey: z.number(),
  currentNonce: z.string(),
  transactionsExecuted: z.string(),
});

export type NonceKeyInfo = z.infer<typeof nonceKeyInfoSchema>;

/**
 * Output schema for list_active_nonce_keys response.
 */
export const listActiveNonceKeysOutputSchema = z.object({
  address: z.string(),
  activeKeys: z.array(nonceKeyInfoSchema),
  totalActiveKeys: z.number(),
});

export type ListActiveNonceKeysOutput = z.infer<
  typeof listActiveNonceKeysOutputSchema
>;

// =============================================================================
// Error Schema (shared)
// =============================================================================

/**
 * Output schema for failed concurrent operation response.
 */
export const concurrentErrorSchema = z.object({
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

export type ConcurrentError = z.infer<typeof concurrentErrorSchema>;

// =============================================================================
// Response Helper Functions
// =============================================================================

/**
 * Create a success response for send_concurrent_payments.
 */
export function createConcurrentPaymentsResponse(data: {
  success: boolean;
  totalPayments: number;
  confirmedPayments: number;
  failedPayments: number;
  pendingPayments: number;
  transactions: ConcurrentTransactionResult[];
  totalAmount: string;
  totalDuration: string;
  chunksProcessed?: number;
}): SendConcurrentPaymentsOutput {
  return {
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a response for get_nonce_for_key.
 */
export function createGetNonceForKeyResponse(data: {
  nonceKey: number;
  nonce: string;
  address: string;
}): GetNonceForKeyOutput {
  return data;
}

/**
 * Create a response for list_active_nonce_keys.
 */
export function createListActiveNonceKeysResponse(data: {
  address: string;
  activeKeys: NonceKeyInfo[];
  totalActiveKeys: number;
}): ListActiveNonceKeysOutput {
  return data;
}

/**
 * Create an error response for concurrent operations.
 */
export function createConcurrentErrorResponse(error: {
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
}): ConcurrentError {
  return {
    success: false,
    error,
  };
}

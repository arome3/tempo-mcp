/**
 * Batch Payment Tool Schemas
 *
 * Zod schemas for batch payment tool inputs and outputs.
 * Batch payments enable atomic multi-recipient transfers
 * where all payments succeed or all fail together.
 */

import { z } from 'zod';

// =============================================================================
// Input Schemas
// =============================================================================

/**
 * Schema for a single payment item in a batch.
 */
export const batchPaymentItemSchema = z.object({
  /** Recipient address (0x-prefixed 40-character hex) */
  to: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format')
    .describe('Recipient address (0x-prefixed 40-character hex string)'),
  /** Amount in human-readable units */
  amount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Invalid amount format')
    .describe('Amount in human-readable units (e.g., "100" or "100.50")'),
  /** Optional memo for reconciliation */
  memo: z
    .string()
    .max(32, 'Memo must be 32 bytes or less when UTF-8 encoded')
    .optional()
    .describe('Optional memo for invoice reconciliation (max 32 bytes)'),
  /** Optional human-readable label for the recipient */
  label: z
    .string()
    .max(100)
    .optional()
    .describe('Human-readable label for recipient (e.g., employee name)'),
});

/**
 * Input schema for the batch_payments tool.
 *
 * Accepts:
 * - token: Token address or symbol for all payments
 * - payments: Array of payment objects with to, amount, optional memo and label
 */
export const batchPaymentsInputSchema = {
  token: z
    .string()
    .min(1)
    .describe(
      'TIP-20 token address or symbol for all payments (e.g., "AlphaUSD" or "0x20c0...")'
    ),
  payments: z
    .array(batchPaymentItemSchema)
    .min(1, 'At least one payment is required')
    .max(100, 'Maximum 100 payments per batch')
    .describe('Array of payment objects with recipient, amount, and optional memo'),
};

/**
 * Zod object schema for validation.
 */
export const batchPaymentsInputZodSchema = z.object(batchPaymentsInputSchema);

/**
 * TypeScript type for a single batch payment item.
 */
export type BatchPaymentItem = z.infer<typeof batchPaymentItemSchema>;

/**
 * TypeScript type for batch_payments input.
 */
export type BatchPaymentsInput = z.infer<typeof batchPaymentsInputZodSchema>;

// =============================================================================
// Output Schemas
// =============================================================================

/**
 * Schema for a single payment result in the output.
 */
export const batchPaymentResultItemSchema = z.object({
  /** Recipient address */
  to: z.string(),
  /** Amount sent */
  amount: z.string(),
  /** Memo if provided, null otherwise */
  memo: z.string().nullable(),
  /** Label if provided, null otherwise */
  label: z.string().nullable(),
  /** Payment status (always 'success' for atomic batch) */
  status: z.enum(['success', 'included']),
});

/**
 * Output schema for successful batch_payments response.
 */
export const batchPaymentsOutputSchema = z.object({
  /** Whether the batch succeeded */
  success: z.literal(true),
  /** Transaction hash */
  transactionHash: z.string(),
  /** Block number where tx was included */
  blockNumber: z.number(),
  /** Token contract address */
  token: z.string(),
  /** Token symbol */
  tokenSymbol: z.string(),
  /** Total amount across all payments */
  totalAmount: z.string(),
  /** Number of recipients */
  recipientCount: z.number(),
  /** Individual payment results */
  payments: z.array(batchPaymentResultItemSchema),
  /** Total gas cost for the batch */
  gasCost: z.string(),
  /** Average gas cost per payment */
  gasPerPayment: z.string(),
  /** URL to view transaction on block explorer */
  explorerUrl: z.string(),
  /** ISO 8601 timestamp */
  timestamp: z.string(),
});

/**
 * TypeScript type for successful batch_payments output.
 */
export type BatchPaymentsOutput = z.infer<typeof batchPaymentsOutputSchema>;

/**
 * Output schema for failed batch_payments response.
 */
export const batchPaymentsErrorSchema = z.object({
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
 * TypeScript type for failed batch_payments output.
 */
export type BatchPaymentsError = z.infer<typeof batchPaymentsErrorSchema>;

/**
 * Combined output type (success or error).
 */
export type BatchPaymentsResult = BatchPaymentsOutput | BatchPaymentsError;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate total amount across all payments.
 *
 * @param payments - Array of payment items
 * @returns Total amount as string with 6 decimal precision
 */
export function calculateBatchTotal(
  payments: Array<{ amount: string }>
): string {
  const total = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  return total.toFixed(6);
}

/**
 * Create a success response object for batch payments.
 */
export function createBatchSuccessResponse(data: {
  transactionHash: string;
  blockNumber: number;
  token: string;
  tokenSymbol: string;
  totalAmount: string;
  recipientCount: number;
  payments: Array<{
    to: string;
    amount: string;
    memo: string | null;
    label: string | null;
    status: 'success' | 'included';
  }>;
  gasCost: string;
  gasPerPayment: string;
  explorerUrl: string;
}): BatchPaymentsOutput {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error response object for batch payments.
 */
export function createBatchErrorResponse(error: {
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
}): BatchPaymentsError {
  return {
    success: false,
    error,
  };
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate batch_payments input.
 *
 * @param input - Raw input object
 * @returns Validated input
 * @throws ZodError if validation fails
 */
export function validateBatchPaymentsInput(input: unknown): BatchPaymentsInput {
  return batchPaymentsInputZodSchema.parse(input);
}

/**
 * Safe parse batch_payments input.
 *
 * @param input - Raw input object
 * @returns Parse result with success/error info
 */
export function safeParseBatchPaymentsInput(
  input: unknown
): z.SafeParseReturnType<unknown, BatchPaymentsInput> {
  return batchPaymentsInputZodSchema.safeParse(input);
}

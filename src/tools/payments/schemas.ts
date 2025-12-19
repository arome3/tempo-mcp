/**
 * Payment Tool Schemas
 *
 * Zod schemas for payment tool inputs and outputs.
 * These define the structure of data flowing through the send_payment tool.
 */

import { z } from 'zod';

// =============================================================================
// Input Schemas
// =============================================================================

/**
 * Input schema for the send_payment tool.
 *
 * Accepts:
 * - token: Token address or symbol (e.g., "AlphaUSD" or "0x20c0...")
 * - to: Recipient address (0x-prefixed 40-char hex)
 * - amount: Amount in human-readable units (e.g., "100.50")
 * - memo: Optional 32-byte memo for reconciliation
 */
export const sendPaymentInputSchema = {
  token: z
    .string()
    .min(1)
    .describe(
      'TIP-20 token address or symbol (e.g., "AlphaUSD" or "0x20c0...")'
    ),
  to: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format')
    .describe('Recipient address (0x-prefixed 40-character hex string)'),
  amount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Invalid amount format')
    .describe('Amount in human-readable units (e.g., "100" or "100.50")'),
  memo: z
    .string()
    .max(32, 'Memo must be 32 bytes or less when UTF-8 encoded')
    .optional()
    .describe(
      'Optional memo for invoice reconciliation (max 32 bytes). Example: "INV-2024-001"'
    ),
};

/**
 * Zod object schema for validation.
 */
export const sendPaymentInputZodSchema = z.object(sendPaymentInputSchema);

/**
 * TypeScript type for send_payment input.
 */
export type SendPaymentInput = z.infer<typeof sendPaymentInputZodSchema>;

// =============================================================================
// Output Schemas
// =============================================================================

/**
 * Output schema for successful send_payment response.
 */
export const sendPaymentOutputSchema = z.object({
  /** Whether the payment succeeded */
  success: z.literal(true),
  /** Transaction hash */
  transactionHash: z.string(),
  /** Block number where tx was included */
  blockNumber: z.number(),
  /** Sender address */
  from: z.string(),
  /** Recipient address */
  to: z.string(),
  /** Amount in human-readable units */
  amount: z.string(),
  /** Amount in smallest units (wei) */
  amountRaw: z.string(),
  /** Token contract address */
  token: z.string(),
  /** Token symbol */
  tokenSymbol: z.string(),
  /** Memo if provided, null otherwise */
  memo: z.string().nullable(),
  /** Gas cost in fee token units */
  gasCost: z.string(),
  /** URL to view transaction on block explorer */
  explorerUrl: z.string(),
  /** ISO 8601 timestamp of transaction */
  timestamp: z.string(),
});

/**
 * TypeScript type for successful send_payment output.
 */
export type SendPaymentOutput = z.infer<typeof sendPaymentOutputSchema>;

/**
 * Output schema for failed send_payment response.
 */
export const sendPaymentErrorSchema = z.object({
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
 * TypeScript type for failed send_payment output.
 */
export type SendPaymentError = z.infer<typeof sendPaymentErrorSchema>;

/**
 * Combined output type (success or error).
 */
export type SendPaymentResult = SendPaymentOutput | SendPaymentError;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a success response object.
 */
export function createSuccessResponse(data: {
  transactionHash: string;
  blockNumber: number;
  from: string;
  to: string;
  amount: string;
  amountRaw: string;
  token: string;
  tokenSymbol: string;
  memo: string | null;
  gasCost: string;
  explorerUrl: string;
}): SendPaymentOutput {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error response object.
 */
export function createErrorResponse(error: {
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
}): SendPaymentError {
  return {
    success: false,
    error,
  };
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate send_payment input.
 *
 * @param input - Raw input object
 * @returns Validated input
 * @throws ZodError if validation fails
 */
export function validateSendPaymentInput(input: unknown): SendPaymentInput {
  return sendPaymentInputZodSchema.parse(input);
}

/**
 * Safe parse send_payment input.
 *
 * @param input - Raw input object
 * @returns Parse result with success/error info
 */
export function safeParseSendPaymentInput(input: unknown): z.SafeParseReturnType<
  unknown,
  SendPaymentInput
> {
  return sendPaymentInputZodSchema.safeParse(input);
}

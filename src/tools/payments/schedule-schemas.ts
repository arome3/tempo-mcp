/**
 * Scheduled Payment Tool Schemas
 *
 * Zod schemas for scheduled payment tool inputs and outputs.
 * These define the structure of data flowing through schedule_payment
 * and cancel_scheduled_payment tools.
 */

import { z } from 'zod';

// =============================================================================
// Recurring Configuration Schema (Schema only - implementation deferred)
// =============================================================================

/**
 * Schema for recurring payment configuration.
 *
 * Note: This schema defines the structure for future recurring payment
 * support. The actual recurring logic is not yet implemented.
 */
export const recurringConfigSchema = z.object({
  /** Interval between payments */
  interval: z.enum(['daily', 'weekly', 'monthly']).describe(
    'Frequency of recurring payments'
  ),
  /** ISO 8601 date when recurring payments should stop */
  endDate: z
    .string()
    .optional()
    .describe('Optional end date for recurring payments (e.g., "2024-12-31" or "2024-12-31T23:59:59Z")'),
  /** Maximum number of payment occurrences */
  occurrences: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional maximum number of payment executions'),
});

/**
 * TypeScript type for recurring configuration.
 */
export type RecurringConfig = z.infer<typeof recurringConfigSchema>;

// =============================================================================
// Schedule Payment Input Schema
// =============================================================================

/**
 * Input schema for the schedule_payment tool.
 *
 * Accepts:
 * - token: Token address or symbol (e.g., "AlphaUSD" or "0x20c0...")
 * - to: Recipient address (0x-prefixed 40-char hex)
 * - amount: Amount in human-readable units (e.g., "100.50")
 * - memo: Optional 32-byte memo for reconciliation
 * - executeAt: ISO 8601 timestamp for execution
 * - validFrom: Optional earliest execution time
 * - validUntil: Optional expiration time
 * - recurring: Optional recurring configuration (schema only)
 */
export const schedulePaymentInputSchema = {
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
  executeAt: z
    .string()
    .describe(
      'Timestamp for payment execution (e.g., "2024-12-25T00:00:00Z" or "2024-12-25")'
    ),
  validFrom: z
    .string()
    .optional()
    .describe(
      'Optional earliest execution time. Defaults to executeAt.'
    ),
  validUntil: z
    .string()
    .optional()
    .describe(
      'Optional expiration time. Transaction fails if not executed by this time.'
    ),
  recurring: recurringConfigSchema
    .optional()
    .describe(
      'Optional recurring payment configuration (not yet implemented - schema only)'
    ),
};

/**
 * Zod object schema for validation.
 */
export const schedulePaymentInputZodSchema = z.object(schedulePaymentInputSchema);

/**
 * TypeScript type for schedule_payment input.
 */
export type SchedulePaymentInput = z.infer<typeof schedulePaymentInputZodSchema>;

// =============================================================================
// Schedule Payment Output Schema
// =============================================================================

/**
 * Output schema for successful schedule_payment response.
 */
export const schedulePaymentOutputSchema = z.object({
  /** Whether the scheduling succeeded */
  success: z.literal(true),
  /** Unique identifier for the scheduled payment */
  scheduleId: z.string(),
  /** Transaction hash for the scheduled transaction */
  transactionHash: z.string(),
  /** Token contract address */
  token: z.string(),
  /** Token symbol */
  tokenSymbol: z.string(),
  /** Recipient address */
  to: z.string(),
  /** Amount in human-readable units */
  amount: z.string(),
  /** Amount in smallest units (wei) */
  amountRaw: z.string(),
  /** Memo if provided, null otherwise */
  memo: z.string().nullable(),
  /** Scheduled execution time (ISO 8601) */
  executeAt: z.string(),
  /** Earliest execution time if set, null otherwise */
  validFrom: z.string().nullable(),
  /** Expiration time if set, null otherwise */
  validUntil: z.string().nullable(),
  /** Recurring configuration if set, null otherwise */
  recurring: z
    .object({
      interval: z.string(),
      endDate: z.string().nullable(),
      nextExecution: z.string(),
    })
    .nullable(),
  /** Current schedule status */
  status: z.enum(['pending', 'scheduled']),
  /** URL to view transaction on block explorer */
  explorerUrl: z.string(),
  /** ISO 8601 timestamp when schedule was created */
  createdAt: z.string(),
});

/**
 * TypeScript type for successful schedule_payment output.
 */
export type SchedulePaymentOutput = z.infer<typeof schedulePaymentOutputSchema>;

/**
 * Output schema for failed schedule_payment response.
 */
export const schedulePaymentErrorSchema = z.object({
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
 * TypeScript type for failed schedule_payment output.
 */
export type SchedulePaymentError = z.infer<typeof schedulePaymentErrorSchema>;

/**
 * Combined output type (success or error).
 */
export type SchedulePaymentResult = SchedulePaymentOutput | SchedulePaymentError;

// =============================================================================
// Cancel Scheduled Payment Schemas
// =============================================================================

/**
 * Input schema for the cancel_scheduled_payment tool.
 */
export const cancelScheduledPaymentInputSchema = {
  scheduleId: z
    .string()
    .min(1)
    .describe('ID of the scheduled payment to cancel (e.g., "sched_abc12345")'),
};

/**
 * Zod object schema for cancellation validation.
 */
export const cancelScheduledPaymentInputZodSchema = z.object(
  cancelScheduledPaymentInputSchema
);

/**
 * TypeScript type for cancel_scheduled_payment input.
 */
export type CancelScheduledPaymentInput = z.infer<
  typeof cancelScheduledPaymentInputZodSchema
>;

/**
 * Output schema for successful cancel_scheduled_payment response.
 */
export const cancelScheduledPaymentOutputSchema = z.object({
  /** Whether the cancellation succeeded */
  success: z.literal(true),
  /** ID of the cancelled schedule */
  scheduleId: z.string(),
  /** New status */
  status: z.literal('cancelled'),
  /** ISO 8601 timestamp when cancellation occurred */
  cancelledAt: z.string(),
});

/**
 * TypeScript type for successful cancellation output.
 */
export type CancelScheduledPaymentOutput = z.infer<
  typeof cancelScheduledPaymentOutputSchema
>;

/**
 * Output schema for failed cancel_scheduled_payment response.
 */
export const cancelScheduledPaymentErrorSchema = z.object({
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
  }),
});

/**
 * TypeScript type for failed cancellation output.
 */
export type CancelScheduledPaymentError = z.infer<
  typeof cancelScheduledPaymentErrorSchema
>;

/**
 * Combined cancellation output type (success or error).
 */
export type CancelScheduledPaymentResult =
  | CancelScheduledPaymentOutput
  | CancelScheduledPaymentError;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a success response object for schedule_payment.
 */
export function createScheduleSuccessResponse(data: {
  scheduleId: string;
  transactionHash: string;
  token: string;
  tokenSymbol: string;
  to: string;
  amount: string;
  amountRaw: string;
  memo: string | null;
  executeAt: string;
  validFrom: string | null;
  validUntil: string | null;
  recurring: {
    interval: string;
    endDate: string | null;
    nextExecution: string;
  } | null;
  explorerUrl: string;
}): SchedulePaymentOutput {
  return {
    success: true,
    ...data,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create an error response object for schedule_payment.
 */
export function createScheduleErrorResponse(error: {
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
}): SchedulePaymentError {
  return {
    success: false,
    error,
  };
}

/**
 * Create a success response object for cancel_scheduled_payment.
 */
export function createCancelSuccessResponse(
  scheduleId: string
): CancelScheduledPaymentOutput {
  return {
    success: true,
    scheduleId,
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
  };
}

/**
 * Create an error response object for cancel_scheduled_payment.
 */
export function createCancelErrorResponse(error: {
  code: number;
  message: string;
  details?: {
    field?: string;
    expected?: string;
    received?: string;
    suggestion?: string;
  };
  recoverable?: boolean;
}): CancelScheduledPaymentError {
  return {
    success: false,
    error,
  };
}

// =============================================================================
// Datetime Helpers
// =============================================================================

/**
 * Validate and normalize a datetime string to full ISO 8601 format.
 * Rejects invalid dates like "2025-12-45" that JavaScript would auto-correct.
 *
 * @param dateStr - Datetime string in various formats
 * @returns Normalized ISO 8601 string (e.g., "2024-12-31T00:00:00.000Z")
 * @throws Error if the date is invalid
 */
export function normalizeDatetime(dateStr: string): string {
  const date = new Date(dateStr);

  // Check if date is valid at all
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid datetime format: "${dateStr}". Use ISO 8601 (e.g., "2024-12-31T13:26:00Z" or "2024-12-31")`);
  }

  // Check for auto-corrected dates by comparing the parsed result back to input
  // Extract year, month, day from input string
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, yearStr, monthStr, dayStr] = match;
    const inputYear = parseInt(yearStr, 10);
    const inputMonth = parseInt(monthStr, 10);
    const inputDay = parseInt(dayStr, 10);

    // Get the actual parsed values (in UTC)
    const parsedYear = date.getUTCFullYear();
    const parsedMonth = date.getUTCMonth() + 1; // getUTCMonth is 0-indexed
    const parsedDay = date.getUTCDate();

    // If they don't match, the date was auto-corrected (invalid input)
    if (inputYear !== parsedYear || inputMonth !== parsedMonth || inputDay !== parsedDay) {
      throw new Error(
        `Invalid date: "${dateStr}". ` +
        `Day ${inputDay} is out of range for month ${inputMonth}. ` +
        `Use valid dates like "2024-12-31".`
      );
    }
  }

  return date.toISOString();
}

/**
 * Safely normalize a datetime string, returning null on failure.
 */
export function safeNormalizeDatetime(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  try {
    return normalizeDatetime(dateStr);
  } catch {
    return null;
  }
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate schedule_payment input.
 *
 * @param input - Raw input object
 * @returns Validated input
 * @throws ZodError if validation fails
 */
export function validateSchedulePaymentInput(
  input: unknown
): SchedulePaymentInput {
  return schedulePaymentInputZodSchema.parse(input);
}

/**
 * Safe parse schedule_payment input.
 *
 * @param input - Raw input object
 * @returns Parse result with success/error info
 */
export function safeParseSchedulePaymentInput(
  input: unknown
): z.SafeParseReturnType<unknown, SchedulePaymentInput> {
  return schedulePaymentInputZodSchema.safeParse(input);
}

/**
 * Validate cancel_scheduled_payment input.
 *
 * @param input - Raw input object
 * @returns Validated input
 * @throws ZodError if validation fails
 */
export function validateCancelScheduledPaymentInput(
  input: unknown
): CancelScheduledPaymentInput {
  return cancelScheduledPaymentInputZodSchema.parse(input);
}

/**
 * Safe parse cancel_scheduled_payment input.
 *
 * @param input - Raw input object
 * @returns Parse result with success/error info
 */
export function safeParseCancelScheduledPaymentInput(
  input: unknown
): z.SafeParseReturnType<unknown, CancelScheduledPaymentInput> {
  return cancelScheduledPaymentInputZodSchema.safeParse(input);
}

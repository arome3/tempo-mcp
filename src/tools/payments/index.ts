/**
 * Payment Tools
 *
 * Tools for sending TIP-20 stablecoin payments on Tempo blockchain.
 *
 * Tools in this category:
 * - send_payment: Send single TIP-20 transfer (with optional memo)
 * - batch_payments: Atomic multi-recipient transfer
 * - schedule_payment: Create scheduled future payment
 * - cancel_scheduled_payment: Cancel pending scheduled payment
 */

import { registerSendPaymentTool } from './send-payment.js';
import { registerBatchPaymentsTool } from './batch-payments.js';
import { registerScheduledPaymentTools } from './scheduled-payments.js';

/**
 * Register all payment-related tools with the MCP server.
 *
 * Implements:
 * - send_payment (with optional memo support)
 * - batch_payments (atomic multi-recipient transfers)
 * - schedule_payment (protocol-level scheduled transactions)
 * - cancel_scheduled_payment (cancel pending schedules)
 */
export function registerPaymentTools(): void {
  // Send payment tool (includes memo support)
  registerSendPaymentTool();

  // Batch payments tool (atomic multi-recipient transfers)
  registerBatchPaymentsTool();

  // Scheduled payment tools (protocol-level scheduling)
  registerScheduledPaymentTools();
}

// Re-export schemas for external use
export {
  sendPaymentInputSchema,
  sendPaymentOutputSchema,
  sendPaymentErrorSchema,
  type SendPaymentInput,
  type SendPaymentOutput,
  type SendPaymentError,
  type SendPaymentResult,
} from './schemas.js';

// Re-export batch payment schemas
export {
  batchPaymentsInputSchema,
  batchPaymentsOutputSchema,
  batchPaymentsErrorSchema,
  batchPaymentItemSchema,
  calculateBatchTotal,
  createBatchSuccessResponse,
  createBatchErrorResponse,
  type BatchPaymentItem,
  type BatchPaymentsInput,
  type BatchPaymentsOutput,
  type BatchPaymentsError,
  type BatchPaymentsResult,
} from './batch-schemas.js';

// Re-export scheduled payment schemas
export {
  schedulePaymentInputSchema,
  schedulePaymentOutputSchema,
  schedulePaymentErrorSchema,
  cancelScheduledPaymentInputSchema,
  cancelScheduledPaymentOutputSchema,
  cancelScheduledPaymentErrorSchema,
  recurringConfigSchema,
  createScheduleSuccessResponse,
  createScheduleErrorResponse,
  createCancelSuccessResponse,
  createCancelErrorResponse,
  type SchedulePaymentInput,
  type SchedulePaymentOutput,
  type SchedulePaymentError,
  type SchedulePaymentResult,
  type CancelScheduledPaymentInput,
  type CancelScheduledPaymentOutput,
  type CancelScheduledPaymentError,
  type CancelScheduledPaymentResult,
  type RecurringConfig,
} from './schedule-schemas.js';

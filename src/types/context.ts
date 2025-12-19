/**
 * Request Context Module
 *
 * Provides request-scoped context for tracing and correlation.
 * Each tool invocation creates a context that flows through the call stack,
 * enabling request correlation in logs, audit trails, and error tracking.
 *
 * @example
 * ```typescript
 * const ctx = createRequestContext('send_payment');
 * console.log(ctx.requestId); // "req_lxyz123_ab12cd"
 *
 * // Pass to logging
 * await auditLogger.logSuccess({
 *   requestId: ctx.requestId,
 *   tool: ctx.toolName,
 *   durationMs: Date.now() - ctx.startTime,
 *   // ...
 * });
 * ```
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Request context for tracing and correlation.
 *
 * Created at the start of each tool invocation and threaded through
 * the call stack to enable request-scoped logging and audit trails.
 */
export interface RequestContext {
  /** Unique identifier for this request (format: req_{timestamp}_{random}) */
  requestId: string;

  /** When the request started (epoch milliseconds) */
  startTime: number;

  /** Tool name being executed */
  toolName: string;

  /** Optional tenant/user identifier for multi-tenancy */
  tenantId?: string;

  /** Optional parent request ID for nested operations */
  parentRequestId?: string;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Generate a unique request ID.
 *
 * Format: req_{base36_timestamp}_{random_6chars}
 * Example: req_lxyz123_ab12cd
 *
 * @returns Unique request identifier
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `req_${timestamp}_${random}`;
}

/**
 * Create a new request context for a tool invocation.
 *
 * @param toolName - Name of the tool being executed
 * @param options - Optional additional context fields
 * @returns New RequestContext instance
 *
 * @example
 * ```typescript
 * // Basic usage
 * const ctx = createRequestContext('send_payment');
 *
 * // With tenant ID
 * const ctx = createRequestContext('send_payment', { tenantId: 'user_123' });
 *
 * // For nested operations
 * const childCtx = createRequestContext('validate_address', {
 *   parentRequestId: parentCtx.requestId
 * });
 * ```
 */
export function createRequestContext(
  toolName: string,
  options?: {
    tenantId?: string;
    parentRequestId?: string;
  }
): RequestContext {
  return {
    requestId: generateRequestId(),
    startTime: Date.now(),
    toolName,
    tenantId: options?.tenantId,
    parentRequestId: options?.parentRequestId,
  };
}

/**
 * Get the elapsed time since context creation.
 *
 * @param ctx - Request context
 * @returns Duration in milliseconds
 */
export function getContextDuration(ctx: RequestContext): number {
  return Date.now() - ctx.startTime;
}

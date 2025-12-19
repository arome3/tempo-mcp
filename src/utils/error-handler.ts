/**
 * Error Handler Utility
 *
 * Converts any error to MCP-compatible response format.
 * Used by all tools to ensure consistent error responses.
 */

import {
  TempoMcpError,
  normalizeError,
  type ErrorDetails,
} from './errors.js';

// =============================================================================
// Types
// =============================================================================

/**
 * MCP-compatible error response structure.
 *
 * This is the format returned by tools when an error occurs.
 */
export interface McpErrorResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
}

/**
 * Structured error object for JSON serialization.
 *
 * This format is included in the MCP response content and can be
 * parsed by AI agents to understand and respond to errors.
 */
export interface ToolError {
  /** Numeric error code for programmatic handling */
  code: number;
  /** Human-readable error message */
  message: string;
  /** Additional context for debugging */
  details?: ErrorDetails;
  /** Whether the error can be resolved by retrying */
  recoverable: boolean;
  /** Suggested wait time before retry (seconds) */
  retryAfter?: number;
}

// =============================================================================
// Error Handler Functions
// =============================================================================

/**
 * Convert any error to an MCP-compatible error response.
 *
 * This is the primary entry point for error handling in tools.
 * It normalizes any error type into the standard MCP response format.
 *
 * @param error - Any thrown error or value
 * @returns MCP-compatible error response object
 *
 * @example
 * ```typescript
 * server.registerTool('my_tool', schema, async (args) => {
 *   try {
 *     // Tool implementation
 *     return { content: [{ type: 'text', text: JSON.stringify(result) }] };
 *   } catch (error) {
 *     return handleToolError(error);
 *   }
 * });
 * ```
 */
export function handleToolError(error: unknown): McpErrorResponse {
  const normalizedError = normalizeError(error);

  const toolError: ToolError = {
    code: normalizedError.code,
    message: normalizedError.message,
    details: normalizedError.details,
    recoverable: normalizedError.recoverable,
    retryAfter: normalizedError.retryAfter,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: false, error: toolError }, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Create a structured error response from a TempoMcpError.
 *
 * Useful when you need the error object for embedding in
 * a custom response structure (e.g., batch operations).
 *
 * @param error - TempoMcpError instance
 * @returns Structured error object
 *
 * @example
 * ```typescript
 * const errors = failedItems.map(item => ({
 *   recipient: item.to,
 *   error: createToolErrorFromException(item.error)
 * }));
 * ```
 */
export function createToolErrorFromException(
  error: TempoMcpError
): ToolError {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    recoverable: error.recoverable,
    retryAfter: error.retryAfter,
  };
}

/**
 * Create a structured error object from raw values.
 *
 * Useful when constructing custom error responses without
 * throwing an exception first.
 *
 * @param params - Error information
 * @returns Structured error object
 *
 * @example
 * ```typescript
 * const errorOutput = createToolError({
 *   code: 3001,
 *   message: 'Insufficient balance',
 *   details: { received: '50 USDC', expected: '100 USDC' },
 *   recoverable: false,
 * });
 * ```
 */
export function createToolError(params: {
  code: number;
  message: string;
  details?: ErrorDetails;
  recoverable?: boolean;
  retryAfter?: number;
}): ToolError {
  return {
    code: params.code,
    message: params.message,
    details: params.details,
    recoverable: params.recoverable ?? false,
    retryAfter: params.retryAfter,
  };
}

/**
 * Format a ToolError as a JSON string for MCP responses.
 *
 * @param error - ToolError object
 * @returns Pretty-printed JSON string
 */
export function formatToolError(error: ToolError): string {
  return JSON.stringify({ success: false, error }, null, 2);
}

/**
 * Create a complete MCP error response from a ToolError.
 *
 * @param error - ToolError object
 * @returns MCP-compatible error response
 */
export function createMcpErrorResponse(error: ToolError): McpErrorResponse {
  return {
    content: [
      {
        type: 'text',
        text: formatToolError(error),
      },
    ],
    isError: true,
  };
}

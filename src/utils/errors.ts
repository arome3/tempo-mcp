/**
 * Custom Error Types
 *
 * Structured error classes for tempo-mcp with error codes
 * that align with the MCP error response format.
 *
 * Error Code Ranges:
 * - 1000-1999: Validation errors
 * - 2000-2999: Security errors
 * - 3000-3999: Blockchain errors
 * - 4000-4999: Network errors
 * - 5000-5999: Internal errors
 */

// =============================================================================
// Error Details Interface
// =============================================================================

/**
 * Additional details for error context.
 */
export interface ErrorDetails {
  /** The field that caused the error */
  field?: string;
  /** Expected value or format */
  expected?: string;
  /** Received value */
  received?: string;
  /** Suggested action to fix */
  suggestion?: string;
  /** Additional context */
  [key: string]: unknown;
}

// =============================================================================
// Base Error Class
// =============================================================================

/**
 * Base error class for all tempo-mcp errors.
 *
 * Provides structured error information including:
 * - Numeric error code for programmatic handling
 * - Human-readable message
 * - Optional details for debugging
 * - Recovery hints
 */
export class TempoMcpError extends Error {
  /** Numeric error code */
  readonly code: number;

  /** Additional error context */
  readonly details?: ErrorDetails;

  /** Whether the error is recoverable */
  readonly recoverable: boolean;

  /** Seconds to wait before retry (if applicable) */
  readonly retryAfter?: number;

  constructor(
    code: number,
    message: string,
    options?: {
      details?: ErrorDetails;
      recoverable?: boolean;
      retryAfter?: number;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'TempoMcpError';
    this.code = code;
    this.details = options?.details;
    this.recoverable = options?.recoverable ?? false;
    this.retryAfter = options?.retryAfter;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to JSON-serializable format for MCP responses.
   */
  toJSON(): {
    code: number;
    message: string;
    details?: ErrorDetails;
    recoverable: boolean;
    retryAfter?: number;
  } {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      recoverable: this.recoverable,
      retryAfter: this.retryAfter,
    };
  }
}

// =============================================================================
// Validation Errors (1000-1999)
// =============================================================================

/** Error codes for validation errors */
export const ValidationErrorCodes = {
  INVALID_ADDRESS: 1001,
  INVALID_AMOUNT: 1002,
  INVALID_TOKEN: 1003,
  INVALID_MEMO: 1004,
  INVALID_TRANSACTION_HASH: 1005,
  MISSING_REQUIRED_FIELD: 1006,
  INVALID_FORMAT: 1007,
  TRANSACTION_NOT_FOUND: 1008,
} as const;

/**
 * Error thrown when input validation fails.
 */
export class ValidationError extends TempoMcpError {
  constructor(
    code: number,
    message: string,
    details?: ErrorDetails,
    cause?: Error
  ) {
    super(code, message, {
      details,
      recoverable: true, // User can fix input and retry
      cause,
    });
    this.name = 'ValidationError';
  }

  static invalidAddress(address: string): ValidationError {
    return new ValidationError(
      ValidationErrorCodes.INVALID_ADDRESS,
      'Invalid Ethereum address format',
      {
        field: 'address',
        received: address,
        expected: '0x-prefixed 40-character hex string',
        suggestion: 'Ensure address starts with 0x and is 42 characters total',
      }
    );
  }

  static invalidAmount(amount: string): ValidationError {
    return new ValidationError(
      ValidationErrorCodes.INVALID_AMOUNT,
      'Amount must be a positive number',
      {
        field: 'amount',
        received: amount,
        expected: 'Positive decimal number (e.g., "100.50")',
        suggestion: 'Provide amount as a string with optional decimal places',
      }
    );
  }

  static invalidToken(token: string): ValidationError {
    return new ValidationError(
      ValidationErrorCodes.INVALID_TOKEN,
      'Token not found or invalid',
      {
        field: 'token',
        received: token,
        expected: 'Valid token address or supported symbol',
        suggestion: 'Use token address (0x...) or symbol like "AlphaUSD"',
      }
    );
  }

  static invalidMemo(memo: string, byteLength: number): ValidationError {
    return new ValidationError(
      ValidationErrorCodes.INVALID_MEMO,
      'Memo exceeds 32 bytes',
      {
        field: 'memo',
        received: `"${memo.slice(0, 50)}${memo.length > 50 ? '...' : ''}" (${byteLength} bytes)`,
        expected: 'Max 32 bytes',
        suggestion: 'Shorten memo to max 32 characters/bytes',
      }
    );
  }

  static invalidTransactionHash(hash: string): ValidationError {
    return new ValidationError(
      ValidationErrorCodes.INVALID_TRANSACTION_HASH,
      'Invalid transaction hash format',
      {
        field: 'transactionHash',
        received: hash,
        expected: '0x-prefixed 64-character hex string',
        suggestion: 'Ensure hash starts with 0x and is 66 characters total',
      }
    );
  }

  static missingField(field: string): ValidationError {
    return new ValidationError(
      ValidationErrorCodes.MISSING_REQUIRED_FIELD,
      `Missing required field: ${field}`,
      {
        field,
        suggestion: `Provide a value for the "${field}" parameter`,
      }
    );
  }

  static transactionNotFound(hash: string): ValidationError {
    return new ValidationError(
      ValidationErrorCodes.TRANSACTION_NOT_FOUND,
      'Transaction not found',
      {
        field: 'hash',
        received: hash,
        suggestion:
          'Verify the transaction hash is correct. The transaction may not exist or may be on a different network.',
      }
    );
  }

  /**
   * Create a custom validation error.
   *
   * Use this for validation errors that don't fit the predefined categories.
   *
   * @param field - The field that failed validation
   * @param message - Human-readable error message
   * @param received - The value that was received (optional)
   * @returns ValidationError instance
   */
  static custom(
    field: string,
    message: string,
    received?: string
  ): ValidationError {
    return new ValidationError(
      ValidationErrorCodes.INVALID_FORMAT,
      message,
      {
        field,
        received,
      }
    );
  }
}

// =============================================================================
// Security Errors (2000-2999)
// =============================================================================

/** Error codes for security errors */
export const SecurityErrorCodes = {
  SPENDING_LIMIT_EXCEEDED: 2001,
  DAILY_LIMIT_EXCEEDED: 2002,
  RECIPIENT_NOT_ALLOWED: 2003,
  RATE_LIMIT_EXCEEDED: 2004,
  UNAUTHORIZED: 2005,
  CONFIRMATION_REQUIRED: 2006,
} as const;

/**
 * Error thrown when security policy is violated.
 */
export class SecurityError extends TempoMcpError {
  constructor(
    code: number,
    message: string,
    options?: {
      details?: ErrorDetails;
      recoverable?: boolean;
      retryAfter?: number;
      cause?: Error;
    }
  ) {
    super(code, message, {
      ...options,
      recoverable: options?.recoverable ?? false,
    });
    this.name = 'SecurityError';
  }

  static spendingLimitExceeded(
    amount: string,
    limit: string,
    token: string
  ): SecurityError {
    return new SecurityError(
      SecurityErrorCodes.SPENDING_LIMIT_EXCEEDED,
      'Payment exceeds single transaction limit',
      {
        details: {
          field: 'amount',
          received: `${amount} ${token}`,
          expected: `Max ${limit} ${token} per transaction`,
          suggestion:
            'Reduce amount or contact admin to increase limit',
        },
        recoverable: true,
      }
    );
  }

  static dailyLimitExceeded(
    spent: string,
    limit: string,
    token: string
  ): SecurityError {
    return new SecurityError(
      SecurityErrorCodes.DAILY_LIMIT_EXCEEDED,
      'Daily spending limit reached',
      {
        details: {
          received: `${spent} ${token} spent today`,
          expected: `Max ${limit} ${token} per day`,
          suggestion: 'Wait until tomorrow or contact admin',
        },
        recoverable: false,
      }
    );
  }

  static recipientNotAllowed(address: string): SecurityError {
    return new SecurityError(
      SecurityErrorCodes.RECIPIENT_NOT_ALLOWED,
      'Recipient not in allowlist',
      {
        details: {
          field: 'to',
          received: address,
          suggestion: 'Add recipient to allowlist in configuration',
        },
        recoverable: true,
      }
    );
  }

  static rateLimitExceeded(retryAfter: number): SecurityError {
    return new SecurityError(
      SecurityErrorCodes.RATE_LIMIT_EXCEEDED,
      'Too many requests',
      {
        details: {
          suggestion: `Wait ${retryAfter} seconds before retrying`,
        },
        recoverable: true,
        retryAfter,
      }
    );
  }

  static confirmationRequired(amount: string, threshold: string): SecurityError {
    return new SecurityError(
      SecurityErrorCodes.CONFIRMATION_REQUIRED,
      'High-value transaction requires confirmation',
      {
        details: {
          received: amount,
          expected: `Amounts over ${threshold} require explicit confirmation`,
          suggestion: 'Confirm the transaction or reduce amount',
        },
        recoverable: true,
      }
    );
  }
}

// =============================================================================
// Blockchain Errors (3000-3999)
// =============================================================================

/** Error codes for blockchain errors */
export const BlockchainErrorCodes = {
  INSUFFICIENT_BALANCE: 3001,
  INSUFFICIENT_GAS: 3002,
  TRANSACTION_REVERTED: 3003,
  NONCE_TOO_LOW: 3004,
  TRANSACTION_TIMEOUT: 3005,
  CONTRACT_ERROR: 3006,
} as const;

/**
 * Error thrown for blockchain interaction failures.
 */
export class BlockchainError extends TempoMcpError {
  constructor(
    code: number,
    message: string,
    details?: ErrorDetails,
    cause?: Error
  ) {
    super(code, message, {
      details,
      recoverable: false, // Usually requires user action
      cause,
    });
    this.name = 'BlockchainError';
  }

  static insufficientBalance(
    balance: string,
    required: string,
    token: string
  ): BlockchainError {
    return new BlockchainError(
      BlockchainErrorCodes.INSUFFICIENT_BALANCE,
      'Insufficient token balance',
      {
        received: `${balance} ${token}`,
        expected: `${required} ${token}`,
        suggestion: 'Add funds to wallet or reduce payment amount',
      }
    );
  }

  static insufficientGas(token: string): BlockchainError {
    return new BlockchainError(
      BlockchainErrorCodes.INSUFFICIENT_GAS,
      'Insufficient balance for gas',
      {
        suggestion: `Add more ${token} to pay for transaction fees`,
      }
    );
  }

  static transactionReverted(reason?: string): BlockchainError {
    return new BlockchainError(
      BlockchainErrorCodes.TRANSACTION_REVERTED,
      'Transaction reverted',
      {
        received: reason ?? 'Unknown reason',
        suggestion:
          'Check recipient address and token permissions. The contract may have rejected the transfer.',
      }
    );
  }

  static nonceTooLow(): BlockchainError {
    return new BlockchainError(
      BlockchainErrorCodes.NONCE_TOO_LOW,
      'Nonce already used',
      {
        suggestion:
          'Retry the transaction. If problem persists, there may be a pending transaction.',
      }
    );
  }

  static transactionTimeout(hash: string, timeoutMs: number): BlockchainError {
    return new BlockchainError(
      BlockchainErrorCodes.TRANSACTION_TIMEOUT,
      'Transaction confirmation timeout',
      {
        field: 'transactionHash',
        received: hash,
        expected: `Confirmation within ${timeoutMs / 1000} seconds`,
        suggestion:
          'Transaction may still be pending. Check block explorer for status.',
      }
    );
  }

  static contractError(reason: string, contractAddress?: string): BlockchainError {
    return new BlockchainError(
      BlockchainErrorCodes.CONTRACT_ERROR,
      'Smart contract error',
      {
        received: reason,
        field: contractAddress ? 'contract' : undefined,
        suggestion:
          'The contract rejected the operation. Check parameters and contract state.',
      }
    );
  }
}

// =============================================================================
// Network Errors (4000-4999)
// =============================================================================

/** Error codes for network errors */
export const NetworkErrorCodes = {
  RPC_CONNECTION_FAILED: 4001,
  RPC_REQUEST_FAILED: 4002,
  RPC_TIMEOUT: 4003,
  RPC_SERVER_UNAVAILABLE: 4004,
} as const;

/**
 * Error thrown for network/RPC failures.
 */
export class NetworkError extends TempoMcpError {
  constructor(
    code: number,
    message: string,
    details?: ErrorDetails,
    cause?: Error
  ) {
    super(code, message, {
      details,
      recoverable: true, // Usually can retry
      retryAfter: 5, // Suggest 5 second wait
      cause,
    });
    this.name = 'NetworkError';
  }

  static connectionFailed(rpcUrl: string, cause?: Error): NetworkError {
    return new NetworkError(
      NetworkErrorCodes.RPC_CONNECTION_FAILED,
      'Failed to connect to RPC endpoint',
      {
        received: rpcUrl,
        suggestion: 'Check network connection and RPC URL configuration',
      },
      cause
    );
  }

  static requestFailed(method: string, cause?: Error): NetworkError {
    return new NetworkError(
      NetworkErrorCodes.RPC_REQUEST_FAILED,
      `RPC request failed: ${method}`,
      {
        suggestion: 'The request may have failed due to network issues. Retry.',
      },
      cause
    );
  }

  static rpcTimeout(method: string, timeoutMs: number, cause?: Error): NetworkError {
    return new NetworkError(
      NetworkErrorCodes.RPC_TIMEOUT,
      `RPC request timed out: ${method}`,
      {
        received: `Timeout after ${timeoutMs}ms`,
        suggestion:
          'Check network connectivity. The RPC endpoint may be slow or unresponsive.',
      },
      cause
    );
  }

  static rpcUnavailable(rpcUrl: string, statusCode: number, cause?: Error): NetworkError {
    const statusMessages: Record<number, string> = {
      500: 'Internal server error',
      502: 'Bad gateway',
      503: 'Service unavailable',
      521: 'Web server is down',
      522: 'Connection timed out',
      523: 'Origin is unreachable',
      524: 'A timeout occurred',
    };

    const statusMessage = statusMessages[statusCode] || `HTTP ${statusCode}`;

    return new NetworkError(
      NetworkErrorCodes.RPC_SERVER_UNAVAILABLE,
      `RPC server unavailable: ${statusMessage}`,
      {
        received: `${rpcUrl} returned HTTP ${statusCode}`,
        suggestion:
          'The Tempo network RPC is temporarily unavailable. Please try again in a few minutes.',
      },
      cause
    );
  }
}

// =============================================================================
// Internal Errors (5000-5999)
// =============================================================================

/** Error codes for internal errors */
export const InternalErrorCodes = {
  INTERNAL_ERROR: 5000,
  CONFIGURATION_ERROR: 5001,
  WALLET_NOT_CONFIGURED: 5002,
} as const;

/**
 * Error thrown for internal/unexpected errors.
 */
export class InternalError extends TempoMcpError {
  constructor(
    code: number,
    message: string,
    details?: ErrorDetails,
    cause?: Error
  ) {
    super(code, message, {
      details,
      recoverable: false,
      cause,
    });
    this.name = 'InternalError';
  }

  static unexpected(message: string, cause?: Error): InternalError {
    return new InternalError(
      InternalErrorCodes.INTERNAL_ERROR,
      message,
      {
        suggestion: 'This is an unexpected error. Please report it.',
      },
      cause
    );
  }

  static configurationError(message: string): InternalError {
    return new InternalError(InternalErrorCodes.CONFIGURATION_ERROR, message, {
      suggestion: 'Check your configuration file and environment variables',
    });
  }

  static walletNotConfigured(): InternalError {
    return new InternalError(
      InternalErrorCodes.WALLET_NOT_CONFIGURED,
      'Wallet not configured',
      {
        suggestion:
          'Set TEMPO_PRIVATE_KEY environment variable or configure keystore',
      }
    );
  }
}

// =============================================================================
// Error Type Guards
// =============================================================================

/**
 * Check if an error is a TempoMcpError.
 */
export function isTempoMcpError(error: unknown): error is TempoMcpError {
  return error instanceof TempoMcpError;
}

/**
 * Check if an error is a ValidationError.
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Check if an error is a SecurityError.
 */
export function isSecurityError(error: unknown): error is SecurityError {
  return error instanceof SecurityError;
}

/**
 * Check if an error is a BlockchainError.
 */
export function isBlockchainError(error: unknown): error is BlockchainError {
  return error instanceof BlockchainError;
}

/**
 * Check if an error is a NetworkError.
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format any error into a TempoMcpError for consistent handling.
 *
 * @param error - Any error or unknown value
 * @returns A TempoMcpError instance
 */
export function normalizeError(error: unknown): TempoMcpError {
  if (isTempoMcpError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // Check for RPC HTTP errors (5xx status codes)
    const rpcErrorMatch = error.message.match(
      /HTTP request failed\.\s*\n\s*Status:\s*(\d+)\s*\n\s*URL:\s*(https?:\/\/[^\s\n]+)/
    );

    if (rpcErrorMatch) {
      const statusCode = parseInt(rpcErrorMatch[1], 10);
      const rpcUrl = rpcErrorMatch[2];

      // Handle 5xx server errors
      if (statusCode >= 500 && statusCode < 600) {
        return NetworkError.rpcUnavailable(rpcUrl, statusCode, error);
      }
    }

    return InternalError.unexpected(error.message, error);
  }

  return InternalError.unexpected(String(error));
}

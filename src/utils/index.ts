/**
 * Utilities Module
 *
 * Re-exports all utility functions for convenient imports.
 *
 * @example
 * ```typescript
 * import {
 *   stringToBytes32,
 *   isValidAddress,
 *   ValidationError
 * } from '../utils/index.js';
 * ```
 */

// Formatting utilities
export {
  stringToBytes32,
  bytes32ToString,
  truncateAddress,
  formatAddress,
  formatAmount,
  formatRawAmount,
  formatGasCost,
  buildExplorerTxUrl,
  buildExplorerAddressUrl,
} from './formatting.js';

// Validation utilities
export {
  isValidAddress,
  normalizeAddress,
  isNotZeroAddress,
  isValidAmount,
  isPositiveAmount,
  isWithinDecimalLimit,
  isValidTokenIdentifier,
  isValidMemo,
  getMemoByteLength,
  isValidTransactionHash,
  validatePaymentParams,
  type ValidationResult,
} from './validation.js';

// Error types and utilities
export {
  // Base error
  TempoMcpError,
  type ErrorDetails,
  // Validation errors
  ValidationError,
  ValidationErrorCodes,
  // Security errors
  SecurityError,
  SecurityErrorCodes,
  // Blockchain errors
  BlockchainError,
  BlockchainErrorCodes,
  // Network errors
  NetworkError,
  NetworkErrorCodes,
  // Internal errors
  InternalError,
  InternalErrorCodes,
  // Type guards
  isTempoMcpError,
  isValidationError,
  isSecurityError,
  isBlockchainError,
  isNetworkError,
  // Utilities
  normalizeError,
} from './errors.js';

// Error handler utilities
export {
  handleToolError,
  createToolError,
  createToolErrorFromException,
  formatToolError,
  createMcpErrorResponse,
  type McpErrorResponse,
  type ToolError,
} from './error-handler.js';

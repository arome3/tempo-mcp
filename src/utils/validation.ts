/**
 * Validation Utilities
 *
 * Input validation functions for addresses, amounts, and other
 * user-provided data. These are used before processing to ensure
 * data integrity and provide helpful error messages.
 */

import { getAddress, isAddress } from 'viem';

// =============================================================================
// Address Validation
// =============================================================================

/**
 * Validate an Ethereum address format.
 *
 * Checks that the address:
 * - Starts with 0x
 * - Is exactly 42 characters
 * - Contains only valid hex characters
 *
 * @param address - The address string to validate
 * @returns True if valid Ethereum address format
 *
 * @example
 * ```typescript
 * isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb') // true
 * isValidAddress('0xinvalid') // false
 * isValidAddress('not-an-address') // false
 * ```
 */
export function isValidAddress(address: string): boolean {
  return isAddress(address);
}

/**
 * Validate and normalize an Ethereum address.
 *
 * Returns the checksummed address if valid, or null if invalid.
 * Use this when you need both validation and normalization.
 *
 * @param address - The address string to validate and normalize
 * @returns Checksummed address or null if invalid
 *
 * @example
 * ```typescript
 * normalizeAddress('0x742d35cc6634c0532925a3b844bc9e7595f0bebb')
 * // Returns: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb'
 * normalizeAddress('invalid')
 * // Returns: null
 * ```
 */
export function normalizeAddress(address: string): string | null {
  try {
    return getAddress(address);
  } catch {
    return null;
  }
}

/**
 * Validate that an address is not the zero address.
 *
 * The zero address (0x000...000) is often used as a burn address
 * or to indicate "no address". Payments to it are usually errors.
 *
 * @param address - The address to check
 * @returns True if not the zero address
 */
export function isNotZeroAddress(address: string): boolean {
  const zeroAddress = '0x0000000000000000000000000000000000000000';
  return address.toLowerCase() !== zeroAddress.toLowerCase();
}

// =============================================================================
// Amount Validation
// =============================================================================

/**
 * Validate an amount string format.
 *
 * Accepts:
 * - Integers: "100", "0"
 * - Decimals: "100.50", "0.001"
 *
 * Does NOT accept:
 * - Negative numbers
 * - Scientific notation
 * - Empty strings
 * - Non-numeric characters
 *
 * @param amount - The amount string to validate
 * @returns True if valid amount format
 *
 * @example
 * ```typescript
 * isValidAmount('100.50') // true
 * isValidAmount('0') // true
 * isValidAmount('-50') // false
 * isValidAmount('1e18') // false
 * isValidAmount('abc') // false
 * ```
 */
export function isValidAmount(amount: string): boolean {
  // Must be a non-empty string
  if (!amount || typeof amount !== 'string') {
    return false;
  }

  // Match positive decimal numbers
  const amountRegex = /^\d+(\.\d+)?$/;
  if (!amountRegex.test(amount)) {
    return false;
  }

  // Parse and check it's a valid positive number
  const num = parseFloat(amount);
  return !isNaN(num) && num >= 0 && isFinite(num);
}

/**
 * Validate that an amount is positive (greater than zero).
 *
 * Zero-value transfers are usually errors and waste gas.
 *
 * @param amount - The amount string to validate
 * @returns True if amount is positive
 */
export function isPositiveAmount(amount: string): boolean {
  if (!isValidAmount(amount)) {
    return false;
  }
  return parseFloat(amount) > 0;
}

/**
 * Validate that an amount doesn't exceed maximum decimals.
 *
 * Most stablecoins use 6 decimals. Amounts with more precision
 * will be truncated, which may cause unexpected behavior.
 *
 * @param amount - The amount string to validate
 * @param maxDecimals - Maximum allowed decimal places (default: 18)
 * @returns True if within decimal limit
 */
export function isWithinDecimalLimit(
  amount: string,
  maxDecimals: number = 18
): boolean {
  if (!isValidAmount(amount)) {
    return false;
  }

  const parts = amount.split('.');
  if (parts.length === 1) {
    return true; // No decimals
  }

  return parts[1].length <= maxDecimals;
}

// =============================================================================
// Token Validation
// =============================================================================

/**
 * Validate a token identifier (address or symbol).
 *
 * Accepts:
 * - Valid Ethereum addresses (0x...)
 * - Token symbols (alphanumeric, 1-20 chars)
 *
 * @param token - The token identifier to validate
 * @returns True if valid token identifier
 */
export function isValidTokenIdentifier(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  // Check if it's a valid address
  if (token.startsWith('0x')) {
    return isValidAddress(token);
  }

  // Check if it's a valid symbol (alphanumeric, 1-20 chars)
  const symbolRegex = /^[a-zA-Z0-9]{1,20}$/;
  return symbolRegex.test(token);
}

// =============================================================================
// Memo Validation
// =============================================================================

/**
 * Validate a memo string for TIP-20 transfers.
 *
 * Memos are stored as bytes32 on-chain, so they must fit
 * within 32 bytes when UTF-8 encoded.
 *
 * @param memo - The memo string to validate
 * @returns True if valid memo (or undefined/empty)
 */
export function isValidMemo(memo: string | undefined): boolean {
  // Undefined or empty is valid (optional memo)
  if (!memo) {
    return true;
  }

  // Check byte length when UTF-8 encoded
  const encoder = new TextEncoder();
  const bytes = encoder.encode(memo);

  return bytes.length <= 32;
}

/**
 * Get the byte length of a memo string.
 *
 * Useful for showing users how much space they have remaining.
 *
 * @param memo - The memo string
 * @returns Byte length when UTF-8 encoded
 */
export function getMemoByteLength(memo: string): number {
  const encoder = new TextEncoder();
  return encoder.encode(memo).length;
}

// =============================================================================
// Transaction Hash Validation
// =============================================================================

/**
 * Validate a transaction hash format.
 *
 * Transaction hashes are 32-byte hex strings (66 chars with 0x prefix).
 *
 * @param hash - The transaction hash to validate
 * @returns True if valid transaction hash format
 */
export function isValidTransactionHash(hash: string): boolean {
  if (!hash || typeof hash !== 'string') {
    return false;
  }

  // Must be 0x + 64 hex characters
  const hashRegex = /^0x[a-fA-F0-9]{64}$/;
  return hashRegex.test(hash);
}

// =============================================================================
// Composite Validation
// =============================================================================

/**
 * Validation result with error details.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate payment parameters.
 *
 * Checks all parameters needed for a payment and returns
 * detailed error messages for any failures.
 *
 * @param params - Payment parameters to validate
 * @returns Validation result with any error messages
 */
export function validatePaymentParams(params: {
  token: string;
  to: string;
  amount: string;
  memo?: string;
}): ValidationResult {
  const errors: string[] = [];

  // Validate token
  if (!isValidTokenIdentifier(params.token)) {
    errors.push(
      'Invalid token: must be a valid address (0x...) or symbol (e.g., "AlphaUSD")'
    );
  }

  // Validate recipient address
  if (!isValidAddress(params.to)) {
    errors.push(
      'Invalid recipient address: must be a valid Ethereum address (0x + 40 hex chars)'
    );
  } else if (!isNotZeroAddress(params.to)) {
    errors.push(
      'Invalid recipient: cannot send to zero address (0x0000...0000)'
    );
  }

  // Validate amount
  if (!isValidAmount(params.amount)) {
    errors.push(
      'Invalid amount: must be a positive number (e.g., "100" or "100.50")'
    );
  } else if (!isPositiveAmount(params.amount)) {
    errors.push('Invalid amount: must be greater than zero');
  }

  // Validate memo (if provided)
  if (params.memo && !isValidMemo(params.memo)) {
    const byteLength = getMemoByteLength(params.memo);
    errors.push(
      `Invalid memo: exceeds 32 bytes (current: ${byteLength} bytes). Shorten the memo or use a shorter identifier.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

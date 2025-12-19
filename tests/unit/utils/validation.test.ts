/**
 * Validation Utilities Unit Tests
 *
 * Comprehensive tests for input validation functions.
 */

import { describe, it, expect } from 'vitest';
import {
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
} from '../../../src/utils/validation.js';
import {
  TEST_ADDRESSES,
  TEST_AMOUNTS,
  TEST_TX_HASHES,
  TEST_MEMOS,
  TEST_TOKENS,
} from '../../utils/test-helpers.js';

// =============================================================================
// Address Validation Tests
// =============================================================================

describe('isValidAddress', () => {
  it('should accept valid checksummed address', () => {
    expect(isValidAddress(TEST_ADDRESSES.VALID)).toBe(true);
  });

  it('should accept valid lowercase address', () => {
    expect(isValidAddress(TEST_ADDRESSES.LOWERCASE)).toBe(true);
  });

  it('should accept zero address', () => {
    expect(isValidAddress(TEST_ADDRESSES.ZERO)).toBe(true);
  });

  it('should reject address without 0x prefix', () => {
    expect(isValidAddress(TEST_ADDRESSES.NO_PREFIX)).toBe(false);
  });

  it('should reject short addresses', () => {
    expect(isValidAddress(TEST_ADDRESSES.SHORT)).toBe(false);
  });

  it('should reject long addresses', () => {
    expect(isValidAddress(TEST_ADDRESSES.LONG)).toBe(false);
  });

  it('should reject addresses with invalid characters', () => {
    expect(isValidAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(isValidAddress('')).toBe(false);
  });

  it('should reject null/undefined', () => {
    expect(isValidAddress(null as unknown as string)).toBe(false);
    expect(isValidAddress(undefined as unknown as string)).toBe(false);
  });
});

describe('normalizeAddress', () => {
  it('should return checksummed address for valid input', () => {
    const normalized = normalizeAddress(TEST_ADDRESSES.LOWERCASE);
    expect(normalized).toBeDefined();
    // Should have mixed case (checksummed)
    expect(normalized).not.toBe(TEST_ADDRESSES.LOWERCASE);
  });

  it('should return null for invalid input', () => {
    expect(normalizeAddress('invalid')).toBeNull();
    expect(normalizeAddress(TEST_ADDRESSES.SHORT)).toBeNull();
    expect(normalizeAddress('')).toBeNull();
  });

  it('should preserve valid checksummed address', () => {
    const normalized = normalizeAddress(TEST_ADDRESSES.VALID);
    expect(normalized).toBe(TEST_ADDRESSES.VALID);
  });
});

describe('isNotZeroAddress', () => {
  it('should return false for zero address', () => {
    expect(isNotZeroAddress(TEST_ADDRESSES.ZERO)).toBe(false);
  });

  it('should return true for non-zero address', () => {
    expect(isNotZeroAddress(TEST_ADDRESSES.VALID)).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(isNotZeroAddress(TEST_ADDRESSES.ZERO.toUpperCase())).toBe(false);
  });
});

// =============================================================================
// Amount Validation Tests
// =============================================================================

describe('isValidAmount', () => {
  it('should accept integers', () => {
    expect(isValidAmount('100')).toBe(true);
    expect(isValidAmount('0')).toBe(true);
    expect(isValidAmount('999999999')).toBe(true);
  });

  it('should accept decimals', () => {
    expect(isValidAmount('100.50')).toBe(true);
    expect(isValidAmount('0.01')).toBe(true);
    expect(isValidAmount('123.456789')).toBe(true);
  });

  it('should accept zero', () => {
    expect(isValidAmount('0')).toBe(true);
    expect(isValidAmount('0.0')).toBe(true);
  });

  it('should reject negative numbers', () => {
    expect(isValidAmount(TEST_AMOUNTS.NEGATIVE)).toBe(false);
    expect(isValidAmount('-0.01')).toBe(false);
  });

  it('should reject scientific notation', () => {
    expect(isValidAmount(TEST_AMOUNTS.SCIENTIFIC)).toBe(false);
    expect(isValidAmount('1.5e10')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(isValidAmount('')).toBe(false);
  });

  it('should reject non-numeric strings', () => {
    expect(isValidAmount(TEST_AMOUNTS.NON_NUMERIC)).toBe(false);
    expect(isValidAmount('12abc')).toBe(false);
    expect(isValidAmount('one hundred')).toBe(false);
  });

  it('should reject Infinity', () => {
    expect(isValidAmount(TEST_AMOUNTS.INFINITY)).toBe(false);
    expect(isValidAmount('-Infinity')).toBe(false);
  });

  it('should reject NaN', () => {
    expect(isValidAmount(TEST_AMOUNTS.NAN)).toBe(false);
  });

  it('should reject multiple decimal points', () => {
    expect(isValidAmount('100.50.25')).toBe(false);
  });

  it('should reject leading decimal point without zero', () => {
    expect(isValidAmount('.5')).toBe(false);
  });

  it('should reject trailing decimal point', () => {
    expect(isValidAmount('100.')).toBe(false);
  });
});

describe('isPositiveAmount', () => {
  it('should return false for zero', () => {
    expect(isPositiveAmount('0')).toBe(false);
    expect(isPositiveAmount('0.00')).toBe(false);
  });

  it('should return true for positive amounts', () => {
    expect(isPositiveAmount('0.01')).toBe(true);
    expect(isPositiveAmount('100')).toBe(true);
  });

  it('should return false for invalid amounts', () => {
    expect(isPositiveAmount(TEST_AMOUNTS.NEGATIVE)).toBe(false);
    expect(isPositiveAmount(TEST_AMOUNTS.NON_NUMERIC)).toBe(false);
  });
});

describe('isWithinDecimalLimit', () => {
  it('should allow amounts within decimal limit', () => {
    expect(isWithinDecimalLimit('100.123456', 6)).toBe(true);
    expect(isWithinDecimalLimit('100', 6)).toBe(true);
    expect(isWithinDecimalLimit('100.12', 6)).toBe(true);
  });

  it('should reject amounts exceeding decimal limit', () => {
    expect(isWithinDecimalLimit('100.1234567', 6)).toBe(false); // 7 decimals
    expect(isWithinDecimalLimit('100.12345678901234567890', 18)).toBe(false);
  });

  it('should use default of 18 decimals', () => {
    expect(isWithinDecimalLimit('100.123456789012345678')).toBe(true); // 18 decimals
    expect(isWithinDecimalLimit('100.1234567890123456789')).toBe(false); // 19 decimals
  });

  it('should return false for invalid amounts', () => {
    expect(isWithinDecimalLimit('abc', 6)).toBe(false);
    expect(isWithinDecimalLimit('-100', 6)).toBe(false);
  });
});

// =============================================================================
// Token Validation Tests
// =============================================================================

describe('isValidTokenIdentifier', () => {
  it('should accept valid addresses starting with 0x', () => {
    expect(isValidTokenIdentifier(TEST_TOKENS.ALPHA_USD)).toBe(true);
    expect(isValidTokenIdentifier(TEST_ADDRESSES.VALID)).toBe(true);
  });

  it('should accept valid token symbols', () => {
    expect(isValidTokenIdentifier('AlphaUSD')).toBe(true);
    expect(isValidTokenIdentifier('USDC')).toBe(true);
    expect(isValidTokenIdentifier('eth')).toBe(true);
  });

  it('should reject invalid addresses', () => {
    expect(isValidTokenIdentifier('0xinvalid')).toBe(false);
    expect(isValidTokenIdentifier('0x123')).toBe(false);
  });

  it('should reject symbols with special characters', () => {
    expect(isValidTokenIdentifier('Alpha-USD')).toBe(false);
    expect(isValidTokenIdentifier('USD$')).toBe(false);
    expect(isValidTokenIdentifier('Token!')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(isValidTokenIdentifier('')).toBe(false);
  });

  it('should reject too long symbols (>20 chars)', () => {
    expect(isValidTokenIdentifier('a'.repeat(21))).toBe(false);
  });

  it('should accept up to 20 character symbols', () => {
    expect(isValidTokenIdentifier('a'.repeat(20))).toBe(true);
  });
});

// =============================================================================
// Memo Validation Tests
// =============================================================================

describe('isValidMemo', () => {
  it('should accept undefined', () => {
    expect(isValidMemo(undefined)).toBe(true);
  });

  it('should accept empty string', () => {
    expect(isValidMemo(TEST_MEMOS.EMPTY)).toBe(true);
  });

  it('should accept ASCII string under 32 bytes', () => {
    expect(isValidMemo(TEST_MEMOS.SHORT)).toBe(true);
    expect(isValidMemo('INV-2024-001')).toBe(true);
  });

  it('should accept string exactly 32 bytes', () => {
    expect(isValidMemo(TEST_MEMOS.EXACT_32)).toBe(true);
  });

  it('should reject string over 32 bytes', () => {
    expect(isValidMemo(TEST_MEMOS.TOO_LONG)).toBe(false);
  });

  it('should handle multi-byte UTF-8 characters', () => {
    // Each emoji is 4 bytes, so 8 emojis = 32 bytes (valid)
    expect(isValidMemo(TEST_MEMOS.EMOJI)).toBe(true);
  });

  it('should reject UTF-8 that exceeds 32 bytes', () => {
    // 9 emojis = 36 bytes (invalid)
    expect(isValidMemo(TEST_MEMOS.EMOJI_TOO_LONG)).toBe(false);
  });

  it('should handle mixed ASCII and UTF-8', () => {
    // "Hello " (6 bytes) + 6 emojis (24 bytes) = 30 bytes (valid)
    expect(isValidMemo('Hello 🎉🎉🎉🎉🎉🎉')).toBe(true);

    // "Hello " (6 bytes) + 7 emojis (28 bytes) = 34 bytes (invalid)
    expect(isValidMemo('Hello 🎉🎉🎉🎉🎉🎉🎉')).toBe(false);
  });
});

describe('getMemoByteLength', () => {
  it('should return correct length for ASCII', () => {
    expect(getMemoByteLength('hello')).toBe(5);
    expect(getMemoByteLength(TEST_MEMOS.EXACT_32)).toBe(32);
  });

  it('should return correct length for UTF-8', () => {
    // Each emoji is 4 bytes
    expect(getMemoByteLength('🎉')).toBe(4);
    expect(getMemoByteLength('🎉🎉')).toBe(8);
  });

  it('should return 0 for empty string', () => {
    expect(getMemoByteLength('')).toBe(0);
  });
});

// =============================================================================
// Transaction Hash Validation Tests
// =============================================================================

describe('isValidTransactionHash', () => {
  it('should accept valid 66-char hash', () => {
    expect(isValidTransactionHash(TEST_TX_HASHES.VALID)).toBe(true);
  });

  it('should accept lowercase hash', () => {
    expect(isValidTransactionHash(('0x' + 'a'.repeat(64)).toLowerCase())).toBe(true);
  });

  it('should accept uppercase hash', () => {
    // Only uppercase the hex chars, keep 0x prefix lowercase
    expect(isValidTransactionHash('0x' + 'A'.repeat(64))).toBe(true);
  });

  it('should reject hash without 0x prefix', () => {
    expect(isValidTransactionHash(TEST_TX_HASHES.NO_PREFIX)).toBe(false);
  });

  it('should reject short hash', () => {
    expect(isValidTransactionHash(TEST_TX_HASHES.SHORT)).toBe(false);
  });

  it('should reject hash with invalid characters', () => {
    expect(isValidTransactionHash(TEST_TX_HASHES.INVALID)).toBe(false);
    expect(isValidTransactionHash('0x' + 'g'.repeat(64))).toBe(false);
  });

  it('should reject too long hash', () => {
    expect(isValidTransactionHash('0x' + 'a'.repeat(65))).toBe(false);
  });

  it('should reject empty string', () => {
    expect(isValidTransactionHash('')).toBe(false);
  });
});

// =============================================================================
// validatePaymentParams Tests
// =============================================================================

describe('validatePaymentParams', () => {
  it('should return valid=true for valid params', () => {
    const result = validatePaymentParams({
      token: 'AlphaUSD',
      to: TEST_ADDRESSES.VALID,
      amount: '100.50',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should return valid=true with valid memo', () => {
    const result = validatePaymentParams({
      token: 'AlphaUSD',
      to: TEST_ADDRESSES.VALID,
      amount: '100',
      memo: 'INV-001',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should collect all validation errors', () => {
    const result = validatePaymentParams({
      token: '', // Invalid
      to: 'invalid', // Invalid
      amount: '-100', // Invalid
      memo: 'a'.repeat(50), // Invalid - too long
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('should validate token format', () => {
    const result = validatePaymentParams({
      token: 'Invalid-Token!',
      to: TEST_ADDRESSES.VALID,
      amount: '100',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('token'))).toBe(true);
  });

  it('should validate recipient address format', () => {
    const result = validatePaymentParams({
      token: 'AlphaUSD',
      to: '0xinvalid',
      amount: '100',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('address') || e.includes('recipient'))).toBe(true);
  });

  it('should reject zero address as recipient', () => {
    const result = validatePaymentParams({
      token: 'AlphaUSD',
      to: TEST_ADDRESSES.ZERO,
      amount: '100',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('zero'))).toBe(true);
  });

  it('should validate amount format', () => {
    const result = validatePaymentParams({
      token: 'AlphaUSD',
      to: TEST_ADDRESSES.VALID,
      amount: 'abc',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('amount'))).toBe(true);
  });

  it('should reject zero amount', () => {
    const result = validatePaymentParams({
      token: 'AlphaUSD',
      to: TEST_ADDRESSES.VALID,
      amount: '0',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('zero') || e.includes('greater'))).toBe(true);
  });

  it('should validate memo length', () => {
    const result = validatePaymentParams({
      token: 'AlphaUSD',
      to: TEST_ADDRESSES.VALID,
      amount: '100',
      memo: 'a'.repeat(40), // Too long
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('memo') || e.includes('bytes'))).toBe(true);
  });

  it('should allow undefined memo', () => {
    const result = validatePaymentParams({
      token: 'AlphaUSD',
      to: TEST_ADDRESSES.VALID,
      amount: '100',
      memo: undefined,
    });

    expect(result.valid).toBe(true);
  });

  it('should accept token as address', () => {
    const result = validatePaymentParams({
      token: TEST_TOKENS.ALPHA_USD,
      to: TEST_ADDRESSES.VALID,
      amount: '100',
    });

    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('edge cases', () => {
  it('should handle very long strings gracefully', () => {
    const longString = 'a'.repeat(10000);
    expect(isValidAddress(longString)).toBe(false);
    expect(isValidAmount(longString)).toBe(false);
    expect(isValidMemo(longString)).toBe(false);
    expect(isValidTransactionHash(longString)).toBe(false);
  });

  it('should handle numeric values passed as non-strings', () => {
    // These would be type errors in TypeScript but could happen at runtime
    expect(isValidAmount(100 as unknown as string)).toBe(false);
    expect(isValidAddress(0 as unknown as string)).toBe(false);
  });

  it('should handle whitespace strings', () => {
    expect(isValidAmount('  ')).toBe(false);
    expect(isValidAmount(' 100 ')).toBe(false);
    expect(isValidAddress('  ')).toBe(false);
  });
});

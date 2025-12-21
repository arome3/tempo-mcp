/**
 * Access Key Tool Schemas Unit Tests
 *
 * Tests for Zod schemas used in access key management tools.
 * Validates input parsing and response helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  // Input schemas
  createAccessKeyInputZodSchema,
  revokeAccessKeyInputZodSchema,
  getAccessKeyInfoInputZodSchema,
  getRemainingLimitInputZodSchema,
  updateSpendingLimitInputZodSchema,
  // Response helpers
  createRevokeAccessKeyResponse,
  createGetAccessKeyInfoResponse,
  createGetRemainingLimitResponse,
  createUpdateSpendingLimitResponse,
  createAccessKeyErrorResponse,
  // Constants
  SIGNATURE_TYPES,
  SIGNATURE_TYPE_DESCRIPTIONS,
} from '../../../src/tools/access-keys/schemas.js';
import {
  TEST_ADDRESSES,
  TEST_TOKENS,
  TEST_TX_HASHES,
} from '../../utils/test-helpers.js';

// =============================================================================
// Constants Tests
// =============================================================================

describe('Access Key Schema Constants', () => {
  describe('SIGNATURE_TYPES', () => {
    it('should contain all signature types', () => {
      expect(SIGNATURE_TYPES).toContain('secp256k1');
      expect(SIGNATURE_TYPES).toContain('p256');
      expect(SIGNATURE_TYPES).toContain('webauthn');
    });

    it('should have exactly 3 signature types', () => {
      expect(SIGNATURE_TYPES).toHaveLength(3);
    });
  });

  describe('SIGNATURE_TYPE_DESCRIPTIONS', () => {
    it('should have descriptions for all signature types', () => {
      for (const type of SIGNATURE_TYPES) {
        expect(SIGNATURE_TYPE_DESCRIPTIONS[type]).toBeDefined();
        expect(typeof SIGNATURE_TYPE_DESCRIPTIONS[type]).toBe('string');
        expect(SIGNATURE_TYPE_DESCRIPTIONS[type].length).toBeGreaterThan(0);
      }
    });
  });
});

// =============================================================================
// Input Schema Tests
// =============================================================================

describe('createAccessKeyInputSchema', () => {
  it('should accept valid input with defaults', () => {
    const input = {};
    const result = createAccessKeyInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.signatureType).toBe('p256');
      expect(result.data.enforceLimits).toBe(true);
    }
  });

  it('should accept all valid signature types', () => {
    for (const sigType of SIGNATURE_TYPES) {
      const input = { signatureType: sigType };
      const result = createAccessKeyInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid signature type', () => {
    const input = { signatureType: 'invalid_type' };
    const result = createAccessKeyInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept valid expiry timestamp', () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 86400; // 1 day in future
    const input = { expiry: futureExpiry };
    const result = createAccessKeyInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept zero expiry (never expires)', () => {
    const input = { expiry: 0 };
    const result = createAccessKeyInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject negative expiry', () => {
    const input = { expiry: -1 };
    const result = createAccessKeyInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept valid token limits', () => {
    const input = {
      limits: [
        { token: TEST_TOKENS.ALPHA_USD, amount: '1000000000' },
      ],
    };
    const result = createAccessKeyInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept label under max length', () => {
    const input = { label: 'My Access Key' };
    const result = createAccessKeyInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject label exceeding max length', () => {
    const input = { label: 'x'.repeat(65) };
    const result = createAccessKeyInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('revokeAccessKeyInputSchema', () => {
  it('should accept valid keyId', () => {
    const input = { keyId: TEST_ADDRESSES.VALID };
    const result = revokeAccessKeyInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid keyId format', () => {
    const input = { keyId: 'invalid-key-id' };
    const result = revokeAccessKeyInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject missing keyId', () => {
    const input = {};
    const result = revokeAccessKeyInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('getAccessKeyInfoInputSchema', () => {
  it('should accept valid input with keyId only', () => {
    const input = { keyId: TEST_ADDRESSES.VALID };
    const result = getAccessKeyInfoInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept valid input with keyId and account', () => {
    const input = {
      keyId: TEST_ADDRESSES.VALID,
      account: TEST_ADDRESSES.VALID_2,
    };
    const result = getAccessKeyInfoInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid account address', () => {
    const input = {
      keyId: TEST_ADDRESSES.VALID,
      account: 'invalid-address',
    };
    const result = getAccessKeyInfoInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('getRemainingLimitInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      keyId: TEST_ADDRESSES.VALID,
      token: TEST_TOKENS.ALPHA_USD,
    };
    const result = getRemainingLimitInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept valid input with account', () => {
    const input = {
      keyId: TEST_ADDRESSES.VALID,
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID_2,
    };
    const result = getRemainingLimitInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject empty token', () => {
    const input = {
      keyId: TEST_ADDRESSES.VALID,
      token: '',
    };
    const result = getRemainingLimitInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('updateSpendingLimitInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      keyId: TEST_ADDRESSES.VALID,
      token: TEST_TOKENS.ALPHA_USD,
      newLimit: '1000000000',
    };
    const result = updateSpendingLimitInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject empty newLimit', () => {
    const input = {
      keyId: TEST_ADDRESSES.VALID,
      token: TEST_TOKENS.ALPHA_USD,
      newLimit: '',
    };
    const result = updateSpendingLimitInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject missing token', () => {
    const input = {
      keyId: TEST_ADDRESSES.VALID,
      newLimit: '1000000000',
    };
    const result = updateSpendingLimitInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Response Helper Tests
// =============================================================================

describe('createRevokeAccessKeyResponse', () => {
  it('should create valid response with all fields', () => {
    const response = createRevokeAccessKeyResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      keyId: TEST_ADDRESSES.VALID,
      revokedBy: TEST_ADDRESSES.VALID_2,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.transactionHash).toBe(TEST_TX_HASHES.VALID);
    expect(response.keyId).toBe(TEST_ADDRESSES.VALID);
    expect(response.revokedBy).toBe(TEST_ADDRESSES.VALID_2);
    expect(response.timestamp).toBeDefined();
  });

  it('should include ISO timestamp', () => {
    const response = createRevokeAccessKeyResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      keyId: TEST_ADDRESSES.VALID,
      revokedBy: TEST_ADDRESSES.VALID_2,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('createGetAccessKeyInfoResponse', () => {
  it('should return isActive true when found, not revoked, and not expired', () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 86400; // 1 day in future
    const response = createGetAccessKeyInfoResponse({
      found: true,
      keyId: TEST_ADDRESSES.VALID,
      account: TEST_ADDRESSES.VALID_2,
      signatureType: 'p256',
      expiry: futureExpiry,
      enforceLimits: true,
      isRevoked: false,
    });

    expect(response.found).toBe(true);
    expect(response.isActive).toBe(true);
    expect(response.isExpired).toBe(false);
    expect(response.signatureTypeDescription).toBe(SIGNATURE_TYPE_DESCRIPTIONS.p256);
  });

  it('should return isActive false when revoked', () => {
    const response = createGetAccessKeyInfoResponse({
      found: true,
      keyId: TEST_ADDRESSES.VALID,
      account: TEST_ADDRESSES.VALID_2,
      signatureType: 'secp256k1',
      expiry: 0,
      enforceLimits: true,
      isRevoked: true,
    });

    expect(response.isActive).toBe(false);
    expect(response.isRevoked).toBe(true);
  });

  it('should return isActive false when expired', () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 86400; // 1 day ago
    const response = createGetAccessKeyInfoResponse({
      found: true,
      keyId: TEST_ADDRESSES.VALID,
      account: TEST_ADDRESSES.VALID_2,
      signatureType: 'webauthn',
      expiry: pastExpiry,
      enforceLimits: false,
      isRevoked: false,
    });

    expect(response.isActive).toBe(false);
    expect(response.isExpired).toBe(true);
  });

  it('should return isActive false when not found', () => {
    const response = createGetAccessKeyInfoResponse({
      found: false,
      keyId: TEST_ADDRESSES.VALID,
      account: TEST_ADDRESSES.VALID_2,
      signatureType: null,
      expiry: null,
      enforceLimits: null,
      isRevoked: null,
    });

    expect(response.found).toBe(false);
    expect(response.isActive).toBe(false);
  });

  it('should handle zero expiry as never expires', () => {
    const response = createGetAccessKeyInfoResponse({
      found: true,
      keyId: TEST_ADDRESSES.VALID,
      account: TEST_ADDRESSES.VALID_2,
      signatureType: 'p256',
      expiry: 0,
      enforceLimits: true,
      isRevoked: false,
    });

    expect(response.isExpired).toBe(false);
    expect(response.expiryISO).toBeNull();
    expect(response.isActive).toBe(true);
  });
});

describe('createGetRemainingLimitResponse', () => {
  it('should format limit correctly with decimals', () => {
    const response = createGetRemainingLimitResponse({
      keyId: TEST_ADDRESSES.VALID,
      account: TEST_ADDRESSES.VALID_2,
      token: TEST_TOKENS.ALPHA_USD,
      remainingLimit: '1000000000', // 1000 with 6 decimals
      decimals: 6,
    });

    expect(response.remainingLimit).toBe('1000000000');
    expect(response.remainingLimitFormatted).toBe('1000');
    expect(response.isUnlimited).toBe(false);
  });

  it('should handle fractional amounts', () => {
    const response = createGetRemainingLimitResponse({
      keyId: TEST_ADDRESSES.VALID,
      account: TEST_ADDRESSES.VALID_2,
      token: TEST_TOKENS.ALPHA_USD,
      remainingLimit: '123456789', // 123.456789 with 6 decimals
      decimals: 6,
    });

    expect(response.remainingLimitFormatted).toBe('123.456789');
    expect(response.isUnlimited).toBe(false);
  });

  it('should detect unlimited (max uint256)', () => {
    const maxUint256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const response = createGetRemainingLimitResponse({
      keyId: TEST_ADDRESSES.VALID,
      account: TEST_ADDRESSES.VALID_2,
      token: TEST_TOKENS.ALPHA_USD,
      remainingLimit: BigInt(maxUint256).toString(),
      decimals: 6,
    });

    expect(response.isUnlimited).toBe(true);
    expect(response.remainingLimitFormatted).toBe('unlimited');
  });

  it('should handle zero limit', () => {
    const response = createGetRemainingLimitResponse({
      keyId: TEST_ADDRESSES.VALID,
      account: TEST_ADDRESSES.VALID_2,
      token: TEST_TOKENS.ALPHA_USD,
      remainingLimit: '0',
      decimals: 6,
    });

    expect(response.remainingLimit).toBe('0');
    expect(response.remainingLimitFormatted).toBe('0');
    expect(response.isUnlimited).toBe(false);
  });
});

describe('createUpdateSpendingLimitResponse', () => {
  it('should create valid response with formatted limit', () => {
    const response = createUpdateSpendingLimitResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      keyId: TEST_ADDRESSES.VALID,
      token: TEST_TOKENS.ALPHA_USD,
      newLimit: '5000000000', // 5000 with 6 decimals
      decimals: 6,
      updatedBy: TEST_ADDRESSES.VALID_2,
      gasCost: '30000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.newLimit).toBe('5000000000');
    expect(response.newLimitFormatted).toBe('5000');
    expect(response.timestamp).toBeDefined();
  });
});

describe('createAccessKeyErrorResponse', () => {
  it('should create error response with all fields', () => {
    const response = createAccessKeyErrorResponse({
      code: 3003,
      message: 'Access key revoked',
      details: {
        suggestion: 'Create a new access key',
      },
      recoverable: false,
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(3003);
    expect(response.error.message).toBe('Access key revoked');
    expect(response.error.details?.suggestion).toBe('Create a new access key');
    expect(response.error.recoverable).toBe(false);
  });

  it('should work with minimal error', () => {
    const response = createAccessKeyErrorResponse({
      code: 2001,
      message: 'Key not found',
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(2001);
    expect(response.error.details).toBeUndefined();
  });

  it('should include retryAfter when provided', () => {
    const response = createAccessKeyErrorResponse({
      code: 4001,
      message: 'Rate limited',
      recoverable: true,
      retryAfter: 60,
    });

    expect(response.error.recoverable).toBe(true);
    expect(response.error.retryAfter).toBe(60);
  });
});

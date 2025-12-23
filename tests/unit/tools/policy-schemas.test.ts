/**
 * Policy Tool Schemas Unit Tests
 *
 * Tests for Zod schemas used in TIP-403 Policy Registry tools.
 * Validates input parsing and response helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  // Input schemas
  createPolicyInputZodSchema,
  checkTransferComplianceInputZodSchema,
  getPolicyInfoInputZodSchema,
  isWhitelistedInputZodSchema,
  isBlacklistedInputZodSchema,
  addToWhitelistInputZodSchema,
  removeFromWhitelistInputZodSchema,
  addToBlacklistInputZodSchema,
  removeFromBlacklistInputZodSchema,
  burnBlockedTokensInputZodSchema,
  // Response helpers
  createCreatePolicyResponse,
  createCheckTransferComplianceResponse,
  createGetPolicyInfoResponse,
  createIsWhitelistedResponse,
  createIsBlacklistedResponse,
  createAddToWhitelistResponse,
  createRemoveFromWhitelistResponse,
  createAddToBlacklistResponse,
  createRemoveFromBlacklistResponse,
  createBurnBlockedTokensResponse,
  createPolicyErrorResponse,
  // Constants
  POLICY_TYPES,
  POLICY_TYPE_DESCRIPTIONS,
} from '../../../src/tools/policy/schemas.js';
import {
  TEST_ADDRESSES,
  TEST_TOKENS,
  TEST_TX_HASHES,
} from '../../utils/test-helpers.js';

// =============================================================================
// Constants Tests
// =============================================================================

describe('Policy Schema Constants', () => {
  describe('POLICY_TYPES', () => {
    it('should contain all TIP-403 policy types', () => {
      expect(POLICY_TYPES).toContain('whitelist');
      expect(POLICY_TYPES).toContain('blacklist');
      expect(POLICY_TYPES).toContain('none');
    });

    it('should have exactly 3 policy types', () => {
      expect(POLICY_TYPES).toHaveLength(3);
    });
  });

  describe('POLICY_TYPE_DESCRIPTIONS', () => {
    it('should have descriptions for all policy types', () => {
      for (const policyType of POLICY_TYPES) {
        expect(POLICY_TYPE_DESCRIPTIONS[policyType]).toBeDefined();
        expect(typeof POLICY_TYPE_DESCRIPTIONS[policyType]).toBe('string');
        expect(POLICY_TYPE_DESCRIPTIONS[policyType].length).toBeGreaterThan(0);
      }
    });
  });
});

// =============================================================================
// Input Schema Tests
// =============================================================================

describe('createPolicyInputSchema', () => {
  it('should accept whitelist policy type', () => {
    const input = {
      policyType: 'whitelist',
    };

    const result = createPolicyInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept blacklist policy type', () => {
    const input = {
      policyType: 'blacklist',
    };

    const result = createPolicyInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid policy type', () => {
    const input = {
      policyType: 'none',
    };

    const result = createPolicyInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept optional admin address', () => {
    const input = {
      policyType: 'whitelist',
      admin: TEST_ADDRESSES.VALID,
    };

    const result = createPolicyInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid admin address', () => {
    const input = {
      policyType: 'whitelist',
      admin: 'invalid-address',
    };

    const result = createPolicyInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept optional initialAccounts array', () => {
    const input = {
      policyType: 'whitelist',
      initialAccounts: [TEST_ADDRESSES.VALID, TEST_ADDRESSES.VALID_2],
    };

    const result = createPolicyInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept empty initialAccounts array', () => {
    const input = {
      policyType: 'blacklist',
      initialAccounts: [],
    };

    const result = createPolicyInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid addresses in initialAccounts', () => {
    const input = {
      policyType: 'whitelist',
      initialAccounts: [TEST_ADDRESSES.VALID, 'invalid-address'],
    };

    const result = createPolicyInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept all optional fields together', () => {
    const input = {
      policyType: 'blacklist',
      admin: TEST_ADDRESSES.VALID,
      initialAccounts: [TEST_ADDRESSES.VALID_2, TEST_ADDRESSES.VALID_3],
    };

    const result = createPolicyInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should require policyType', () => {
    const input = {
      admin: TEST_ADDRESSES.VALID,
    };

    const result = createPolicyInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('checkTransferComplianceInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      from: TEST_ADDRESSES.VALID,
      to: TEST_ADDRESSES.VALID_2,
    };

    const result = checkTransferComplianceInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid from address', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      from: 'invalid-address',
      to: TEST_ADDRESSES.VALID_2,
    };

    const result = checkTransferComplianceInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject invalid to address', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      from: TEST_ADDRESSES.VALID,
      to: 'invalid-address',
    };

    const result = checkTransferComplianceInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject empty token', () => {
    const input = {
      token: '',
      from: TEST_ADDRESSES.VALID,
      to: TEST_ADDRESSES.VALID_2,
    };

    const result = checkTransferComplianceInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('getPolicyInfoInputSchema', () => {
  it('should accept valid policy ID', () => {
    const input = { policyId: 1 };

    const result = getPolicyInfoInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept zero policy ID (built-in always-reject policy)', () => {
    const input = { policyId: 0 };

    const result = getPolicyInfoInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject negative policy ID', () => {
    const input = { policyId: -1 };

    const result = getPolicyInfoInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject non-integer policy ID', () => {
    const input = { policyId: 1.5 };

    const result = getPolicyInfoInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('isWhitelistedInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      policyId: 1,
      account: TEST_ADDRESSES.VALID,
    };

    const result = isWhitelistedInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid account address', () => {
    const input = {
      policyId: 1,
      account: 'invalid-address',
    };

    const result = isWhitelistedInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject missing policyId', () => {
    const input = {
      account: TEST_ADDRESSES.VALID,
    };

    const result = isWhitelistedInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('isBlacklistedInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      policyId: 1,
      account: TEST_ADDRESSES.VALID_2,
    };

    const result = isBlacklistedInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject short address', () => {
    const input = {
      policyId: 1,
      account: TEST_ADDRESSES.SHORT,
    };

    const result = isBlacklistedInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('addToWhitelistInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      policyId: 5,
      account: TEST_ADDRESSES.VALID_3,
    };

    const result = addToWhitelistInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept large policy IDs', () => {
    const input = {
      policyId: 999999,
      account: TEST_ADDRESSES.VALID,
    };

    const result = addToWhitelistInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('removeFromWhitelistInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      policyId: 1,
      account: TEST_ADDRESSES.VALID,
    };

    const result = removeFromWhitelistInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept lowercase addresses', () => {
    const input = {
      policyId: 1,
      account: TEST_ADDRESSES.LOWERCASE,
    };

    const result = removeFromWhitelistInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('addToBlacklistInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      policyId: 1,
      account: TEST_ADDRESSES.VALID_2,
    };

    const result = addToBlacklistInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject address without 0x prefix', () => {
    const input = {
      policyId: 1,
      account: TEST_ADDRESSES.NO_PREFIX,
    };

    const result = addToBlacklistInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('removeFromBlacklistInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      policyId: 1,
      account: TEST_ADDRESSES.VALID,
    };

    const result = removeFromBlacklistInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('burnBlockedTokensInputSchema', () => {
  it('should accept valid input with numeric amount', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      blockedAddress: TEST_ADDRESSES.VALID,
      amount: '1000.50',
    };

    const result = burnBlockedTokensInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept "all" as amount', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      blockedAddress: TEST_ADDRESSES.VALID_2,
      amount: 'all',
    };

    const result = burnBlockedTokensInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject empty token', () => {
    const input = {
      token: '',
      blockedAddress: TEST_ADDRESSES.VALID,
      amount: '100',
    };

    const result = burnBlockedTokensInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject invalid blocked address', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      blockedAddress: 'invalid',
      amount: '100',
    };

    const result = burnBlockedTokensInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Response Helper Tests
// =============================================================================

describe('createCreatePolicyResponse', () => {
  it('should create valid response for whitelist policy', () => {
    const response = createCreatePolicyResponse({
      policyId: 5,
      policyType: 'whitelist',
      admin: TEST_ADDRESSES.VALID,
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      gasCost: '50000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.policyId).toBe(5);
    expect(response.policyType).toBe('whitelist');
    expect(response.admin).toBe(TEST_ADDRESSES.VALID);
    expect(response.transactionHash).toBe(TEST_TX_HASHES.VALID);
    expect(response.blockNumber).toBe(12345);
    expect(response.timestamp).toBeDefined();
  });

  it('should create valid response for blacklist policy', () => {
    const response = createCreatePolicyResponse({
      policyId: 10,
      policyType: 'blacklist',
      admin: TEST_ADDRESSES.VALID_2,
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 99999,
      gasCost: '60000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.policyId).toBe(10);
    expect(response.policyType).toBe('blacklist');
  });

  it('should include ISO timestamp', () => {
    const response = createCreatePolicyResponse({
      policyId: 2,
      policyType: 'whitelist',
      admin: TEST_ADDRESSES.VALID,
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      gasCost: '50000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should include explorer URL', () => {
    const explorerUrl = 'https://explore.tempo.xyz/tx/0xabc123';
    const response = createCreatePolicyResponse({
      policyId: 3,
      policyType: 'whitelist',
      admin: TEST_ADDRESSES.VALID,
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      gasCost: '50000',
      explorerUrl,
    });

    expect(response.explorerUrl).toBe(explorerUrl);
  });
});

describe('createCheckTransferComplianceResponse', () => {
  it('should create valid response for allowed transfer', () => {
    const response = createCheckTransferComplianceResponse({
      allowed: true,
      policyId: 1,
      policyType: 'whitelist',
      fromStatus: { isWhitelisted: true, isBlacklisted: false },
      toStatus: { isWhitelisted: true, isBlacklisted: false },
      reason: null,
      token: TEST_TOKENS.ALPHA_USD,
      from: TEST_ADDRESSES.VALID,
      to: TEST_ADDRESSES.VALID_2,
    });

    expect(response.allowed).toBe(true);
    expect(response.policyType).toBe('whitelist');
    expect(response.fromStatus.isWhitelisted).toBe(true);
    expect(response.reason).toBeNull();
  });

  it('should create valid response for blocked transfer', () => {
    const response = createCheckTransferComplianceResponse({
      allowed: false,
      policyId: 2,
      policyType: 'blacklist',
      fromStatus: { isWhitelisted: false, isBlacklisted: true },
      toStatus: { isWhitelisted: false, isBlacklisted: false },
      reason: 'Sender is blacklisted',
      token: TEST_TOKENS.ALPHA_USD,
      from: TEST_ADDRESSES.VALID,
      to: TEST_ADDRESSES.VALID_2,
    });

    expect(response.allowed).toBe(false);
    expect(response.fromStatus.isBlacklisted).toBe(true);
    expect(response.reason).toBe('Sender is blacklisted');
  });

  it('should handle null policy ID for tokens with no policy', () => {
    const response = createCheckTransferComplianceResponse({
      allowed: true,
      policyId: null,
      policyType: 'none',
      fromStatus: { isWhitelisted: false, isBlacklisted: false },
      toStatus: { isWhitelisted: false, isBlacklisted: false },
      reason: null,
      token: TEST_TOKENS.ALPHA_USD,
      from: TEST_ADDRESSES.VALID,
      to: TEST_ADDRESSES.VALID_2,
    });

    expect(response.policyId).toBeNull();
    expect(response.policyType).toBe('none');
  });
});

describe('createGetPolicyInfoResponse', () => {
  it('should include policy type description', () => {
    const response = createGetPolicyInfoResponse({
      policyId: 1,
      policyType: 'whitelist',
      owner: TEST_ADDRESSES.VALID,
      tokenCount: 5,
    });

    expect(response.policyId).toBe(1);
    expect(response.policyType).toBe('whitelist');
    expect(response.policyTypeDescription).toBe(
      POLICY_TYPE_DESCRIPTIONS.whitelist
    );
    expect(response.tokenCount).toBe(5);
  });

  it('should handle blacklist policy type', () => {
    const response = createGetPolicyInfoResponse({
      policyId: 2,
      policyType: 'blacklist',
      owner: TEST_ADDRESSES.VALID_2,
      tokenCount: 10,
    });

    expect(response.policyTypeDescription).toBe(
      POLICY_TYPE_DESCRIPTIONS.blacklist
    );
  });

  it('should handle none policy type', () => {
    const response = createGetPolicyInfoResponse({
      policyId: 3,
      policyType: 'none',
      owner: TEST_ADDRESSES.VALID,
      tokenCount: 0,
    });

    expect(response.policyTypeDescription).toBe(POLICY_TYPE_DESCRIPTIONS.none);
  });
});

describe('createIsWhitelistedResponse', () => {
  it('should create response for whitelisted account', () => {
    const response = createIsWhitelistedResponse({
      isWhitelisted: true,
      policyId: 1,
      account: TEST_ADDRESSES.VALID,
    });

    expect(response.isWhitelisted).toBe(true);
    expect(response.policyId).toBe(1);
    expect(response.account).toBe(TEST_ADDRESSES.VALID);
  });

  it('should create response for non-whitelisted account', () => {
    const response = createIsWhitelistedResponse({
      isWhitelisted: false,
      policyId: 2,
      account: TEST_ADDRESSES.VALID_2,
    });

    expect(response.isWhitelisted).toBe(false);
  });
});

describe('createIsBlacklistedResponse', () => {
  it('should create response for blacklisted account', () => {
    const response = createIsBlacklistedResponse({
      isBlacklisted: true,
      policyId: 1,
      account: TEST_ADDRESSES.VALID,
    });

    expect(response.isBlacklisted).toBe(true);
    expect(response.policyId).toBe(1);
  });

  it('should create response for non-blacklisted account', () => {
    const response = createIsBlacklistedResponse({
      isBlacklisted: false,
      policyId: 1,
      account: TEST_ADDRESSES.VALID_2,
    });

    expect(response.isBlacklisted).toBe(false);
  });
});

describe('createAddToWhitelistResponse', () => {
  it('should create valid response with all fields', () => {
    const response = createAddToWhitelistResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      policyId: 1,
      account: TEST_ADDRESSES.VALID,
      addedBy: TEST_ADDRESSES.VALID_2,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.transactionHash).toBe(TEST_TX_HASHES.VALID);
    expect(response.action).toBe('whitelisted');
    expect(response.timestamp).toBeDefined();
  });

  it('should include ISO timestamp', () => {
    const response = createAddToWhitelistResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      policyId: 1,
      account: TEST_ADDRESSES.VALID,
      addedBy: TEST_ADDRESSES.VALID_2,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('createRemoveFromWhitelistResponse', () => {
  it('should create valid response', () => {
    const response = createRemoveFromWhitelistResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      policyId: 1,
      account: TEST_ADDRESSES.VALID,
      removedBy: TEST_ADDRESSES.VALID_2,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.action).toBe('removed_from_whitelist');
    expect(response.removedBy).toBe(TEST_ADDRESSES.VALID_2);
  });
});

describe('createAddToBlacklistResponse', () => {
  it('should create valid response', () => {
    const response = createAddToBlacklistResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      policyId: 1,
      account: TEST_ADDRESSES.VALID,
      blockedBy: TEST_ADDRESSES.VALID_2,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.action).toBe('blacklisted');
    expect(response.blockedBy).toBe(TEST_ADDRESSES.VALID_2);
  });
});

describe('createRemoveFromBlacklistResponse', () => {
  it('should create valid response', () => {
    const response = createRemoveFromBlacklistResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      policyId: 1,
      account: TEST_ADDRESSES.VALID,
      unblockedBy: TEST_ADDRESSES.VALID_2,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.action).toBe('removed_from_blacklist');
    expect(response.unblockedBy).toBe(TEST_ADDRESSES.VALID_2);
  });
});

describe('createBurnBlockedTokensResponse', () => {
  it('should create valid response with all fields', () => {
    const response = createBurnBlockedTokensResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      blockedAddress: TEST_ADDRESSES.VALID,
      amountBurned: '1000000000',
      amountBurnedFormatted: '1000.00',
      burnedBy: TEST_ADDRESSES.VALID_2,
      gasCost: '45000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.transactionHash).toBe(TEST_TX_HASHES.VALID);
    expect(response.token).toBe(TEST_TOKENS.ALPHA_USD);
    expect(response.amountBurnedFormatted).toBe('1000.00');
    expect(response.timestamp).toBeDefined();
  });

  it('should include burnedBy field', () => {
    const response = createBurnBlockedTokensResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      blockedAddress: TEST_ADDRESSES.VALID,
      amountBurned: '500000000',
      amountBurnedFormatted: '500.00',
      burnedBy: TEST_ADDRESSES.VALID_3,
      gasCost: '45000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.burnedBy).toBe(TEST_ADDRESSES.VALID_3);
  });
});

describe('createPolicyErrorResponse', () => {
  it('should create error response with all fields', () => {
    const response = createPolicyErrorResponse({
      code: 4001,
      message: 'Policy not found',
      details: {
        suggestion: 'Verify the policy ID is correct',
      },
      recoverable: false,
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(4001);
    expect(response.error.message).toBe('Policy not found');
    expect(response.error.details?.suggestion).toBe(
      'Verify the policy ID is correct'
    );
    expect(response.error.recoverable).toBe(false);
  });

  it('should work with minimal error', () => {
    const response = createPolicyErrorResponse({
      code: 2001,
      message: 'Access denied',
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(2001);
    expect(response.error.details).toBeUndefined();
  });

  it('should include retryAfter when provided', () => {
    const response = createPolicyErrorResponse({
      code: 3001,
      message: 'Rate limited',
      recoverable: true,
      retryAfter: 60,
    });

    expect(response.error.recoverable).toBe(true);
    expect(response.error.retryAfter).toBe(60);
  });

  it('should include detailed error fields', () => {
    const response = createPolicyErrorResponse({
      code: 1001,
      message: 'Invalid address format',
      details: {
        field: 'account',
        expected: '0x-prefixed 40-char hex',
        received: 'invalid',
      },
    });

    expect(response.error.details?.field).toBe('account');
    expect(response.error.details?.expected).toBe('0x-prefixed 40-char hex');
    expect(response.error.details?.received).toBe('invalid');
  });
});

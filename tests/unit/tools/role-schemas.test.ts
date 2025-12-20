/**
 * Role Tool Schemas Unit Tests
 *
 * Tests for Zod schemas used in role management tools.
 * Validates input parsing and response helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  // Input schemas
  grantRoleInputZodSchema,
  revokeRoleInputZodSchema,
  renounceRoleInputZodSchema,
  hasRoleInputZodSchema,
  getRoleMembersInputZodSchema,
  pauseTokenInputZodSchema,
  unpauseTokenInputZodSchema,
  // Response helpers
  createGrantRoleResponse,
  createRevokeRoleResponse,
  createRenounceRoleResponse,
  createHasRoleResponse,
  createGetRoleMembersResponse,
  createPauseTokenResponse,
  createUnpauseTokenResponse,
  createRoleErrorResponse,
  // Constants
  ROLE_NAMES,
  ROLE_DESCRIPTIONS,
} from '../../../src/tools/roles/schemas.js';
import {
  TEST_ADDRESSES,
  TEST_TOKENS,
  TEST_TX_HASHES,
} from '../../utils/test-helpers.js';

// =============================================================================
// Constants Tests
// =============================================================================

describe('Role Schema Constants', () => {
  describe('ROLE_NAMES', () => {
    it('should contain all TIP-20 roles', () => {
      expect(ROLE_NAMES).toContain('DEFAULT_ADMIN_ROLE');
      expect(ROLE_NAMES).toContain('ISSUER_ROLE');
      expect(ROLE_NAMES).toContain('PAUSE_ROLE');
      expect(ROLE_NAMES).toContain('UNPAUSE_ROLE');
      expect(ROLE_NAMES).toContain('BURN_BLOCKED_ROLE');
    });

    it('should have exactly 5 roles', () => {
      expect(ROLE_NAMES).toHaveLength(5);
    });
  });

  describe('ROLE_DESCRIPTIONS', () => {
    it('should have descriptions for all roles', () => {
      for (const role of ROLE_NAMES) {
        expect(ROLE_DESCRIPTIONS[role]).toBeDefined();
        expect(typeof ROLE_DESCRIPTIONS[role]).toBe('string');
        expect(ROLE_DESCRIPTIONS[role].length).toBeGreaterThan(0);
      }
    });
  });
});

// =============================================================================
// Input Schema Tests
// =============================================================================

describe('grantRoleInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      role: 'ISSUER_ROLE',
      account: TEST_ADDRESSES.VALID,
    };

    const result = grantRoleInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid role name', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      role: 'INVALID_ROLE',
      account: TEST_ADDRESSES.VALID,
    };

    const result = grantRoleInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject invalid account address', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      role: 'ISSUER_ROLE',
      account: 'invalid-address',
    };

    const result = grantRoleInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept all valid role names', () => {
    for (const role of ROLE_NAMES) {
      const input = {
        token: TEST_TOKENS.ALPHA_USD,
        role,
        account: TEST_ADDRESSES.VALID,
      };

      const result = grantRoleInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });
});

describe('revokeRoleInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      role: 'PAUSE_ROLE',
      account: TEST_ADDRESSES.VALID_2,
    };

    const result = revokeRoleInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject empty token', () => {
    const input = {
      token: '',
      role: 'PAUSE_ROLE',
      account: TEST_ADDRESSES.VALID,
    };

    const result = revokeRoleInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('renounceRoleInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      role: 'ISSUER_ROLE',
    };

    const result = renounceRoleInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should not require account (caller renounces own role)', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      role: 'DEFAULT_ADMIN_ROLE',
    };

    const result = renounceRoleInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('account');
  });
});

describe('hasRoleInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      role: 'BURN_BLOCKED_ROLE',
      account: TEST_ADDRESSES.VALID_3,
    };

    const result = hasRoleInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('getRoleMembersInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      role: 'UNPAUSE_ROLE',
    };

    const result = getRoleMembersInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should not require account', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      role: 'PAUSE_ROLE',
    };

    const result = getRoleMembersInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('pauseTokenInputSchema', () => {
  it('should accept valid input with reason', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      reason: 'Security incident detected',
    };

    const result = pauseTokenInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept input without reason', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
    };

    const result = pauseTokenInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject reason exceeding max length', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      reason: 'x'.repeat(300), // Exceeds 256 char limit
    };

    const result = pauseTokenInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('unpauseTokenInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      reason: 'Security issue resolved',
    };

    const result = unpauseTokenInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Response Helper Tests
// =============================================================================

describe('createGrantRoleResponse', () => {
  it('should create valid response with all fields', () => {
    const response = createGrantRoleResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      role: 'ISSUER_ROLE',
      account: TEST_ADDRESSES.VALID_2,
      grantedBy: TEST_ADDRESSES.VALID,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.transactionHash).toBe(TEST_TX_HASHES.VALID);
    expect(response.token).toBe(TEST_TOKENS.ALPHA_USD);
    expect(response.role).toBe('ISSUER_ROLE');
    expect(response.timestamp).toBeDefined();
  });

  it('should include ISO timestamp', () => {
    const response = createGrantRoleResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      role: 'PAUSE_ROLE',
      account: TEST_ADDRESSES.VALID_2,
      grantedBy: TEST_ADDRESSES.VALID,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('createRevokeRoleResponse', () => {
  it('should create valid response', () => {
    const response = createRevokeRoleResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      role: 'ISSUER_ROLE',
      account: TEST_ADDRESSES.VALID_2,
      revokedBy: TEST_ADDRESSES.VALID,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.revokedBy).toBe(TEST_ADDRESSES.VALID);
  });
});

describe('createRenounceRoleResponse', () => {
  it('should create valid response', () => {
    const response = createRenounceRoleResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      role: 'ISSUER_ROLE',
      renouncedBy: TEST_ADDRESSES.VALID,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.renouncedBy).toBe(TEST_ADDRESSES.VALID);
  });
});

describe('createHasRoleResponse', () => {
  it('should include role description', () => {
    const response = createHasRoleResponse({
      hasRole: true,
      token: TEST_TOKENS.ALPHA_USD,
      role: 'ISSUER_ROLE',
      account: TEST_ADDRESSES.VALID,
    });

    expect(response.hasRole).toBe(true);
    expect(response.roleDescription).toBe(ROLE_DESCRIPTIONS.ISSUER_ROLE);
  });

  it('should handle false hasRole', () => {
    const response = createHasRoleResponse({
      hasRole: false,
      token: TEST_TOKENS.ALPHA_USD,
      role: 'DEFAULT_ADMIN_ROLE',
      account: TEST_ADDRESSES.VALID_2,
    });

    expect(response.hasRole).toBe(false);
    expect(response.roleDescription).toBeDefined();
  });
});

describe('createGetRoleMembersResponse', () => {
  it('should include member count', () => {
    const members = [TEST_ADDRESSES.VALID, TEST_ADDRESSES.VALID_2];
    const response = createGetRoleMembersResponse({
      token: TEST_TOKENS.ALPHA_USD,
      role: 'ISSUER_ROLE',
      members,
    });

    expect(response.memberCount).toBe(2);
    expect(response.members).toEqual(members);
    expect(response.roleDescription).toBeDefined();
  });

  it('should handle empty members array', () => {
    const response = createGetRoleMembersResponse({
      token: TEST_TOKENS.ALPHA_USD,
      role: 'BURN_BLOCKED_ROLE',
      members: [],
    });

    expect(response.memberCount).toBe(0);
    expect(response.members).toEqual([]);
  });
});

describe('createPauseTokenResponse', () => {
  it('should set isPaused to true', () => {
    const response = createPauseTokenResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      pausedBy: TEST_ADDRESSES.VALID,
      reason: 'Security incident',
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.isPaused).toBe(true);
    expect(response.reason).toBe('Security incident');
  });

  it('should handle null reason', () => {
    const response = createPauseTokenResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      pausedBy: TEST_ADDRESSES.VALID,
      reason: null,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.reason).toBeNull();
  });
});

describe('createUnpauseTokenResponse', () => {
  it('should set isPaused to false', () => {
    const response = createUnpauseTokenResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      unpausedBy: TEST_ADDRESSES.VALID,
      reason: 'Issue resolved',
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.isPaused).toBe(false);
  });
});

describe('createRoleErrorResponse', () => {
  it('should create error response with all fields', () => {
    const response = createRoleErrorResponse({
      code: 3003,
      message: 'Transaction reverted',
      details: {
        suggestion: 'Check role permissions',
      },
      recoverable: true,
      retryAfter: 60,
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(3003);
    expect(response.error.message).toBe('Transaction reverted');
    expect(response.error.details?.suggestion).toBe('Check role permissions');
    expect(response.error.recoverable).toBe(true);
    expect(response.error.retryAfter).toBe(60);
  });

  it('should work with minimal error', () => {
    const response = createRoleErrorResponse({
      code: 2001,
      message: 'Access denied',
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(2001);
    expect(response.error.details).toBeUndefined();
  });
});

/**
 * Rewards Tool Schemas Unit Tests
 *
 * Tests for Zod schemas used in TIP-20 rewards management tools.
 * Validates input parsing and response helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  // Input schemas
  optInRewardsInputZodSchema,
  optOutRewardsInputZodSchema,
  claimRewardsInputZodSchema,
  getPendingRewardsInputZodSchema,
  setRewardRecipientInputZodSchema,
  getRewardStatusInputZodSchema,
  // Response helpers
  createOptInRewardsResponse,
  createOptOutRewardsResponse,
  createClaimRewardsResponse,
  createGetPendingRewardsResponse,
  createSetRewardRecipientResponse,
  createGetRewardStatusResponse,
  createRewardsErrorResponse,
} from '../../../src/tools/rewards/schemas.js';
import {
  TEST_ADDRESSES,
  TEST_TOKENS,
  TEST_TX_HASHES,
} from '../../utils/test-helpers.js';

// =============================================================================
// Input Schema Tests
// =============================================================================

describe('optInRewardsInputSchema', () => {
  it('should accept valid token address', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
    };

    const result = optInRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept token alias', () => {
    const input = {
      token: 'AlphaUSD',
    };

    const result = optInRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject empty token', () => {
    const input = {
      token: '',
    };

    const result = optInRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject missing token', () => {
    const input = {};

    const result = optInRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('optOutRewardsInputSchema', () => {
  it('should accept valid input with claimPending true', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      claimPending: true,
    };

    const result = optOutRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.claimPending).toBe(true);
    }
  });

  it('should accept valid input with claimPending false', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      claimPending: false,
    };

    const result = optOutRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.claimPending).toBe(false);
    }
  });

  it('should default claimPending to true when not provided', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
    };

    const result = optOutRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.claimPending).toBe(true);
    }
  });

  it('should reject empty token', () => {
    const input = {
      token: '',
      claimPending: true,
    };

    const result = optOutRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('claimRewardsInputSchema', () => {
  it('should accept valid token address', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
    };

    const result = claimRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject empty token', () => {
    const input = {
      token: '',
    };

    const result = claimRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('getPendingRewardsInputSchema', () => {
  it('should accept valid input without account', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
    };

    const result = getPendingRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.account).toBeUndefined();
    }
  });

  it('should accept valid input with account', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID,
    };

    const result = getPendingRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.account).toBe(TEST_ADDRESSES.VALID);
    }
  });

  it('should reject invalid account address format', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      account: 'invalid-address',
    };

    const result = getPendingRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject account without 0x prefix', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      account: 'a'.repeat(40), // 40 hex chars without 0x
    };

    const result = getPendingRewardsInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('setRewardRecipientInputSchema', () => {
  it('should accept valid input', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      recipient: TEST_ADDRESSES.VALID_2,
    };

    const result = setRewardRecipientInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept zero address (for clearing recipient)', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      recipient: '0x0000000000000000000000000000000000000000',
    };

    const result = setRewardRecipientInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid recipient address', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      recipient: 'invalid-address',
    };

    const result = setRewardRecipientInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject missing recipient', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
    };

    const result = setRewardRecipientInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('getRewardStatusInputSchema', () => {
  it('should accept valid input without account', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
    };

    const result = getRewardStatusInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept valid input with account', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID_3,
    };

    const result = getRewardStatusInputZodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid account format', () => {
    const input = {
      token: TEST_TOKENS.ALPHA_USD,
      account: '0xZZZZZZZZ', // Invalid hex
    };

    const result = getRewardStatusInputZodSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Response Helper Tests
// =============================================================================

describe('createOptInRewardsResponse', () => {
  it('should create valid response with all fields', () => {
    const response = createOptInRewardsResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.transactionHash).toBe(TEST_TX_HASHES.VALID);
    expect(response.token).toBe(TEST_TOKENS.ALPHA_USD);
    expect(response.account).toBe(TEST_ADDRESSES.VALID);
    expect(response.message).toContain('opted into rewards');
    expect(response.timestamp).toBeDefined();
  });

  it('should include ISO timestamp', () => {
    const response = createOptInRewardsResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('createOptOutRewardsResponse', () => {
  it('should create valid response when pending claimed before', () => {
    const response = createOptOutRewardsResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID,
      pendingClaimedBefore: true,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.pendingClaimedBefore).toBe(true);
    expect(response.message).toContain('Pending rewards were claimed');
  });

  it('should create valid response when pending not claimed before', () => {
    const response = createOptOutRewardsResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID,
      pendingClaimedBefore: false,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.pendingClaimedBefore).toBe(false);
    expect(response.message).not.toContain('Pending rewards were claimed');
  });
});

describe('createClaimRewardsResponse', () => {
  it('should create valid response with all fields', () => {
    const response = createClaimRewardsResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID,
      amountClaimed: '100000000',
      amountClaimedFormatted: '100.00 AUSD',
      recipient: TEST_ADDRESSES.VALID,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.amountClaimed).toBe('100000000');
    expect(response.amountClaimedFormatted).toBe('100.00 AUSD');
    expect(response.recipient).toBe(TEST_ADDRESSES.VALID);
    expect(response.timestamp).toBeDefined();
  });
});

describe('createGetPendingRewardsResponse', () => {
  it('should create valid response', () => {
    const response = createGetPendingRewardsResponse({
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID,
      pendingRewards: '50000000',
      pendingRewardsFormatted: '50.00 AUSD',
      isOptedIn: true,
    });

    expect(response.token).toBe(TEST_TOKENS.ALPHA_USD);
    expect(response.pendingRewards).toBe('50000000');
    expect(response.isOptedIn).toBe(true);
  });

  it('should handle not opted in state', () => {
    const response = createGetPendingRewardsResponse({
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID,
      pendingRewards: '0',
      pendingRewardsFormatted: '0.00 AUSD',
      isOptedIn: false,
    });

    expect(response.isOptedIn).toBe(false);
    expect(response.pendingRewards).toBe('0');
  });
});

describe('createSetRewardRecipientResponse', () => {
  it('should create valid response for setting recipient', () => {
    const response = createSetRewardRecipientResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID,
      recipient: TEST_ADDRESSES.VALID_2,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.recipient).toBe(TEST_ADDRESSES.VALID_2);
    expect(response.message).toContain('Reward recipient set');
    expect(response.message).toContain(TEST_ADDRESSES.VALID_2);
  });

  it('should create valid response for clearing recipient', () => {
    const zeroAddress = '0x0000000000000000000000000000000000000000';
    const response = createSetRewardRecipientResponse({
      transactionHash: TEST_TX_HASHES.VALID,
      blockNumber: 12345,
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID,
      recipient: zeroAddress,
      gasCost: '21000',
      explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
    });

    expect(response.success).toBe(true);
    expect(response.recipient).toBe(zeroAddress);
    expect(response.message).toContain('Reward recipient cleared');
  });
});

describe('createGetRewardStatusResponse', () => {
  it('should create valid response with all fields', () => {
    const response = createGetRewardStatusResponse({
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID,
      isOptedIn: true,
      pendingRewards: '100000000',
      pendingRewardsFormatted: '100.00 AUSD',
      optedInBalance: '1000000000',
      optedInBalanceFormatted: '1000.00 AUSD',
      totalBalance: '1000000000',
      totalBalanceFormatted: '1000.00 AUSD',
      participationRate: '100.00%',
      rewardRecipient: null,
      totalClaimed: '50000000',
      totalClaimedFormatted: '50.00 AUSD',
      tokenStats: {
        totalOptedInSupply: '1000000000000',
        totalOptedInSupplyFormatted: '1,000,000.00 AUSD',
        totalDistributed: '10000000000',
        totalDistributedFormatted: '10,000.00 AUSD',
      },
      shareOfPool: '0.10%',
    });

    expect(response.isOptedIn).toBe(true);
    expect(response.pendingRewards).toBe('100000000');
    expect(response.participationRate).toBe('100.00%');
    expect(response.rewardRecipient).toBeNull();
    expect(response.tokenStats.totalOptedInSupply).toBe('1000000000000');
    expect(response.shareOfPool).toBe('0.10%');
  });

  it('should handle non-opted-in status', () => {
    const response = createGetRewardStatusResponse({
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID,
      isOptedIn: false,
      pendingRewards: '0',
      pendingRewardsFormatted: '0.00 AUSD',
      optedInBalance: '0',
      optedInBalanceFormatted: '0.00 AUSD',
      totalBalance: '1000000000',
      totalBalanceFormatted: '1000.00 AUSD',
      participationRate: '0.00%',
      rewardRecipient: null,
      totalClaimed: '0',
      totalClaimedFormatted: '0.00 AUSD',
      tokenStats: {
        totalOptedInSupply: '1000000000000',
        totalOptedInSupplyFormatted: '1,000,000.00 AUSD',
        totalDistributed: '10000000000',
        totalDistributedFormatted: '10,000.00 AUSD',
      },
      shareOfPool: '0.00%',
    });

    expect(response.isOptedIn).toBe(false);
    expect(response.participationRate).toBe('0.00%');
    expect(response.optedInBalance).toBe('0');
  });

  it('should handle custom reward recipient', () => {
    const response = createGetRewardStatusResponse({
      token: TEST_TOKENS.ALPHA_USD,
      account: TEST_ADDRESSES.VALID,
      isOptedIn: true,
      pendingRewards: '100000000',
      pendingRewardsFormatted: '100.00 AUSD',
      optedInBalance: '1000000000',
      optedInBalanceFormatted: '1000.00 AUSD',
      totalBalance: '1000000000',
      totalBalanceFormatted: '1000.00 AUSD',
      participationRate: '100.00%',
      rewardRecipient: TEST_ADDRESSES.VALID_2,
      totalClaimed: '50000000',
      totalClaimedFormatted: '50.00 AUSD',
      tokenStats: {
        totalOptedInSupply: '1000000000000',
        totalOptedInSupplyFormatted: '1,000,000.00 AUSD',
        totalDistributed: '10000000000',
        totalDistributedFormatted: '10,000.00 AUSD',
      },
      shareOfPool: '0.10%',
    });

    expect(response.rewardRecipient).toBe(TEST_ADDRESSES.VALID_2);
  });
});

describe('createRewardsErrorResponse', () => {
  it('should create error response with all fields', () => {
    const response = createRewardsErrorResponse({
      code: 4001,
      message: 'Not opted into rewards',
      details: {
        suggestion: 'Call opt_in_rewards first',
      },
      recoverable: true,
      retryAfter: 0,
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(4001);
    expect(response.error.message).toBe('Not opted into rewards');
    expect(response.error.details?.suggestion).toBe('Call opt_in_rewards first');
    expect(response.error.recoverable).toBe(true);
    expect(response.error.retryAfter).toBe(0);
  });

  it('should work with minimal error', () => {
    const response = createRewardsErrorResponse({
      code: 3001,
      message: 'Transaction failed',
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(3001);
    expect(response.error.details).toBeUndefined();
    expect(response.error.recoverable).toBeUndefined();
  });

  it('should handle detailed error information', () => {
    const response = createRewardsErrorResponse({
      code: 1001,
      message: 'Invalid address format',
      details: {
        field: 'recipient',
        expected: '0x-prefixed 40-char hex',
        received: 'invalid-address',
      },
    });

    expect(response.error.details?.field).toBe('recipient');
    expect(response.error.details?.expected).toBe('0x-prefixed 40-char hex');
    expect(response.error.details?.received).toBe('invalid-address');
  });
});

/**
 * Rewards Tool Schemas
 *
 * Zod schemas for TIP-20 rewards management tool inputs and outputs.
 * These define the structure of data flowing through rewards tools:
 * - opt_in_rewards: Opt into rewards for a token
 * - opt_out_rewards: Opt out of rewards for a token
 * - claim_rewards: Claim pending rewards
 * - get_pending_rewards: Check pending reward balance
 * - set_reward_recipient: Set auto-forward address for rewards
 * - get_reward_status: Get comprehensive reward status
 */

import { z } from 'zod';

// =============================================================================
// Shared Schema Parts
// =============================================================================

const tokenAddressSchema = z
  .string()
  .min(1)
  .describe(
    'TIP-20 token address (0x-prefixed 40-character hex string) or token alias (e.g., "AlphaUSD")'
  );

const accountAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .describe('Account address (0x-prefixed 40-character hex string)');

const optionalAccountAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .optional()
  .describe('Account address to query (defaults to configured wallet address)');

// =============================================================================
// opt_in_rewards Schemas
// =============================================================================

/**
 * Input schema for the opt_in_rewards tool.
 */
export const optInRewardsInputSchema = {
  token: tokenAddressSchema.describe('TIP-20 token to opt into rewards for'),
};

export const optInRewardsInputZodSchema = z.object(optInRewardsInputSchema);
export type OptInRewardsInput = z.infer<typeof optInRewardsInputZodSchema>;

/**
 * Output schema for successful opt_in_rewards response.
 */
export const optInRewardsOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  token: z.string(),
  account: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  message: z.string(),
  timestamp: z.string(),
});

export type OptInRewardsOutput = z.infer<typeof optInRewardsOutputSchema>;

// =============================================================================
// opt_out_rewards Schemas
// =============================================================================

/**
 * Input schema for the opt_out_rewards tool.
 */
export const optOutRewardsInputSchema = {
  token: tokenAddressSchema.describe('TIP-20 token to opt out of rewards for'),
  claimPending: z
    .boolean()
    .optional()
    .default(true)
    .describe('If true, claims pending rewards before opting out (default: true)'),
};

export const optOutRewardsInputZodSchema = z.object(optOutRewardsInputSchema);
export type OptOutRewardsInput = z.infer<typeof optOutRewardsInputZodSchema>;

/**
 * Output schema for successful opt_out_rewards response.
 */
export const optOutRewardsOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  token: z.string(),
  account: z.string(),
  pendingClaimedBefore: z.boolean(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  message: z.string(),
  timestamp: z.string(),
});

export type OptOutRewardsOutput = z.infer<typeof optOutRewardsOutputSchema>;

// =============================================================================
// claim_rewards Schemas
// =============================================================================

/**
 * Input schema for the claim_rewards tool.
 */
export const claimRewardsInputSchema = {
  token: tokenAddressSchema.describe('TIP-20 token to claim rewards for'),
};

export const claimRewardsInputZodSchema = z.object(claimRewardsInputSchema);
export type ClaimRewardsInput = z.infer<typeof claimRewardsInputZodSchema>;

/**
 * Output schema for successful claim_rewards response.
 */
export const claimRewardsOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  token: z.string(),
  account: z.string(),
  amountClaimed: z.string(),
  amountClaimedFormatted: z.string(),
  recipient: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type ClaimRewardsOutput = z.infer<typeof claimRewardsOutputSchema>;

// =============================================================================
// get_pending_rewards Schemas
// =============================================================================

/**
 * Input schema for the get_pending_rewards tool.
 */
export const getPendingRewardsInputSchema = {
  token: tokenAddressSchema.describe('TIP-20 token to check rewards for'),
  account: optionalAccountAddressSchema,
};

export const getPendingRewardsInputZodSchema = z.object(getPendingRewardsInputSchema);
export type GetPendingRewardsInput = z.infer<typeof getPendingRewardsInputZodSchema>;

/**
 * Output schema for get_pending_rewards response.
 */
export const getPendingRewardsOutputSchema = z.object({
  token: z.string(),
  account: z.string(),
  pendingRewards: z.string(),
  pendingRewardsFormatted: z.string(),
  isOptedIn: z.boolean(),
});

export type GetPendingRewardsOutput = z.infer<typeof getPendingRewardsOutputSchema>;

// =============================================================================
// set_reward_recipient Schemas
// =============================================================================

/**
 * Input schema for the set_reward_recipient tool.
 */
export const setRewardRecipientInputSchema = {
  token: tokenAddressSchema.describe('TIP-20 token to set reward recipient for'),
  recipient: accountAddressSchema.describe(
    'Address to auto-forward rewards to. Use zero address (0x0...0) to clear recipient.'
  ),
};

export const setRewardRecipientInputZodSchema = z.object(setRewardRecipientInputSchema);
export type SetRewardRecipientInput = z.infer<typeof setRewardRecipientInputZodSchema>;

/**
 * Output schema for successful set_reward_recipient response.
 */
export const setRewardRecipientOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  token: z.string(),
  account: z.string(),
  recipient: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  message: z.string(),
  timestamp: z.string(),
});

export type SetRewardRecipientOutput = z.infer<typeof setRewardRecipientOutputSchema>;

// =============================================================================
// get_reward_status Schemas
// =============================================================================

/**
 * Input schema for the get_reward_status tool.
 */
export const getRewardStatusInputSchema = {
  token: tokenAddressSchema.describe('TIP-20 token to get reward status for'),
  account: optionalAccountAddressSchema,
};

export const getRewardStatusInputZodSchema = z.object(getRewardStatusInputSchema);
export type GetRewardStatusInput = z.infer<typeof getRewardStatusInputZodSchema>;

/**
 * Output schema for get_reward_status response.
 */
export const getRewardStatusOutputSchema = z.object({
  token: z.string(),
  account: z.string(),
  isOptedIn: z.boolean(),
  pendingRewards: z.string(),
  pendingRewardsFormatted: z.string(),
  optedInBalance: z.string(),
  optedInBalanceFormatted: z.string(),
  totalBalance: z.string(),
  totalBalanceFormatted: z.string(),
  participationRate: z.string().describe('Percentage of balance opted in'),
  rewardRecipient: z.string().nullable(),
  totalClaimed: z.string(),
  totalClaimedFormatted: z.string(),
  tokenStats: z.object({
    totalOptedInSupply: z.string(),
    totalOptedInSupplyFormatted: z.string(),
    totalDistributed: z.string(),
    totalDistributedFormatted: z.string(),
  }),
  shareOfPool: z.string().describe('Account share of opted-in supply as percentage'),
});

export type GetRewardStatusOutput = z.infer<typeof getRewardStatusOutputSchema>;

// =============================================================================
// Error Schema (shared)
// =============================================================================

/**
 * Output schema for failed rewards operation response.
 */
export const rewardsOperationErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.number(),
    message: z.string(),
    details: z
      .object({
        field: z.string().optional(),
        expected: z.string().optional(),
        received: z.string().optional(),
        suggestion: z.string().optional(),
      })
      .optional(),
    recoverable: z.boolean().optional(),
    retryAfter: z.number().optional(),
  }),
});

export type RewardsOperationError = z.infer<typeof rewardsOperationErrorSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a success response for opt_in_rewards.
 */
export function createOptInRewardsResponse(data: {
  transactionHash: string;
  blockNumber: number;
  token: string;
  account: string;
  gasCost: string;
  explorerUrl: string;
}): OptInRewardsOutput {
  return {
    success: true,
    ...data,
    message: 'Successfully opted into rewards. You will now earn rewards proportional to your token balance.',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for opt_out_rewards.
 */
export function createOptOutRewardsResponse(data: {
  transactionHash: string;
  blockNumber: number;
  token: string;
  account: string;
  pendingClaimedBefore: boolean;
  gasCost: string;
  explorerUrl: string;
}): OptOutRewardsOutput {
  return {
    success: true,
    ...data,
    message: data.pendingClaimedBefore
      ? 'Successfully opted out of rewards. Pending rewards were claimed before opting out.'
      : 'Successfully opted out of rewards.',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for claim_rewards.
 */
export function createClaimRewardsResponse(data: {
  transactionHash: string;
  blockNumber: number;
  token: string;
  account: string;
  amountClaimed: string;
  amountClaimedFormatted: string;
  recipient: string;
  gasCost: string;
  explorerUrl: string;
}): ClaimRewardsOutput {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a response for get_pending_rewards.
 */
export function createGetPendingRewardsResponse(data: {
  token: string;
  account: string;
  pendingRewards: string;
  pendingRewardsFormatted: string;
  isOptedIn: boolean;
}): GetPendingRewardsOutput {
  return data;
}

/**
 * Create a success response for set_reward_recipient.
 */
export function createSetRewardRecipientResponse(data: {
  transactionHash: string;
  blockNumber: number;
  token: string;
  account: string;
  recipient: string;
  gasCost: string;
  explorerUrl: string;
}): SetRewardRecipientOutput {
  const isClearing = data.recipient === '0x0000000000000000000000000000000000000000';
  return {
    success: true,
    ...data,
    message: isClearing
      ? 'Reward recipient cleared. Rewards will now be sent to your account.'
      : `Reward recipient set. All future claimed rewards will be forwarded to ${data.recipient}.`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a response for get_reward_status.
 */
export function createGetRewardStatusResponse(data: {
  token: string;
  account: string;
  isOptedIn: boolean;
  pendingRewards: string;
  pendingRewardsFormatted: string;
  optedInBalance: string;
  optedInBalanceFormatted: string;
  totalBalance: string;
  totalBalanceFormatted: string;
  participationRate: string;
  rewardRecipient: string | null;
  totalClaimed: string;
  totalClaimedFormatted: string;
  tokenStats: {
    totalOptedInSupply: string;
    totalOptedInSupplyFormatted: string;
    totalDistributed: string;
    totalDistributedFormatted: string;
  };
  shareOfPool: string;
}): GetRewardStatusOutput {
  return data;
}

/**
 * Create an error response for rewards operations.
 */
export function createRewardsErrorResponse(error: {
  code: number;
  message: string;
  details?: {
    field?: string;
    expected?: string;
    received?: string;
    suggestion?: string;
  };
  recoverable?: boolean;
  retryAfter?: number;
}): RewardsOperationError {
  return {
    success: false,
    error,
  };
}

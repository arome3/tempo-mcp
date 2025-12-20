/**
 * Policy Tool Schemas
 *
 * Zod schemas for TIP-403 Policy Registry tool inputs and outputs.
 * These define the structure of data flowing through policy tools:
 * - check_transfer_compliance: Check if transfer is allowed by policy
 * - get_policy_info: Get policy details
 * - is_whitelisted: Check if address is on whitelist
 * - is_blacklisted: Check if address is on blacklist
 * - add_to_whitelist: Add address to whitelist
 * - add_to_blacklist: Add address to blacklist
 * - remove_from_whitelist: Remove address from whitelist
 * - remove_from_blacklist: Remove address from blacklist
 * - burn_blocked_tokens: Burn tokens from blocked address
 */

import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

/**
 * Valid TIP-403 policy types.
 */
export const POLICY_TYPES = ['whitelist', 'blacklist', 'none'] as const;

export type PolicyTypeValue = (typeof POLICY_TYPES)[number];

/**
 * Policy type descriptions for AI context.
 */
export const POLICY_TYPE_DESCRIPTIONS: Record<PolicyTypeValue, string> = {
  whitelist: 'Only whitelisted addresses can send/receive tokens',
  blacklist: 'All addresses can transact except blacklisted ones',
  none: 'No transfer restrictions (default)',
};

// =============================================================================
// Shared Schema Parts
// =============================================================================

const tokenAddressSchema = z
  .string()
  .min(1)
  .describe('TIP-20 token address (0x-prefixed 40-character hex string)');

const accountAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .describe('Account address (0x-prefixed 40-character hex string)');

const policyIdSchema = z
  .number()
  .int()
  .min(1)
  .describe('Policy ID in the TIP-403 registry');

const policyTypeSchema = z
  .enum(POLICY_TYPES)
  .describe('Policy type: whitelist, blacklist, or none');

// =============================================================================
// check_transfer_compliance Schemas
// =============================================================================

/**
 * Input schema for the check_transfer_compliance tool.
 */
export const checkTransferComplianceInputSchema = {
  token: tokenAddressSchema.describe('TIP-20 token address to check'),
  from: accountAddressSchema.describe('Sender address'),
  to: accountAddressSchema.describe('Recipient address'),
};

export const checkTransferComplianceInputZodSchema = z.object(
  checkTransferComplianceInputSchema
);
export type CheckTransferComplianceInput = z.infer<
  typeof checkTransferComplianceInputZodSchema
>;

/**
 * Output schema for check_transfer_compliance response.
 */
export const checkTransferComplianceOutputSchema = z.object({
  allowed: z.boolean(),
  policyId: z.number().nullable(),
  policyType: policyTypeSchema,
  fromStatus: z.object({
    isWhitelisted: z.boolean(),
    isBlacklisted: z.boolean(),
  }),
  toStatus: z.object({
    isWhitelisted: z.boolean(),
    isBlacklisted: z.boolean(),
  }),
  reason: z.string().nullable(),
  token: z.string(),
  from: z.string(),
  to: z.string(),
});

export type CheckTransferComplianceOutput = z.infer<
  typeof checkTransferComplianceOutputSchema
>;

// =============================================================================
// get_policy_info Schemas
// =============================================================================

/**
 * Input schema for the get_policy_info tool.
 */
export const getPolicyInfoInputSchema = {
  policyId: policyIdSchema,
};

export const getPolicyInfoInputZodSchema = z.object(getPolicyInfoInputSchema);
export type GetPolicyInfoInput = z.infer<typeof getPolicyInfoInputZodSchema>;

/**
 * Output schema for get_policy_info response.
 */
export const getPolicyInfoOutputSchema = z.object({
  policyId: z.number(),
  policyType: policyTypeSchema,
  policyTypeDescription: z.string(),
  owner: z.string(),
  tokenCount: z.number(),
});

export type GetPolicyInfoOutput = z.infer<typeof getPolicyInfoOutputSchema>;

// =============================================================================
// is_whitelisted Schemas
// =============================================================================

/**
 * Input schema for the is_whitelisted tool.
 */
export const isWhitelistedInputSchema = {
  policyId: policyIdSchema,
  account: accountAddressSchema.describe('Address to check'),
};

export const isWhitelistedInputZodSchema = z.object(isWhitelistedInputSchema);
export type IsWhitelistedInput = z.infer<typeof isWhitelistedInputZodSchema>;

/**
 * Output schema for is_whitelisted response.
 */
export const isWhitelistedOutputSchema = z.object({
  isWhitelisted: z.boolean(),
  policyId: z.number(),
  account: z.string(),
});

export type IsWhitelistedOutput = z.infer<typeof isWhitelistedOutputSchema>;

// =============================================================================
// is_blacklisted Schemas
// =============================================================================

/**
 * Input schema for the is_blacklisted tool.
 */
export const isBlacklistedInputSchema = {
  policyId: policyIdSchema,
  account: accountAddressSchema.describe('Address to check'),
};

export const isBlacklistedInputZodSchema = z.object(isBlacklistedInputSchema);
export type IsBlacklistedInput = z.infer<typeof isBlacklistedInputZodSchema>;

/**
 * Output schema for is_blacklisted response.
 */
export const isBlacklistedOutputSchema = z.object({
  isBlacklisted: z.boolean(),
  policyId: z.number(),
  account: z.string(),
});

export type IsBlacklistedOutput = z.infer<typeof isBlacklistedOutputSchema>;

// =============================================================================
// add_to_whitelist Schemas
// =============================================================================

/**
 * Input schema for the add_to_whitelist tool.
 */
export const addToWhitelistInputSchema = {
  policyId: policyIdSchema,
  account: accountAddressSchema.describe('Address to add to whitelist'),
};

export const addToWhitelistInputZodSchema = z.object(addToWhitelistInputSchema);
export type AddToWhitelistInput = z.infer<typeof addToWhitelistInputZodSchema>;

/**
 * Output schema for successful add_to_whitelist response.
 */
export const addToWhitelistOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  policyId: z.number(),
  account: z.string(),
  action: z.literal('whitelisted'),
  addedBy: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type AddToWhitelistOutput = z.infer<typeof addToWhitelistOutputSchema>;

// =============================================================================
// remove_from_whitelist Schemas
// =============================================================================

/**
 * Input schema for the remove_from_whitelist tool.
 */
export const removeFromWhitelistInputSchema = {
  policyId: policyIdSchema,
  account: accountAddressSchema.describe('Address to remove from whitelist'),
};

export const removeFromWhitelistInputZodSchema = z.object(
  removeFromWhitelistInputSchema
);
export type RemoveFromWhitelistInput = z.infer<
  typeof removeFromWhitelistInputZodSchema
>;

/**
 * Output schema for successful remove_from_whitelist response.
 */
export const removeFromWhitelistOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  policyId: z.number(),
  account: z.string(),
  action: z.literal('removed_from_whitelist'),
  removedBy: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type RemoveFromWhitelistOutput = z.infer<
  typeof removeFromWhitelistOutputSchema
>;

// =============================================================================
// add_to_blacklist Schemas
// =============================================================================

/**
 * Input schema for the add_to_blacklist tool.
 */
export const addToBlacklistInputSchema = {
  policyId: policyIdSchema,
  account: accountAddressSchema.describe('Address to add to blacklist (block)'),
};

export const addToBlacklistInputZodSchema = z.object(addToBlacklistInputSchema);
export type AddToBlacklistInput = z.infer<typeof addToBlacklistInputZodSchema>;

/**
 * Output schema for successful add_to_blacklist response.
 */
export const addToBlacklistOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  policyId: z.number(),
  account: z.string(),
  action: z.literal('blacklisted'),
  blockedBy: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type AddToBlacklistOutput = z.infer<typeof addToBlacklistOutputSchema>;

// =============================================================================
// remove_from_blacklist Schemas
// =============================================================================

/**
 * Input schema for the remove_from_blacklist tool.
 */
export const removeFromBlacklistInputSchema = {
  policyId: policyIdSchema,
  account: accountAddressSchema.describe(
    'Address to remove from blacklist (unblock)'
  ),
};

export const removeFromBlacklistInputZodSchema = z.object(
  removeFromBlacklistInputSchema
);
export type RemoveFromBlacklistInput = z.infer<
  typeof removeFromBlacklistInputZodSchema
>;

/**
 * Output schema for successful remove_from_blacklist response.
 */
export const removeFromBlacklistOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  policyId: z.number(),
  account: z.string(),
  action: z.literal('removed_from_blacklist'),
  unblockedBy: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type RemoveFromBlacklistOutput = z.infer<
  typeof removeFromBlacklistOutputSchema
>;

// =============================================================================
// burn_blocked_tokens Schemas
// =============================================================================

/**
 * Input schema for the burn_blocked_tokens tool.
 */
export const burnBlockedTokensInputSchema = {
  token: tokenAddressSchema.describe('TIP-20 token address'),
  blockedAddress: accountAddressSchema.describe(
    'Address whose tokens to burn (must be blacklisted)'
  ),
  amount: z
    .string()
    .describe(
      'Amount to burn in token units (e.g., "1000.50") or "all" to burn entire balance'
    ),
};

export const burnBlockedTokensInputZodSchema = z.object(
  burnBlockedTokensInputSchema
);
export type BurnBlockedTokensInput = z.infer<
  typeof burnBlockedTokensInputZodSchema
>;

/**
 * Output schema for successful burn_blocked_tokens response.
 */
export const burnBlockedTokensOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  token: z.string(),
  blockedAddress: z.string(),
  amountBurned: z.string(),
  amountBurnedFormatted: z.string(),
  burnedBy: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type BurnBlockedTokensOutput = z.infer<
  typeof burnBlockedTokensOutputSchema
>;

// =============================================================================
// Error Schema (shared)
// =============================================================================

/**
 * Output schema for failed policy operation response.
 */
export const policyOperationErrorSchema = z.object({
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

export type PolicyOperationError = z.infer<typeof policyOperationErrorSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a response for check_transfer_compliance.
 */
export function createCheckTransferComplianceResponse(data: {
  allowed: boolean;
  policyId: number | null;
  policyType: PolicyTypeValue;
  fromStatus: { isWhitelisted: boolean; isBlacklisted: boolean };
  toStatus: { isWhitelisted: boolean; isBlacklisted: boolean };
  reason: string | null;
  token: string;
  from: string;
  to: string;
}): CheckTransferComplianceOutput {
  return data;
}

/**
 * Create a response for get_policy_info.
 */
export function createGetPolicyInfoResponse(data: {
  policyId: number;
  policyType: PolicyTypeValue;
  owner: string;
  tokenCount: number;
}): GetPolicyInfoOutput {
  return {
    ...data,
    policyTypeDescription: POLICY_TYPE_DESCRIPTIONS[data.policyType],
  };
}

/**
 * Create a response for is_whitelisted.
 */
export function createIsWhitelistedResponse(data: {
  isWhitelisted: boolean;
  policyId: number;
  account: string;
}): IsWhitelistedOutput {
  return data;
}

/**
 * Create a response for is_blacklisted.
 */
export function createIsBlacklistedResponse(data: {
  isBlacklisted: boolean;
  policyId: number;
  account: string;
}): IsBlacklistedOutput {
  return data;
}

/**
 * Create a success response for add_to_whitelist.
 */
export function createAddToWhitelistResponse(data: {
  transactionHash: string;
  blockNumber: number;
  policyId: number;
  account: string;
  addedBy: string;
  gasCost: string;
  explorerUrl: string;
}): AddToWhitelistOutput {
  return {
    success: true,
    ...data,
    action: 'whitelisted',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for remove_from_whitelist.
 */
export function createRemoveFromWhitelistResponse(data: {
  transactionHash: string;
  blockNumber: number;
  policyId: number;
  account: string;
  removedBy: string;
  gasCost: string;
  explorerUrl: string;
}): RemoveFromWhitelistOutput {
  return {
    success: true,
    ...data,
    action: 'removed_from_whitelist',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for add_to_blacklist.
 */
export function createAddToBlacklistResponse(data: {
  transactionHash: string;
  blockNumber: number;
  policyId: number;
  account: string;
  blockedBy: string;
  gasCost: string;
  explorerUrl: string;
}): AddToBlacklistOutput {
  return {
    success: true,
    ...data,
    action: 'blacklisted',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for remove_from_blacklist.
 */
export function createRemoveFromBlacklistResponse(data: {
  transactionHash: string;
  blockNumber: number;
  policyId: number;
  account: string;
  unblockedBy: string;
  gasCost: string;
  explorerUrl: string;
}): RemoveFromBlacklistOutput {
  return {
    success: true,
    ...data,
    action: 'removed_from_blacklist',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for burn_blocked_tokens.
 */
export function createBurnBlockedTokensResponse(data: {
  transactionHash: string;
  blockNumber: number;
  token: string;
  blockedAddress: string;
  amountBurned: string;
  amountBurnedFormatted: string;
  burnedBy: string;
  gasCost: string;
  explorerUrl: string;
}): BurnBlockedTokensOutput {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error response for policy operations.
 */
export function createPolicyErrorResponse(error: {
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
}): PolicyOperationError {
  return {
    success: false,
    error,
  };
}

/**
 * Role Tool Schemas
 *
 * Zod schemas for TIP-20 role management tool inputs and outputs.
 * These define the structure of data flowing through role tools:
 * - grant_role: Grant a role to an address
 * - revoke_role: Revoke a role from an address
 * - renounce_role: Renounce your own role
 * - has_role: Check if address has a role
 * - get_role_members: List addresses with a role
 * - pause_token: Emergency pause transfers
 * - unpause_token: Resume transfers
 */

import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

/**
 * Valid TIP-20 role names.
 */
export const ROLE_NAMES = [
  'DEFAULT_ADMIN_ROLE',
  'ISSUER_ROLE',
  'PAUSE_ROLE',
  'UNPAUSE_ROLE',
  'BURN_BLOCKED_ROLE',
] as const;

export type RoleNameType = (typeof ROLE_NAMES)[number];

/**
 * Role descriptions for AI context.
 */
export const ROLE_DESCRIPTIONS: Record<RoleNameType, string> = {
  DEFAULT_ADMIN_ROLE: 'Full control - can grant and revoke all roles',
  ISSUER_ROLE: 'Can mint new tokens and burn own tokens',
  PAUSE_ROLE: 'Can emergency pause all token transfers',
  UNPAUSE_ROLE: 'Can resume transfers after a pause',
  BURN_BLOCKED_ROLE: 'Can burn tokens from blocked/sanctioned addresses',
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

const roleNameSchema = z
  .enum(ROLE_NAMES)
  .describe(
    'Role name: DEFAULT_ADMIN_ROLE (full control), ISSUER_ROLE (mint/burn), PAUSE_ROLE (pause transfers), UNPAUSE_ROLE (unpause), BURN_BLOCKED_ROLE (burn blocked funds)'
  );

// =============================================================================
// grant_role Schemas
// =============================================================================

/**
 * Input schema for the grant_role tool.
 */
export const grantRoleInputSchema = {
  token: tokenAddressSchema,
  role: roleNameSchema,
  account: accountAddressSchema.describe('Address to grant the role to'),
};

export const grantRoleInputZodSchema = z.object(grantRoleInputSchema);
export type GrantRoleInput = z.infer<typeof grantRoleInputZodSchema>;

/**
 * Output schema for successful grant_role response.
 */
export const grantRoleOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  token: z.string(),
  role: z.string(),
  account: z.string(),
  grantedBy: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type GrantRoleOutput = z.infer<typeof grantRoleOutputSchema>;

// =============================================================================
// revoke_role Schemas
// =============================================================================

/**
 * Input schema for the revoke_role tool.
 */
export const revokeRoleInputSchema = {
  token: tokenAddressSchema,
  role: roleNameSchema,
  account: accountAddressSchema.describe('Address to revoke the role from'),
};

export const revokeRoleInputZodSchema = z.object(revokeRoleInputSchema);
export type RevokeRoleInput = z.infer<typeof revokeRoleInputZodSchema>;

/**
 * Output schema for successful revoke_role response.
 */
export const revokeRoleOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  token: z.string(),
  role: z.string(),
  account: z.string(),
  revokedBy: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type RevokeRoleOutput = z.infer<typeof revokeRoleOutputSchema>;

// =============================================================================
// renounce_role Schemas
// =============================================================================

/**
 * Input schema for the renounce_role tool.
 */
export const renounceRoleInputSchema = {
  token: tokenAddressSchema,
  role: roleNameSchema.describe('Role to renounce (you must currently have this role)'),
};

export const renounceRoleInputZodSchema = z.object(renounceRoleInputSchema);
export type RenounceRoleInput = z.infer<typeof renounceRoleInputZodSchema>;

/**
 * Output schema for successful renounce_role response.
 */
export const renounceRoleOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  token: z.string(),
  role: z.string(),
  renouncedBy: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type RenounceRoleOutput = z.infer<typeof renounceRoleOutputSchema>;

// =============================================================================
// has_role Schemas
// =============================================================================

/**
 * Input schema for the has_role tool.
 */
export const hasRoleInputSchema = {
  token: tokenAddressSchema,
  role: roleNameSchema,
  account: accountAddressSchema.describe('Address to check for the role'),
};

export const hasRoleInputZodSchema = z.object(hasRoleInputSchema);
export type HasRoleInput = z.infer<typeof hasRoleInputZodSchema>;

/**
 * Output schema for has_role response.
 */
export const hasRoleOutputSchema = z.object({
  hasRole: z.boolean(),
  token: z.string(),
  role: z.string(),
  roleDescription: z.string(),
  account: z.string(),
});

export type HasRoleOutput = z.infer<typeof hasRoleOutputSchema>;

// =============================================================================
// get_role_members Schemas
// =============================================================================

/**
 * Input schema for the get_role_members tool.
 */
export const getRoleMembersInputSchema = {
  token: tokenAddressSchema,
  role: roleNameSchema,
};

export const getRoleMembersInputZodSchema = z.object(getRoleMembersInputSchema);
export type GetRoleMembersInput = z.infer<typeof getRoleMembersInputZodSchema>;

/**
 * Output schema for get_role_members response.
 */
export const getRoleMembersOutputSchema = z.object({
  token: z.string(),
  role: z.string(),
  roleDescription: z.string(),
  memberCount: z.number(),
  members: z.array(z.string()),
});

export type GetRoleMembersOutput = z.infer<typeof getRoleMembersOutputSchema>;

// =============================================================================
// pause_token Schemas
// =============================================================================

/**
 * Input schema for the pause_token tool.
 */
export const pauseTokenInputSchema = {
  token: tokenAddressSchema.describe('TIP-20 token address to pause'),
  reason: z
    .string()
    .max(256)
    .optional()
    .describe('Reason for pausing (logged for audit trail)'),
};

export const pauseTokenInputZodSchema = z.object(pauseTokenInputSchema);
export type PauseTokenInput = z.infer<typeof pauseTokenInputZodSchema>;

/**
 * Output schema for successful pause_token response.
 */
export const pauseTokenOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  token: z.string(),
  isPaused: z.literal(true),
  pausedBy: z.string(),
  reason: z.string().nullable(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type PauseTokenOutput = z.infer<typeof pauseTokenOutputSchema>;

// =============================================================================
// unpause_token Schemas
// =============================================================================

/**
 * Input schema for the unpause_token tool.
 */
export const unpauseTokenInputSchema = {
  token: tokenAddressSchema.describe('TIP-20 token address to unpause'),
  reason: z
    .string()
    .max(256)
    .optional()
    .describe('Reason for unpausing (logged for audit trail)'),
};

export const unpauseTokenInputZodSchema = z.object(unpauseTokenInputSchema);
export type UnpauseTokenInput = z.infer<typeof unpauseTokenInputZodSchema>;

/**
 * Output schema for successful unpause_token response.
 */
export const unpauseTokenOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  token: z.string(),
  isPaused: z.literal(false),
  unpausedBy: z.string(),
  reason: z.string().nullable(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type UnpauseTokenOutput = z.infer<typeof unpauseTokenOutputSchema>;

// =============================================================================
// Error Schema (shared)
// =============================================================================

/**
 * Output schema for failed role operation response.
 */
export const roleOperationErrorSchema = z.object({
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

export type RoleOperationError = z.infer<typeof roleOperationErrorSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a success response for grant_role.
 */
export function createGrantRoleResponse(data: {
  transactionHash: string;
  blockNumber: number;
  token: string;
  role: string;
  account: string;
  grantedBy: string;
  gasCost: string;
  explorerUrl: string;
}): GrantRoleOutput {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for revoke_role.
 */
export function createRevokeRoleResponse(data: {
  transactionHash: string;
  blockNumber: number;
  token: string;
  role: string;
  account: string;
  revokedBy: string;
  gasCost: string;
  explorerUrl: string;
}): RevokeRoleOutput {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for renounce_role.
 */
export function createRenounceRoleResponse(data: {
  transactionHash: string;
  blockNumber: number;
  token: string;
  role: string;
  renouncedBy: string;
  gasCost: string;
  explorerUrl: string;
}): RenounceRoleOutput {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a response for has_role.
 */
export function createHasRoleResponse(data: {
  hasRole: boolean;
  token: string;
  role: RoleNameType;
  account: string;
}): HasRoleOutput {
  return {
    ...data,
    roleDescription: ROLE_DESCRIPTIONS[data.role],
  };
}

/**
 * Create a response for get_role_members.
 */
export function createGetRoleMembersResponse(data: {
  token: string;
  role: RoleNameType;
  members: string[];
}): GetRoleMembersOutput {
  return {
    token: data.token,
    role: data.role,
    roleDescription: ROLE_DESCRIPTIONS[data.role],
    memberCount: data.members.length,
    members: data.members,
  };
}

/**
 * Create a success response for pause_token.
 */
export function createPauseTokenResponse(data: {
  transactionHash: string;
  blockNumber: number;
  token: string;
  pausedBy: string;
  reason: string | null;
  gasCost: string;
  explorerUrl: string;
}): PauseTokenOutput {
  return {
    success: true,
    ...data,
    isPaused: true,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for unpause_token.
 */
export function createUnpauseTokenResponse(data: {
  transactionHash: string;
  blockNumber: number;
  token: string;
  unpausedBy: string;
  reason: string | null;
  gasCost: string;
  explorerUrl: string;
}): UnpauseTokenOutput {
  return {
    success: true,
    ...data,
    isPaused: false,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error response for role operations.
 */
export function createRoleErrorResponse(error: {
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
}): RoleOperationError {
  return {
    success: false,
    error,
  };
}

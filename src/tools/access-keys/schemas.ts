/**
 * Access Key Tool Schemas
 *
 * Zod schemas for Tempo access key management tool inputs and outputs.
 * These define the structure of data flowing through access key tools:
 * - create_access_key: Create a new delegated signing key
 * - revoke_access_key: Revoke an existing access key
 * - get_access_key_info: Get key info (type, expiry, limits, revoked status)
 * - get_remaining_limit: Get remaining spending limit for key-token pair
 * - update_spending_limit: Update spending limit for a key-token pair
 */

import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

/**
 * Valid signature types for access keys.
 */
export const SIGNATURE_TYPES = ['secp256k1', 'p256', 'webauthn'] as const;

export type SignatureTypeName = (typeof SIGNATURE_TYPES)[number];

/**
 * Signature type descriptions for AI context.
 */
export const SIGNATURE_TYPE_DESCRIPTIONS: Record<SignatureTypeName, string> = {
  secp256k1: 'Standard Ethereum signature type (most compatible)',
  p256: 'WebCrypto P256 signature (secure enclave support, passkey compatible)',
  webauthn: 'WebAuthn signature with authenticator data (full passkey support)',
};

// =============================================================================
// Shared Schema Parts
// =============================================================================

const accountAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .describe('Account address (0x-prefixed 40-character hex string)');

const keyIdSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid key ID format')
  .describe('Key ID - address derived from the access key public key');

const tokenAddressSchema = z
  .string()
  .min(1)
  .describe('TIP-20 token address (0x-prefixed 40-character hex string)');

const signatureTypeSchema = z
  .enum(SIGNATURE_TYPES)
  .describe(
    'Signature type: secp256k1 (standard Ethereum), p256 (WebCrypto/passkey), webauthn (full passkey)'
  );

const tokenLimitSchema = z.object({
  token: tokenAddressSchema.describe('TIP-20 token address'),
  amount: z.string().min(1).describe('Spending limit amount in token units (as string for precision)'),
});

// =============================================================================
// create_access_key Schemas
// =============================================================================

/**
 * Input schema for the create_access_key tool.
 */
export const createAccessKeyInputSchema = {
  signatureType: signatureTypeSchema.default('p256'),
  expiry: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Unix timestamp when key expires (0 or omit for never expires)'),
  enforceLimits: z
    .boolean()
    .default(true)
    .describe('Whether to enforce spending limits for this key'),
  limits: z
    .array(tokenLimitSchema)
    .optional()
    .describe('Initial spending limits per token (only used if enforceLimits is true)'),
  label: z
    .string()
    .max(64)
    .optional()
    .describe('Optional user-friendly label for the key'),
};

export const createAccessKeyInputZodSchema = z.object(createAccessKeyInputSchema);
export type CreateAccessKeyInput = z.infer<typeof createAccessKeyInputZodSchema>;

/**
 * Output schema for successful create_access_key response.
 */
export const createAccessKeyOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  keyId: z.string(),
  signatureType: z.string(),
  expiry: z.number().nullable(),
  expiryISO: z.string().nullable(),
  enforceLimits: z.boolean(),
  limits: z.array(tokenLimitSchema).optional(),
  label: z.string().nullable(),
  createdBy: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type CreateAccessKeyOutput = z.infer<typeof createAccessKeyOutputSchema>;

// =============================================================================
// revoke_access_key Schemas
// =============================================================================

/**
 * Input schema for the revoke_access_key tool.
 */
export const revokeAccessKeyInputSchema = {
  keyId: keyIdSchema.describe('Key ID of the access key to revoke'),
};

export const revokeAccessKeyInputZodSchema = z.object(revokeAccessKeyInputSchema);
export type RevokeAccessKeyInput = z.infer<typeof revokeAccessKeyInputZodSchema>;

/**
 * Output schema for successful revoke_access_key response.
 */
export const revokeAccessKeyOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  keyId: z.string(),
  revokedBy: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type RevokeAccessKeyOutput = z.infer<typeof revokeAccessKeyOutputSchema>;

// =============================================================================
// get_access_key_info Schemas
// =============================================================================

/**
 * Input schema for the get_access_key_info tool.
 */
export const getAccessKeyInfoInputSchema = {
  keyId: keyIdSchema,
  account: accountAddressSchema
    .optional()
    .describe('Account address (defaults to configured wallet address)'),
};

export const getAccessKeyInfoInputZodSchema = z.object(getAccessKeyInfoInputSchema);
export type GetAccessKeyInfoInput = z.infer<typeof getAccessKeyInfoInputZodSchema>;

/**
 * Output schema for get_access_key_info response.
 */
export const getAccessKeyInfoOutputSchema = z.object({
  found: z.boolean(),
  keyId: z.string(),
  account: z.string(),
  signatureType: z.string().nullable(),
  signatureTypeDescription: z.string().nullable(),
  expiry: z.number().nullable(),
  expiryISO: z.string().nullable(),
  isExpired: z.boolean().nullable(),
  enforceLimits: z.boolean().nullable(),
  isRevoked: z.boolean().nullable(),
  isActive: z.boolean(),
});

export type GetAccessKeyInfoOutput = z.infer<typeof getAccessKeyInfoOutputSchema>;

// =============================================================================
// get_remaining_limit Schemas
// =============================================================================

/**
 * Input schema for the get_remaining_limit tool.
 */
export const getRemainingLimitInputSchema = {
  keyId: keyIdSchema,
  token: tokenAddressSchema.describe('TIP-20 token address to check limit for'),
  account: accountAddressSchema
    .optional()
    .describe('Account address (defaults to configured wallet address)'),
};

export const getRemainingLimitInputZodSchema = z.object(getRemainingLimitInputSchema);
export type GetRemainingLimitInput = z.infer<typeof getRemainingLimitInputZodSchema>;

/**
 * Output schema for get_remaining_limit response.
 */
export const getRemainingLimitOutputSchema = z.object({
  keyId: z.string(),
  account: z.string(),
  token: z.string(),
  remainingLimit: z.string(),
  remainingLimitFormatted: z.string(),
  isUnlimited: z.boolean(),
});

export type GetRemainingLimitOutput = z.infer<typeof getRemainingLimitOutputSchema>;

// =============================================================================
// update_spending_limit Schemas
// =============================================================================

/**
 * Input schema for the update_spending_limit tool.
 */
export const updateSpendingLimitInputSchema = {
  keyId: keyIdSchema,
  token: tokenAddressSchema.describe('TIP-20 token address to update limit for'),
  newLimit: z
    .string()
    .min(1)
    .describe('New spending limit amount in token units (as string for precision)'),
};

export const updateSpendingLimitInputZodSchema = z.object(updateSpendingLimitInputSchema);
export type UpdateSpendingLimitInput = z.infer<typeof updateSpendingLimitInputZodSchema>;

/**
 * Output schema for successful update_spending_limit response.
 */
export const updateSpendingLimitOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  keyId: z.string(),
  token: z.string(),
  newLimit: z.string(),
  newLimitFormatted: z.string(),
  updatedBy: z.string(),
  gasCost: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type UpdateSpendingLimitOutput = z.infer<typeof updateSpendingLimitOutputSchema>;

// =============================================================================
// Error Schema (shared)
// =============================================================================

/**
 * Output schema for failed access key operation response.
 */
export const accessKeyErrorSchema = z.object({
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

export type AccessKeyError = z.infer<typeof accessKeyErrorSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a success response for create_access_key.
 */
export function createCreateAccessKeyResponse(data: {
  transactionHash: string;
  blockNumber: number;
  keyId: string;
  signatureType: string;
  expiry: number | null;
  enforceLimits: boolean;
  limits?: Array<{ token: string; amount: string }>;
  label: string | null;
  createdBy: string;
  gasCost: string;
  explorerUrl: string;
}): CreateAccessKeyOutput {
  return {
    success: true,
    ...data,
    expiryISO: data.expiry ? new Date(data.expiry * 1000).toISOString() : null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response for revoke_access_key.
 */
export function createRevokeAccessKeyResponse(data: {
  transactionHash: string;
  blockNumber: number;
  keyId: string;
  revokedBy: string;
  gasCost: string;
  explorerUrl: string;
}): RevokeAccessKeyOutput {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a response for get_access_key_info.
 */
export function createGetAccessKeyInfoResponse(data: {
  found: boolean;
  keyId: string;
  account: string;
  signatureType: string | null;
  expiry: number | null;
  enforceLimits: boolean | null;
  isRevoked: boolean | null;
}): GetAccessKeyInfoOutput {
  const now = Math.floor(Date.now() / 1000);
  const isExpired = data.expiry !== null && data.expiry !== 0 && data.expiry <= now;
  const isActive = data.found && !data.isRevoked && !isExpired;

  return {
    ...data,
    signatureTypeDescription: data.signatureType
      ? SIGNATURE_TYPE_DESCRIPTIONS[data.signatureType as SignatureTypeName] ?? null
      : null,
    expiryISO: data.expiry && data.expiry !== 0 ? new Date(data.expiry * 1000).toISOString() : null,
    isExpired: data.found ? isExpired : null,
    isActive,
  };
}

/**
 * Create a response for get_remaining_limit.
 */
export function createGetRemainingLimitResponse(data: {
  keyId: string;
  account: string;
  token: string;
  remainingLimit: string;
  decimals: number;
}): GetRemainingLimitOutput {
  // Format with decimals
  const limitBigInt = BigInt(data.remainingLimit);
  const divisor = BigInt(10 ** data.decimals);
  const whole = limitBigInt / divisor;
  const fraction = limitBigInt % divisor;
  const formatted =
    fraction === 0n
      ? whole.toString()
      : `${whole}.${fraction.toString().padStart(data.decimals, '0').replace(/0+$/, '')}`;

  // Check if unlimited (very large number indicates no limit)
  const isUnlimited = limitBigInt >= BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

  return {
    keyId: data.keyId,
    account: data.account,
    token: data.token,
    remainingLimit: data.remainingLimit,
    remainingLimitFormatted: isUnlimited ? 'unlimited' : formatted,
    isUnlimited,
  };
}

/**
 * Create a success response for update_spending_limit.
 */
export function createUpdateSpendingLimitResponse(data: {
  transactionHash: string;
  blockNumber: number;
  keyId: string;
  token: string;
  newLimit: string;
  decimals: number;
  updatedBy: string;
  gasCost: string;
  explorerUrl: string;
}): UpdateSpendingLimitOutput {
  // Format with decimals
  const limitBigInt = BigInt(data.newLimit);
  const divisor = BigInt(10 ** data.decimals);
  const whole = limitBigInt / divisor;
  const fraction = limitBigInt % divisor;
  const formatted =
    fraction === 0n
      ? whole.toString()
      : `${whole}.${fraction.toString().padStart(data.decimals, '0').replace(/0+$/, '')}`;

  return {
    success: true,
    transactionHash: data.transactionHash,
    blockNumber: data.blockNumber,
    keyId: data.keyId,
    token: data.token,
    newLimit: data.newLimit,
    newLimitFormatted: formatted,
    updatedBy: data.updatedBy,
    gasCost: data.gasCost,
    explorerUrl: data.explorerUrl,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error response for access key operations.
 */
export function createAccessKeyErrorResponse(error: {
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
}): AccessKeyError {
  return {
    success: false,
    error,
  };
}

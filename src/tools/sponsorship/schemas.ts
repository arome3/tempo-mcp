/**
 * Sponsorship Tool Schemas
 *
 * Zod schemas for fee sponsorship tool inputs and outputs.
 * These define the structure of data flowing through sponsorship tools:
 * - send_sponsored_payment: Send payment with fee payer covering gas
 * - estimate_sponsored_gas: Estimate gas cost for sponsored transaction
 * - get_sponsor_balance: Check fee payer account balance
 */

import { z } from 'zod';

// =============================================================================
// Shared Schema Parts
// =============================================================================

const tokenAddressSchema = z
  .string()
  .min(1)
  .describe(
    'TIP-20 token address (0x-prefixed 40-character hex string) or token symbol (e.g., "AlphaUSD")'
  );

const recipientAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .describe('Recipient address (0x-prefixed 40-character hex string)');

const amountSchema = z
  .string()
  .min(1)
  .describe('Amount to send in human-readable format (e.g., "100.50")');

const memoSchema = z
  .string()
  .max(32)
  .optional()
  .describe(
    'Optional memo for reconciliation (max 32 characters, will be padded to 32 bytes)'
  );

const feePayerAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .optional()
  .describe(
    'Fee payer address (defaults to configured fee payer). Only used when useRelay is false.'
  );

const useRelaySchema = z
  .boolean()
  .default(false)
  .describe(
    'Use Tempo testnet fee sponsorship relay instead of local fee payer'
  );

// =============================================================================
// send_sponsored_payment Schemas
// =============================================================================

/**
 * Input schema for the send_sponsored_payment tool.
 */
export const sendSponsoredPaymentInputSchema = {
  token: tokenAddressSchema,
  to: recipientAddressSchema,
  amount: amountSchema,
  memo: memoSchema,
  feePayer: feePayerAddressSchema,
  useRelay: useRelaySchema,
};

export const sendSponsoredPaymentInputZodSchema = z.object(
  sendSponsoredPaymentInputSchema
);
export type SendSponsoredPaymentInput = z.infer<
  typeof sendSponsoredPaymentInputZodSchema
>;

/**
 * Output schema for successful send_sponsored_payment response.
 */
export const sendSponsoredPaymentOutputSchema = z.object({
  success: z.literal(true),
  transactionHash: z.string(),
  blockNumber: z.number(),
  from: z.string(),
  to: z.string(),
  amount: z.string(),
  token: z.string(),
  tokenSymbol: z.string(),
  memo: z.string().nullable(),
  feePayer: z.string(),
  feeAmount: z.string(),
  feeToken: z.string(),
  explorerUrl: z.string(),
  timestamp: z.string(),
});

export type SendSponsoredPaymentOutput = z.infer<
  typeof sendSponsoredPaymentOutputSchema
>;

// =============================================================================
// estimate_sponsored_gas Schemas
// =============================================================================

/**
 * Input schema for the estimate_sponsored_gas tool.
 */
export const estimateSponsoredGasInputSchema = {
  token: tokenAddressSchema.describe('TIP-20 token address for the transfer'),
  to: recipientAddressSchema.describe('Recipient address for the transfer'),
  amount: amountSchema.describe('Transfer amount for gas estimation'),
  feeToken: z
    .string()
    .optional()
    .describe('Token for fee payment (defaults to transfer token)'),
};

export const estimateSponsoredGasInputZodSchema = z.object(
  estimateSponsoredGasInputSchema
);
export type EstimateSponsoredGasInput = z.infer<
  typeof estimateSponsoredGasInputZodSchema
>;

/**
 * Output schema for estimate_sponsored_gas response.
 */
export const estimateSponsoredGasOutputSchema = z.object({
  gasLimit: z.string(),
  estimatedFee: z.string(),
  feeToken: z.string(),
  feeTokenSymbol: z.string(),
});

export type EstimateSponsoredGasOutput = z.infer<
  typeof estimateSponsoredGasOutputSchema
>;

// =============================================================================
// get_sponsor_balance Schemas
// =============================================================================

/**
 * Input schema for the get_sponsor_balance tool.
 */
export const getSponsorBalanceInputSchema = {
  sponsor: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
    .optional()
    .describe('Sponsor address to check (defaults to configured fee payer)'),
  token: z
    .string()
    .optional()
    .describe('Token to check balance of (defaults to configured fee token)'),
};

export const getSponsorBalanceInputZodSchema = z.object(
  getSponsorBalanceInputSchema
);
export type GetSponsorBalanceInput = z.infer<
  typeof getSponsorBalanceInputZodSchema
>;

/**
 * Output schema for get_sponsor_balance response.
 */
export const getSponsorBalanceOutputSchema = z.object({
  balance: z.string(),
  balanceRaw: z.string(),
  sponsor: z.string(),
  token: z.string(),
  tokenSymbol: z.string(),
});

export type GetSponsorBalanceOutput = z.infer<
  typeof getSponsorBalanceOutputSchema
>;

// =============================================================================
// Error Schema (shared)
// =============================================================================

/**
 * Output schema for failed sponsorship operation response.
 */
export const sponsorshipErrorSchema = z.object({
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

export type SponsorshipError = z.infer<typeof sponsorshipErrorSchema>;

// =============================================================================
// Response Helper Functions
// =============================================================================

/**
 * Create a success response for send_sponsored_payment.
 */
export function createSponsoredPaymentResponse(data: {
  transactionHash: string;
  blockNumber: number;
  from: string;
  to: string;
  amount: string;
  token: string;
  tokenSymbol: string;
  memo: string | null;
  feePayer: string;
  feeAmount: string;
  feeToken: string;
  explorerUrl: string;
}): SendSponsoredPaymentOutput {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a response for estimate_sponsored_gas.
 */
export function createEstimateSponsoredGasResponse(data: {
  gasLimit: string;
  estimatedFee: string;
  feeToken: string;
  feeTokenSymbol: string;
}): EstimateSponsoredGasOutput {
  return data;
}

/**
 * Create a response for get_sponsor_balance.
 */
export function createSponsorBalanceResponse(data: {
  balance: string;
  balanceRaw: string;
  sponsor: string;
  token: string;
  tokenSymbol: string;
}): GetSponsorBalanceOutput {
  return data;
}

/**
 * Create an error response for sponsorship operations.
 */
export function createSponsorshipErrorResponse(error: {
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
}): SponsorshipError {
  return {
    success: false,
    error,
  };
}

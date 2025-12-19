/**
 * Account Tools Schemas
 *
 * Zod schemas for account-related MCP tools including balance queries
 * and account information retrieval.
 */

import { z } from 'zod';

// =============================================================================
// get_balance Schemas
// =============================================================================

/**
 * Input schema for get_balance tool.
 */
export const getBalanceInputSchema = {
  token: z
    .string()
    .describe('Token address or symbol (e.g., "AlphaUSD" or "0x20c0...")'),
  address: z
    .string()
    .optional()
    .describe('Wallet address to check (defaults to configured wallet)'),
};

/**
 * Output schema for get_balance tool.
 */
export const getBalanceOutputSchema = z.object({
  address: z.string(),
  token: z.string(),
  tokenSymbol: z.string(),
  tokenName: z.string(),
  balance: z.string(),
  balanceRaw: z.string(),
  decimals: z.number(),
});

/** Type for get_balance input */
export type GetBalanceInput = {
  token: string;
  address?: string;
};

/** Type for get_balance output */
export type GetBalanceOutput = z.infer<typeof getBalanceOutputSchema>;

// =============================================================================
// get_balances Schemas
// =============================================================================

/**
 * Input schema for get_balances tool.
 */
export const getBalancesInputSchema = {
  tokens: z
    .array(z.string())
    .optional()
    .describe(
      'Token addresses or symbols to check (defaults to configured tokens)'
    ),
  address: z
    .string()
    .optional()
    .describe('Wallet address to check (defaults to configured wallet)'),
};

/**
 * Single balance entry in get_balances response.
 */
export const balanceEntrySchema = z.object({
  token: z.string(),
  tokenSymbol: z.string(),
  tokenName: z.string(),
  balance: z.string(),
  balanceRaw: z.string(),
  decimals: z.number(),
});

/**
 * Output schema for get_balances tool.
 */
export const getBalancesOutputSchema = z.object({
  address: z.string(),
  balances: z.array(balanceEntrySchema),
});

/** Type for get_balances input */
export type GetBalancesInput = {
  tokens?: string[];
  address?: string;
};

/** Type for get_balances output */
export type GetBalancesOutput = z.infer<typeof getBalancesOutputSchema>;

// =============================================================================
// get_account_info Schemas
// =============================================================================

/**
 * Input schema for get_account_info tool.
 */
export const getAccountInfoInputSchema = {
  address: z
    .string()
    .optional()
    .describe('Wallet address to query (defaults to configured wallet)'),
};

/**
 * Output schema for get_account_info tool.
 */
export const getAccountInfoOutputSchema = z.object({
  address: z.string(),
  type: z.enum(['eoa', 'contract']),
  balances: z.array(
    z.object({
      token: z.string(),
      tokenSymbol: z.string(),
      balance: z.string(),
    })
  ),
  transactionCount: z.number(),
  firstSeen: z.string().nullable(),
  lastActive: z.string().nullable(),
});

/** Type for get_account_info input */
export type GetAccountInfoInput = {
  address?: string;
};

/** Type for get_account_info output */
export type GetAccountInfoOutput = z.infer<typeof getAccountInfoOutputSchema>;

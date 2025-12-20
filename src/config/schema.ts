/**
 * Configuration Schema
 *
 * Zod schemas for type-safe configuration validation.
 * All configuration sections are defined here with sensible defaults.
 */

import { z } from 'zod';

// =============================================================================
// Network Configuration
// =============================================================================

export const networkSchema = z.object({
  /** Tempo chain ID (42429 for testnet) */
  chainId: z.number().default(42429),
  /** RPC endpoint URL */
  rpcUrl: z.string().url().default('https://rpc.testnet.tempo.xyz'),
  /** Block explorer base URL */
  explorerUrl: z.string().url().default('https://explore.tempo.xyz'),
});

// =============================================================================
// Wallet Configuration
// =============================================================================

export const externalSignerSchema = z.object({
  /** External signer type */
  type: z.enum(['turnkey', 'fireblocks']),
  /** Signer-specific configuration */
  config: z.record(z.string(), z.unknown()),
});

export const walletSchema = z.object({
  /** Wallet type: privateKey, keystore, or external signer */
  type: z.enum(['privateKey', 'keystore', 'external']).default('privateKey'),
  /** Private key (hex string with 0x prefix) */
  privateKey: z.string().optional(),
  /** Path to encrypted keystore file */
  keystorePath: z.string().optional(),
  /** Keystore password (prefer env var) */
  keystorePassword: z.string().optional(),
  /** External signer configuration */
  externalSigner: externalSignerSchema.optional(),
});

// =============================================================================
// Security Configuration - Spending Limits
// =============================================================================

export const spendingLimitsSchema = z.object({
  /**
   * Maximum amount per single payment, keyed by token symbol.
   * Use '*' for default limit across all tokens.
   */
  maxSinglePayment: z.record(z.string(), z.string()).default({ '*': '1000' }),
  /**
   * Daily spending limit, keyed by token symbol.
   * Use '*' for default limit across all tokens.
   */
  dailyLimit: z.record(z.string(), z.string()).default({ '*': '10000' }),
  /** Total daily limit in USD equivalent across all tokens */
  dailyTotalUSD: z.string().default('50000'),
  /** Maximum recipients in a single batch payment */
  maxBatchSize: z.number().int().positive().default(50),
  /** Maximum total USD value per batch payment */
  maxBatchTotalUSD: z.string().default('25000'),
});

// =============================================================================
// Security Configuration - Address Allowlist
// =============================================================================

export const addressAllowlistSchema = z.object({
  /** Enable address restrictions */
  enabled: z.boolean().default(false),
  /** Mode: allowlist (only listed) or blocklist (all except listed) */
  mode: z.enum(['allowlist', 'blocklist']).default('allowlist'),
  /** List of addresses */
  addresses: z.array(z.string()).default([]),
  /** Human-readable labels for addresses */
  labels: z.record(z.string(), z.string()).default({}),
});

// =============================================================================
// Security Configuration - Rate Limits
// =============================================================================

export const rateLimitWindowSchema = z.object({
  /** Time window in milliseconds */
  windowMs: z.number().int().positive().default(60000),
  /** Maximum calls within window */
  maxCalls: z.number().int().positive().default(60),
});

export const rateLimitsSchema = z.object({
  /** General tool call rate limit */
  toolCalls: rateLimitWindowSchema.default({
    windowMs: 60000,
    maxCalls: 60,
  }),
  /** Rate limit for high-risk operations (payments, swaps) */
  highRiskOps: rateLimitWindowSchema.default({
    windowMs: 3600000, // 1 hour
    maxCalls: 100,
  }),
  /** Rate limit per recipient address */
  perRecipient: rateLimitWindowSchema.default({
    windowMs: 86400000, // 24 hours
    maxCalls: 10,
  }),
});

// =============================================================================
// Security Configuration - Combined
// =============================================================================

export const securitySchema = z.object({
  /** Spending limits configuration */
  spendingLimits: spendingLimitsSchema.default({}),
  /** Address allowlist/blocklist configuration */
  addressAllowlist: addressAllowlistSchema.default({}),
  /** Rate limiting configuration */
  rateLimits: rateLimitsSchema.default({}),
  /** Require user confirmation for high-value transactions */
  requireConfirmation: z.boolean().default(false),
  /** USD threshold for confirmation prompts */
  confirmationThreshold: z.string().default('1000'),
});

// =============================================================================
// Token Configuration
// =============================================================================

export const tokensSchema = z.object({
  /** Default token symbol for payments */
  default: z.string().default('AlphaUSD'),
  /** Token symbol to address mapping */
  aliases: z.record(z.string(), z.string()).default({
    AlphaUSD: '0x20c0000000000000000000000000000000000001',
  }),
});

// =============================================================================
// Contracts Configuration
// =============================================================================

export const contractsSchema = z.object({
  /** TIP-20 Factory contract address */
  tip20Factory: z
    .string()
    .default('0x20fc000000000000000000000000000000000000'),
  /** pathUSD - default quote token for USD stablecoins */
  pathUSD: z.string().default('0x20c0000000000000000000000000000000000000'),
  /** Stablecoin DEX contract address */
  stablecoinDex: z
    .string()
    .default('0xdec0000000000000000000000000000000000000'),
  /** TIP-403 Policy Registry contract address */
  tip403Registry: z
    .string()
    .default('0x403c000000000000000000000000000000000000'),
  /** Fee Manager contract address */
  feeManager: z
    .string()
    .default('0xfeec000000000000000000000000000000000000'),
});

// =============================================================================
// Logging Configuration
// =============================================================================

export const auditLogSchema = z.object({
  /** Enable audit logging */
  enabled: z.boolean().default(true),
  /** Path to audit log file */
  path: z.string().default('./logs/audit.jsonl'),
  /** Days to retain audit logs before rotation */
  rotationDays: z.number().int().positive().default(30),
});

export const loggingSchema = z.object({
  /** Log level */
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Audit log configuration */
  auditLog: auditLogSchema.default({}),
});

// =============================================================================
// Advanced Configuration
// =============================================================================

export const advancedSchema = z.object({
  /** Gas estimate multiplier for safety margin */
  gasMultiplier: z.number().positive().default(1.2),
  /** Number of block confirmations to wait */
  confirmations: z.number().int().nonnegative().default(1),
  /** Transaction timeout in milliseconds */
  timeout: z.number().int().positive().default(30000),
  /** Chunk size for concurrent transactions to avoid RPC rate limits */
  concurrentChunkSize: z.number().int().positive().default(50),
  /** Delay in milliseconds between concurrent transaction chunks */
  concurrentChunkDelay: z.number().int().min(0).default(500),
});

// =============================================================================
// Fee Sponsorship Configuration
// =============================================================================

export const feePayerSchema = z.object({
  /** Fee payer type: local (private key) or relay (external service) */
  type: z.enum(['local', 'relay']).default('local'),
  /** Fee payer address (required for local type) */
  address: z.string().optional(),
  /** Fee payer private key (required for local type, prefer env var) */
  privateKey: z.string().optional(),
  /** Relay service URL for sponsored transactions */
  relayUrl: z
    .string()
    .url()
    .default('https://sponsor.testnet.tempo.xyz'),
});

export const feeSponsorshipSchema = z.object({
  /** Enable fee sponsorship feature */
  enabled: z.boolean().default(false),
  /** Fee payer configuration */
  feePayer: feePayerSchema.default({}),
  /** Maximum USD amount to sponsor per day */
  maxSponsoredPerDay: z.string().default('1000'),
});

// =============================================================================
// Complete Configuration Schema
// =============================================================================

export const configSchema = z.object({
  /** Network configuration */
  network: networkSchema.default({}),
  /** Wallet configuration */
  wallet: walletSchema.default({}),
  /** Security configuration */
  security: securitySchema.default({}),
  /** Token configuration */
  tokens: tokensSchema.default({}),
  /** Contracts configuration */
  contracts: contractsSchema.default({}),
  /** Logging configuration */
  logging: loggingSchema.default({}),
  /** Advanced configuration */
  advanced: advancedSchema.default({}),
  /** Fee sponsorship configuration */
  feeSponsorship: feeSponsorshipSchema.default({}),
});

// =============================================================================
// Exported Types
// =============================================================================

/** Complete configuration type inferred from schema */
export type TempoMcpConfig = z.infer<typeof configSchema>;

/** Network configuration type */
export type NetworkConfig = z.infer<typeof networkSchema>;

/** Wallet configuration type */
export type WalletConfig = z.infer<typeof walletSchema>;

/** Security configuration type */
export type SecurityConfig = z.infer<typeof securitySchema>;

/** Spending limits type */
export type SpendingLimits = z.infer<typeof spendingLimitsSchema>;

/** Address allowlist type */
export type AddressAllowlist = z.infer<typeof addressAllowlistSchema>;

/** Rate limits type */
export type RateLimits = z.infer<typeof rateLimitsSchema>;

/** Token configuration type */
export type TokensConfig = z.infer<typeof tokensSchema>;

/** Contracts configuration type */
export type ContractsConfig = z.infer<typeof contractsSchema>;

/** Logging configuration type */
export type LoggingConfig = z.infer<typeof loggingSchema>;

/** Advanced configuration type */
export type AdvancedConfig = z.infer<typeof advancedSchema>;

/** Fee payer configuration type */
export type FeePayerConfig = z.infer<typeof feePayerSchema>;

/** Fee sponsorship configuration type */
export type FeeSponsorshipConfig = z.infer<typeof feeSponsorshipSchema>;

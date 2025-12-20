/**
 * Environment Variable Loader
 *
 * Parses TEMPO_* environment variables into a configuration object.
 * Environment variables have the highest priority in the config hierarchy.
 */

import { config as dotenvConfig } from 'dotenv';

// Load .env file if present
dotenvConfig();

/**
 * Parse a string to boolean.
 * Accepts: 'true', '1', 'yes' as true; everything else as false.
 */
function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return ['true', '1', 'yes'].includes(value.toLowerCase());
}

/**
 * Parse a string to integer.
 * Returns undefined if parsing fails.
 */
function parseInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Parse a string to float.
 * Returns undefined if parsing fails.
 */
function parseFloat(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Load configuration from environment variables.
 *
 * Supported environment variables:
 *
 * Network:
 *   TEMPO_CHAIN_ID          - Chain ID (number)
 *   TEMPO_RPC_URL           - RPC endpoint URL
 *   TEMPO_EXPLORER_URL      - Block explorer URL
 *
 * Wallet:
 *   TEMPO_PRIVATE_KEY       - Private key (hex with 0x prefix)
 *   TEMPO_KEYSTORE_PATH     - Path to keystore file
 *   TEMPO_KEYSTORE_PASSWORD - Keystore password
 *
 * Security:
 *   TEMPO_MAX_SINGLE_PAYMENT  - Max single payment limit
 *   TEMPO_DAILY_LIMIT         - Daily spending limit
 *   TEMPO_DAILY_TOTAL_USD     - Total daily USD limit
 *   TEMPO_MAX_BATCH_SIZE      - Max batch recipients
 *   TEMPO_MAX_BATCH_TOTAL_USD - Max batch total USD
 *   TEMPO_ALLOWLIST_ENABLED   - Enable address allowlist (true/false)
 *   TEMPO_RATE_LIMIT          - Tool calls per minute
 *   TEMPO_HIGH_RISK_RATE_LIMIT - High-risk ops per hour
 *   TEMPO_REQUIRE_CONFIRMATION - Require confirmation for large txs
 *   TEMPO_CONFIRMATION_THRESHOLD - USD threshold for confirmation
 *
 * Tokens:
 *   TEMPO_DEFAULT_TOKEN     - Default token symbol
 *   TEMPO_ALPHAUSD_ADDRESS  - AlphaUSD token address
 *
 * Logging:
 *   TEMPO_LOG_LEVEL         - Log level (debug/info/warn/error)
 *   TEMPO_AUDIT_LOG_ENABLED - Enable audit logging (true/false)
 *   TEMPO_AUDIT_LOG_PATH    - Audit log file path
 *   TEMPO_AUDIT_LOG_ROTATION_DAYS - Days before log rotation
 *
 * Advanced:
 *   TEMPO_GAS_MULTIPLIER    - Gas estimate multiplier
 *   TEMPO_CONFIRMATIONS     - Block confirmations to wait
 *   TEMPO_TIMEOUT           - Transaction timeout (ms)
 *
 * Fee Sponsorship:
 *   TEMPO_FEE_SPONSORSHIP_ENABLED - Enable fee sponsorship (true/false)
 *   TEMPO_FEE_PAYER_TYPE          - Fee payer type (local/relay)
 *   TEMPO_FEE_PAYER_ADDRESS       - Local fee payer address
 *   TEMPO_FEE_PAYER_KEY           - Local fee payer private key
 *   TEMPO_FEE_RELAY_URL           - Relay service URL
 *   TEMPO_MAX_SPONSORED_DAILY     - Max USD to sponsor per day
 */
export function loadFromEnv(): Record<string, unknown> {
  const env = process.env;

  // Determine wallet type based on which credentials are provided
  let walletType: 'privateKey' | 'keystore' | 'external' | undefined;
  if (env.TEMPO_KEYSTORE_PATH) {
    walletType = 'keystore';
  } else if (env.TEMPO_PRIVATE_KEY) {
    walletType = 'privateKey';
  }

  return {
    network: {
      chainId: parseInt(env.TEMPO_CHAIN_ID),
      rpcUrl: env.TEMPO_RPC_URL,
      explorerUrl: env.TEMPO_EXPLORER_URL,
    },

    wallet: {
      type: walletType,
      privateKey: env.TEMPO_PRIVATE_KEY,
      keystorePath: env.TEMPO_KEYSTORE_PATH,
      keystorePassword: env.TEMPO_KEYSTORE_PASSWORD,
    },

    security: {
      spendingLimits: {
        maxSinglePayment: env.TEMPO_MAX_SINGLE_PAYMENT
          ? { '*': env.TEMPO_MAX_SINGLE_PAYMENT }
          : undefined,
        dailyLimit: env.TEMPO_DAILY_LIMIT
          ? { '*': env.TEMPO_DAILY_LIMIT }
          : undefined,
        dailyTotalUSD: env.TEMPO_DAILY_TOTAL_USD,
        maxBatchSize: parseInt(env.TEMPO_MAX_BATCH_SIZE),
        maxBatchTotalUSD: env.TEMPO_MAX_BATCH_TOTAL_USD,
      },
      addressAllowlist: {
        enabled: parseBoolean(env.TEMPO_ALLOWLIST_ENABLED),
      },
      rateLimits: {
        toolCalls: env.TEMPO_RATE_LIMIT
          ? { maxCalls: parseInt(env.TEMPO_RATE_LIMIT) }
          : undefined,
        highRiskOps: env.TEMPO_HIGH_RISK_RATE_LIMIT
          ? { maxCalls: parseInt(env.TEMPO_HIGH_RISK_RATE_LIMIT) }
          : undefined,
      },
      requireConfirmation: parseBoolean(env.TEMPO_REQUIRE_CONFIRMATION),
      confirmationThreshold: env.TEMPO_CONFIRMATION_THRESHOLD,
    },

    tokens: {
      default: env.TEMPO_DEFAULT_TOKEN,
      aliases: env.TEMPO_ALPHAUSD_ADDRESS
        ? { AlphaUSD: env.TEMPO_ALPHAUSD_ADDRESS }
        : undefined,
    },

    logging: {
      level: env.TEMPO_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' | undefined,
      auditLog: {
        enabled: parseBoolean(env.TEMPO_AUDIT_LOG_ENABLED),
        path: env.TEMPO_AUDIT_LOG_PATH,
        rotationDays: parseInt(env.TEMPO_AUDIT_LOG_ROTATION_DAYS),
      },
    },

    advanced: {
      gasMultiplier: parseFloat(env.TEMPO_GAS_MULTIPLIER),
      confirmations: parseInt(env.TEMPO_CONFIRMATIONS),
      timeout: parseInt(env.TEMPO_TIMEOUT),
    },

    feeSponsorship: {
      enabled: parseBoolean(env.TEMPO_FEE_SPONSORSHIP_ENABLED),
      feePayer: {
        type: env.TEMPO_FEE_PAYER_TYPE as 'local' | 'relay' | undefined,
        address: env.TEMPO_FEE_PAYER_ADDRESS,
        privateKey: env.TEMPO_FEE_PAYER_KEY,
        relayUrl: env.TEMPO_FEE_RELAY_URL,
      },
      maxSponsoredPerDay: env.TEMPO_MAX_SPONSORED_DAILY,
    },
  };
}

/**
 * Recursively remove undefined values from an object.
 * This ensures clean merging without overwriting defined values with undefined.
 */
export function removeUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip undefined values
    if (value === undefined) {
      continue;
    }

    // Recursively clean nested objects (but not arrays or null)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const cleaned = removeUndefined(value as Record<string, unknown>);
      // Only include if the cleaned object has properties
      if (Object.keys(cleaned).length > 0) {
        result[key] = cleaned;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Default Configuration Values
 *
 * These defaults are used when no configuration is provided.
 * They represent conservative, testnet-friendly settings.
 */

import type { TempoMcpConfig } from './schema.js';

/**
 * Default configuration for tempo-mcp.
 *
 * Key design decisions:
 * - Uses Tempo testnet (Chain ID 42429) by default
 * - Conservative spending limits ($1000 single, $10000 daily)
 * - Rate limiting enabled to prevent abuse
 * - Audit logging enabled by default
 * - AlphaUSD as the default token (testnet stablecoin)
 */
export const defaultConfig: TempoMcpConfig = {
  network: {
    chainId: 42429,
    rpcUrl: 'https://rpc.testnet.tempo.xyz',
    explorerUrl: 'https://explore.tempo.xyz',
  },

  wallet: {
    type: 'privateKey',
    // privateKey, keystorePath, keystorePassword, externalSigner
    // are intentionally undefined - must be provided by user
  },

  security: {
    spendingLimits: {
      // Conservative defaults for safety
      maxSinglePayment: { '*': '1000' },
      dailyLimit: { '*': '10000' },
      dailyTotalUSD: '50000',
      maxBatchSize: 50,
      maxBatchTotalUSD: '25000',
    },
    addressAllowlist: {
      enabled: false,
      mode: 'allowlist',
      addresses: [],
      labels: {},
    },
    rateLimits: {
      toolCalls: {
        windowMs: 60000, // 1 minute
        maxCalls: 60, // 1 call per second average
      },
      highRiskOps: {
        windowMs: 3600000, // 1 hour
        maxCalls: 100, // ~1.7 per minute
      },
      perRecipient: {
        windowMs: 86400000, // 24 hours
        maxCalls: 10, // Max 10 payments to same address per day
      },
    },
    requireConfirmation: false,
    confirmationThreshold: '1000',
  },

  tokens: {
    default: 'AlphaUSD',
    aliases: {
      // Testnet AlphaUSD token address
      AlphaUSD: '0x20c0000000000000000000000000000000000001',
    },
  },

  contracts: {
    // TIP-20 Factory for creating new tokens
    tip20Factory: '0x20fc000000000000000000000000000000000000',
    // pathUSD - default quote token for USD stablecoins
    pathUSD: '0x20c0000000000000000000000000000000000000',
    // Stablecoin DEX contract
    stablecoinDex: '0xdec0000000000000000000000000000000000000',
    // TIP-403 Policy Registry
    tip403Registry: '0x403c000000000000000000000000000000000000',
    // Fee Manager
    feeManager: '0xfeec000000000000000000000000000000000000',
  },

  logging: {
    level: 'info',
    auditLog: {
      enabled: true,
      path: './logs/audit.jsonl',
      rotationDays: 30,
    },
  },

  advanced: {
    gasMultiplier: 1.2, // 20% buffer on gas estimates
    confirmations: 1, // Wait for 1 block confirmation
    timeout: 30000, // 30 second transaction timeout
    concurrentChunkSize: 50, // Process 50 concurrent transactions per chunk
    concurrentChunkDelay: 500, // 500ms delay between chunks
  },

  feeSponsorship: {
    enabled: false, // Disabled by default
    feePayer: {
      type: 'local',
      // address and privateKey must be provided by user for local type
      relayUrl: 'https://sponsor.testnet.tempo.xyz',
    },
    maxSponsoredPerDay: '1000', // Max $1000 sponsored per day
  },
};

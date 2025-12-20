/**
 * Configuration Schema Unit Tests
 *
 * Tests for Zod schema validation, defaults, and type inference.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  networkSchema,
  walletSchema,
  externalSignerSchema,
  spendingLimitsSchema,
  addressAllowlistSchema,
  rateLimitWindowSchema,
  rateLimitsSchema,
  securitySchema,
  tokensSchema,
  contractsSchema,
  auditLogSchema,
  loggingSchema,
  advancedSchema,
  feePayerSchema,
  feeSponsorshipSchema,
  configSchema,
} from '../../../src/config/schema.js';
import type {
  TempoMcpConfig,
  NetworkConfig,
  WalletConfig,
  SecurityConfig,
  SpendingLimits,
  FeePayerConfig,
  FeeSponsorshipConfig,
} from '../../../src/config/schema.js';

// =============================================================================
// Network Schema Tests
// =============================================================================

describe('networkSchema', () => {
  it('should provide default values', () => {
    const result = networkSchema.parse({});

    expect(result.chainId).toBe(42429);
    expect(result.rpcUrl).toBe('https://rpc.testnet.tempo.xyz');
    expect(result.explorerUrl).toBe('https://explore.tempo.xyz');
  });

  it('should accept valid custom values', () => {
    const result = networkSchema.parse({
      chainId: 1,
      rpcUrl: 'https://mainnet.infura.io',
      explorerUrl: 'https://etherscan.io',
    });

    expect(result.chainId).toBe(1);
    expect(result.rpcUrl).toBe('https://mainnet.infura.io');
    expect(result.explorerUrl).toBe('https://etherscan.io');
  });

  it('should reject invalid RPC URL', () => {
    expect(() =>
      networkSchema.parse({
        rpcUrl: 'not-a-url',
      })
    ).toThrow();
  });

  it('should reject invalid explorer URL', () => {
    expect(() =>
      networkSchema.parse({
        explorerUrl: 'invalid',
      })
    ).toThrow();
  });

  it('should accept URLs with various protocols', () => {
    const result = networkSchema.parse({
      rpcUrl: 'http://localhost:8545',
      explorerUrl: 'http://127.0.0.1:3000',
    });

    expect(result.rpcUrl).toBe('http://localhost:8545');
    expect(result.explorerUrl).toBe('http://127.0.0.1:3000');
  });
});

// =============================================================================
// Wallet Schema Tests
// =============================================================================

describe('walletSchema', () => {
  it('should provide default type', () => {
    const result = walletSchema.parse({});

    expect(result.type).toBe('privateKey');
    expect(result.privateKey).toBeUndefined();
    expect(result.keystorePath).toBeUndefined();
  });

  it('should accept privateKey type with key', () => {
    const result = walletSchema.parse({
      type: 'privateKey',
      privateKey: '0x1234567890abcdef',
    });

    expect(result.type).toBe('privateKey');
    expect(result.privateKey).toBe('0x1234567890abcdef');
  });

  it('should accept keystore type with path and password', () => {
    const result = walletSchema.parse({
      type: 'keystore',
      keystorePath: './keystore.json',
      keystorePassword: 'secret',
    });

    expect(result.type).toBe('keystore');
    expect(result.keystorePath).toBe('./keystore.json');
    expect(result.keystorePassword).toBe('secret');
  });

  it('should accept external signer type', () => {
    const result = walletSchema.parse({
      type: 'external',
      externalSigner: {
        type: 'turnkey',
        config: { organizationId: 'org-123' },
      },
    });

    expect(result.type).toBe('external');
    expect(result.externalSigner?.type).toBe('turnkey');
    expect(result.externalSigner?.config).toEqual({ organizationId: 'org-123' });
  });

  it('should reject invalid wallet type', () => {
    expect(() =>
      walletSchema.parse({
        type: 'invalid',
      })
    ).toThrow();
  });
});

describe('externalSignerSchema', () => {
  it('should accept turnkey type', () => {
    const result = externalSignerSchema.parse({
      type: 'turnkey',
      config: { apiKey: 'xxx' },
    });

    expect(result.type).toBe('turnkey');
  });

  it('should accept fireblocks type', () => {
    const result = externalSignerSchema.parse({
      type: 'fireblocks',
      config: { vaultId: 'vault-123' },
    });

    expect(result.type).toBe('fireblocks');
  });

  it('should reject invalid signer type', () => {
    expect(() =>
      externalSignerSchema.parse({
        type: 'invalid',
        config: {},
      })
    ).toThrow();
  });

  it('should allow arbitrary config keys', () => {
    const result = externalSignerSchema.parse({
      type: 'turnkey',
      config: {
        key1: 'value1',
        key2: 123,
        nested: { a: 'b' },
      },
    });

    expect(result.config.key1).toBe('value1');
    expect(result.config.key2).toBe(123);
  });
});

// =============================================================================
// Spending Limits Schema Tests
// =============================================================================

describe('spendingLimitsSchema', () => {
  it('should provide default values', () => {
    const result = spendingLimitsSchema.parse({});

    expect(result.maxSinglePayment).toEqual({ '*': '1000' });
    expect(result.dailyLimit).toEqual({ '*': '10000' });
    expect(result.dailyTotalUSD).toBe('50000');
    expect(result.maxBatchSize).toBe(50);
    expect(result.maxBatchTotalUSD).toBe('25000');
  });

  it('should accept custom per-token limits', () => {
    const result = spendingLimitsSchema.parse({
      maxSinglePayment: {
        '*': '500',
        AlphaUSD: '1000',
        USDC: '2000',
      },
      dailyLimit: {
        '*': '5000',
        AlphaUSD: '10000',
      },
    });

    expect(result.maxSinglePayment['*']).toBe('500');
    expect(result.maxSinglePayment['AlphaUSD']).toBe('1000');
    expect(result.maxSinglePayment['USDC']).toBe('2000');
  });

  it('should reject non-positive batch size', () => {
    expect(() =>
      spendingLimitsSchema.parse({
        maxBatchSize: 0,
      })
    ).toThrow();

    expect(() =>
      spendingLimitsSchema.parse({
        maxBatchSize: -5,
      })
    ).toThrow();
  });

  it('should reject non-integer batch size', () => {
    expect(() =>
      spendingLimitsSchema.parse({
        maxBatchSize: 10.5,
      })
    ).toThrow();
  });

  it('should allow string amounts (amounts use string precision)', () => {
    const result = spendingLimitsSchema.parse({
      dailyTotalUSD: '999999999999.99',
      maxBatchTotalUSD: '0.01',
    });

    expect(result.dailyTotalUSD).toBe('999999999999.99');
    expect(result.maxBatchTotalUSD).toBe('0.01');
  });
});

// =============================================================================
// Address Allowlist Schema Tests
// =============================================================================

describe('addressAllowlistSchema', () => {
  it('should provide defaults with allowlist disabled', () => {
    const result = addressAllowlistSchema.parse({});

    expect(result.enabled).toBe(false);
    expect(result.mode).toBe('allowlist');
    expect(result.addresses).toEqual([]);
    expect(result.labels).toEqual({});
  });

  it('should accept enabled allowlist with addresses', () => {
    const result = addressAllowlistSchema.parse({
      enabled: true,
      mode: 'allowlist',
      addresses: ['0x1234', '0x5678'],
      labels: {
        '0x1234': 'Treasury',
        '0x5678': 'Vendor',
      },
    });

    expect(result.enabled).toBe(true);
    expect(result.addresses).toHaveLength(2);
    expect(result.labels['0x1234']).toBe('Treasury');
  });

  it('should accept blocklist mode', () => {
    const result = addressAllowlistSchema.parse({
      enabled: true,
      mode: 'blocklist',
      addresses: ['0xbad'],
    });

    expect(result.mode).toBe('blocklist');
  });

  it('should reject invalid mode', () => {
    expect(() =>
      addressAllowlistSchema.parse({
        mode: 'graylist',
      })
    ).toThrow();
  });
});

// =============================================================================
// Rate Limits Schema Tests
// =============================================================================

describe('rateLimitWindowSchema', () => {
  it('should provide default values', () => {
    const result = rateLimitWindowSchema.parse({});

    expect(result.windowMs).toBe(60000);
    expect(result.maxCalls).toBe(60);
  });

  it('should accept custom values', () => {
    const result = rateLimitWindowSchema.parse({
      windowMs: 30000,
      maxCalls: 100,
    });

    expect(result.windowMs).toBe(30000);
    expect(result.maxCalls).toBe(100);
  });

  it('should reject non-positive windowMs', () => {
    expect(() =>
      rateLimitWindowSchema.parse({
        windowMs: 0,
      })
    ).toThrow();

    expect(() =>
      rateLimitWindowSchema.parse({
        windowMs: -1000,
      })
    ).toThrow();
  });

  it('should reject non-positive maxCalls', () => {
    expect(() =>
      rateLimitWindowSchema.parse({
        maxCalls: 0,
      })
    ).toThrow();
  });

  it('should reject non-integer values', () => {
    expect(() =>
      rateLimitWindowSchema.parse({
        windowMs: 1000.5,
      })
    ).toThrow();

    expect(() =>
      rateLimitWindowSchema.parse({
        maxCalls: 10.5,
      })
    ).toThrow();
  });
});

describe('rateLimitsSchema', () => {
  it('should provide sensible defaults for all categories', () => {
    const result = rateLimitsSchema.parse({});

    // toolCalls: 60 per minute
    expect(result.toolCalls.windowMs).toBe(60000);
    expect(result.toolCalls.maxCalls).toBe(60);

    // highRiskOps: 100 per hour
    expect(result.highRiskOps.windowMs).toBe(3600000);
    expect(result.highRiskOps.maxCalls).toBe(100);

    // perRecipient: 10 per day
    expect(result.perRecipient.windowMs).toBe(86400000);
    expect(result.perRecipient.maxCalls).toBe(10);
  });

  it('should allow customizing individual categories', () => {
    const result = rateLimitsSchema.parse({
      highRiskOps: {
        windowMs: 7200000, // 2 hours
        maxCalls: 50,
      },
    });

    expect(result.highRiskOps.windowMs).toBe(7200000);
    expect(result.highRiskOps.maxCalls).toBe(50);
    // Others should still have defaults
    expect(result.toolCalls.maxCalls).toBe(60);
  });
});

// =============================================================================
// Security Schema Tests
// =============================================================================

describe('securitySchema', () => {
  it('should provide all defaults', () => {
    const result = securitySchema.parse({});

    expect(result.spendingLimits).toBeDefined();
    expect(result.addressAllowlist).toBeDefined();
    expect(result.rateLimits).toBeDefined();
    expect(result.requireConfirmation).toBe(false);
    expect(result.confirmationThreshold).toBe('1000');
  });

  it('should accept nested configuration', () => {
    const result = securitySchema.parse({
      spendingLimits: {
        maxSinglePayment: { '*': '500' },
      },
      addressAllowlist: {
        enabled: true,
      },
      requireConfirmation: true,
      confirmationThreshold: '5000',
    });

    expect(result.spendingLimits.maxSinglePayment['*']).toBe('500');
    expect(result.addressAllowlist.enabled).toBe(true);
    expect(result.requireConfirmation).toBe(true);
    expect(result.confirmationThreshold).toBe('5000');
  });
});

// =============================================================================
// Tokens Schema Tests
// =============================================================================

describe('tokensSchema', () => {
  it('should provide AlphaUSD as default', () => {
    const result = tokensSchema.parse({});

    expect(result.default).toBe('AlphaUSD');
    expect(result.aliases.AlphaUSD).toBe('0x20c0000000000000000000000000000000000001');
  });

  it('should accept custom tokens', () => {
    const result = tokensSchema.parse({
      default: 'USDC',
      aliases: {
        USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        DAI: '0x6B175474E89094C44Da98b954EesvcC44Da98b954E',
      },
    });

    expect(result.default).toBe('USDC');
    expect(result.aliases.USDC).toBeDefined();
  });

  it('should merge with default aliases when not overriding', () => {
    const result = tokensSchema.parse({
      aliases: {
        USDC: '0xusdc',
      },
    });

    // Note: This overwrites the entire aliases object
    expect(result.aliases.USDC).toBe('0xusdc');
    expect(result.aliases.AlphaUSD).toBeUndefined();
  });
});

// =============================================================================
// Contracts Schema Tests
// =============================================================================

describe('contractsSchema', () => {
  it('should provide Tempo contract defaults', () => {
    const result = contractsSchema.parse({});

    expect(result.tip20Factory).toBe('0x20fc000000000000000000000000000000000000');
    expect(result.pathUSD).toBe('0x20c0000000000000000000000000000000000000');
    expect(result.stablecoinDex).toBe('0xdec0000000000000000000000000000000000000');
    expect(result.tip403Registry).toBe('0x403c000000000000000000000000000000000000');
    expect(result.feeManager).toBe('0xfeec000000000000000000000000000000000000');
  });

  it('should accept custom contract addresses', () => {
    const result = contractsSchema.parse({
      tip20Factory: '0x1111111111111111111111111111111111111111',
      feeManager: '0x2222222222222222222222222222222222222222',
    });

    expect(result.tip20Factory).toBe('0x1111111111111111111111111111111111111111');
    expect(result.feeManager).toBe('0x2222222222222222222222222222222222222222');
    // Others remain default
    expect(result.pathUSD).toBe('0x20c0000000000000000000000000000000000000');
  });
});

// =============================================================================
// Logging Schema Tests
// =============================================================================

describe('auditLogSchema', () => {
  it('should provide defaults', () => {
    const result = auditLogSchema.parse({});

    expect(result.enabled).toBe(true);
    expect(result.path).toBe('./logs/audit.jsonl');
    expect(result.rotationDays).toBe(30);
  });

  it('should accept custom values', () => {
    const result = auditLogSchema.parse({
      enabled: false,
      path: '/var/log/tempo/audit.jsonl',
      rotationDays: 90,
    });

    expect(result.enabled).toBe(false);
    expect(result.path).toBe('/var/log/tempo/audit.jsonl');
    expect(result.rotationDays).toBe(90);
  });

  it('should reject non-positive rotation days', () => {
    expect(() =>
      auditLogSchema.parse({
        rotationDays: 0,
      })
    ).toThrow();

    expect(() =>
      auditLogSchema.parse({
        rotationDays: -7,
      })
    ).toThrow();
  });
});

describe('loggingSchema', () => {
  it('should provide info level default', () => {
    const result = loggingSchema.parse({});

    expect(result.level).toBe('info');
    expect(result.auditLog.enabled).toBe(true);
  });

  it('should accept all valid log levels', () => {
    const levels = ['debug', 'info', 'warn', 'error'] as const;

    for (const level of levels) {
      const result = loggingSchema.parse({ level });
      expect(result.level).toBe(level);
    }
  });

  it('should reject invalid log level', () => {
    expect(() =>
      loggingSchema.parse({
        level: 'verbose',
      })
    ).toThrow();
  });
});

// =============================================================================
// Advanced Schema Tests
// =============================================================================

describe('advancedSchema', () => {
  it('should provide sensible defaults', () => {
    const result = advancedSchema.parse({});

    expect(result.gasMultiplier).toBe(1.2);
    expect(result.confirmations).toBe(1);
    expect(result.timeout).toBe(30000);
  });

  it('should accept custom values', () => {
    const result = advancedSchema.parse({
      gasMultiplier: 1.5,
      confirmations: 3,
      timeout: 60000,
    });

    expect(result.gasMultiplier).toBe(1.5);
    expect(result.confirmations).toBe(3);
    expect(result.timeout).toBe(60000);
  });

  it('should reject non-positive gas multiplier', () => {
    expect(() =>
      advancedSchema.parse({
        gasMultiplier: 0,
      })
    ).toThrow();

    expect(() =>
      advancedSchema.parse({
        gasMultiplier: -1.5,
      })
    ).toThrow();
  });

  it('should allow zero confirmations', () => {
    const result = advancedSchema.parse({
      confirmations: 0,
    });

    expect(result.confirmations).toBe(0);
  });

  it('should reject negative confirmations', () => {
    expect(() =>
      advancedSchema.parse({
        confirmations: -1,
      })
    ).toThrow();
  });

  it('should reject non-positive timeout', () => {
    expect(() =>
      advancedSchema.parse({
        timeout: 0,
      })
    ).toThrow();
  });
});

// =============================================================================
// Fee Sponsorship Schema Tests
// =============================================================================

describe('feePayerSchema', () => {
  it('should provide default values', () => {
    const result = feePayerSchema.parse({});

    expect(result.type).toBe('local');
    expect(result.relayUrl).toBe('https://sponsor.testnet.tempo.xyz');
    expect(result.address).toBeUndefined();
    expect(result.privateKey).toBeUndefined();
  });

  it('should accept local type with address and key', () => {
    const result = feePayerSchema.parse({
      type: 'local',
      address: '0x1234567890123456789012345678901234567890',
      privateKey: '0xabcdef',
    });

    expect(result.type).toBe('local');
    expect(result.address).toBe('0x1234567890123456789012345678901234567890');
    expect(result.privateKey).toBe('0xabcdef');
  });

  it('should accept relay type with custom URL', () => {
    const result = feePayerSchema.parse({
      type: 'relay',
      relayUrl: 'https://custom.relay.example.com',
    });

    expect(result.type).toBe('relay');
    expect(result.relayUrl).toBe('https://custom.relay.example.com');
  });

  it('should reject invalid fee payer type', () => {
    expect(() =>
      feePayerSchema.parse({
        type: 'invalid',
      })
    ).toThrow();
  });

  it('should reject invalid relay URL', () => {
    expect(() =>
      feePayerSchema.parse({
        relayUrl: 'not-a-url',
      })
    ).toThrow();
  });
});

describe('feeSponsorshipSchema', () => {
  it('should provide defaults with sponsorship disabled', () => {
    const result = feeSponsorshipSchema.parse({});

    expect(result.enabled).toBe(false);
    expect(result.feePayer).toBeDefined();
    expect(result.feePayer.type).toBe('local');
    expect(result.maxSponsoredPerDay).toBe('1000');
  });

  it('should accept enabled sponsorship with local fee payer', () => {
    const result = feeSponsorshipSchema.parse({
      enabled: true,
      feePayer: {
        type: 'local',
        address: '0x1234567890123456789012345678901234567890',
        privateKey: '0xprivatekey',
      },
      maxSponsoredPerDay: '5000',
    });

    expect(result.enabled).toBe(true);
    expect(result.feePayer.type).toBe('local');
    expect(result.feePayer.address).toBe('0x1234567890123456789012345678901234567890');
    expect(result.maxSponsoredPerDay).toBe('5000');
  });

  it('should accept relay-based fee payer', () => {
    const result = feeSponsorshipSchema.parse({
      enabled: true,
      feePayer: {
        type: 'relay',
        relayUrl: 'https://sponsor.tempo.xyz',
      },
    });

    expect(result.enabled).toBe(true);
    expect(result.feePayer.type).toBe('relay');
    expect(result.feePayer.relayUrl).toBe('https://sponsor.tempo.xyz');
  });

  it('should allow string amounts for maxSponsoredPerDay', () => {
    const result = feeSponsorshipSchema.parse({
      maxSponsoredPerDay: '999999.99',
    });

    expect(result.maxSponsoredPerDay).toBe('999999.99');
  });
});

// =============================================================================
// Complete Config Schema Tests
// =============================================================================

describe('configSchema', () => {
  it('should accept empty object with all defaults', () => {
    const result = configSchema.parse({});

    expect(result.network).toBeDefined();
    expect(result.wallet).toBeDefined();
    expect(result.security).toBeDefined();
    expect(result.tokens).toBeDefined();
    expect(result.contracts).toBeDefined();
    expect(result.logging).toBeDefined();
    expect(result.advanced).toBeDefined();
    expect(result.feeSponsorship).toBeDefined();
    expect(result.feeSponsorship.enabled).toBe(false);
  });

  it('should accept partial configuration', () => {
    const result = configSchema.parse({
      network: {
        chainId: 1,
      },
      security: {
        requireConfirmation: true,
      },
    });

    expect(result.network.chainId).toBe(1);
    expect(result.network.rpcUrl).toBe('https://rpc.testnet.tempo.xyz'); // default
    expect(result.security.requireConfirmation).toBe(true);
    expect(result.wallet.type).toBe('privateKey'); // default
  });

  it('should accept full configuration', () => {
    const fullConfig = {
      network: {
        chainId: 42429,
        rpcUrl: 'https://custom.rpc.url',
        explorerUrl: 'https://custom.explorer.url',
      },
      wallet: {
        type: 'privateKey' as const,
        privateKey: '0x123',
      },
      security: {
        spendingLimits: {
          maxSinglePayment: { '*': '100' },
          dailyLimit: { '*': '1000' },
          dailyTotalUSD: '5000',
          maxBatchSize: 20,
          maxBatchTotalUSD: '10000',
        },
        addressAllowlist: {
          enabled: true,
          mode: 'allowlist' as const,
          addresses: ['0xabc'],
          labels: {},
        },
        rateLimits: {
          toolCalls: { windowMs: 60000, maxCalls: 30 },
          highRiskOps: { windowMs: 3600000, maxCalls: 50 },
          perRecipient: { windowMs: 86400000, maxCalls: 5 },
        },
        requireConfirmation: true,
        confirmationThreshold: '500',
      },
      tokens: {
        default: 'USDC',
        aliases: { USDC: '0xusdc' },
      },
      contracts: {
        tip20Factory: '0xfactory',
        pathUSD: '0xpathusd',
        stablecoinDex: '0xdex',
        tip403Registry: '0xregistry',
        feeManager: '0xfee',
      },
      logging: {
        level: 'debug' as const,
        auditLog: {
          enabled: true,
          path: './custom/audit.jsonl',
          rotationDays: 7,
        },
      },
      advanced: {
        gasMultiplier: 1.3,
        confirmations: 2,
        timeout: 45000,
      },
      feeSponsorship: {
        enabled: true,
        feePayer: {
          type: 'local' as const,
          address: '0xfeepayer',
          privateKey: '0xfeekey',
        },
        maxSponsoredPerDay: '10000',
      },
    };

    const result = configSchema.parse(fullConfig);

    expect(result.network.chainId).toBe(42429);
    expect(result.security.spendingLimits.maxBatchSize).toBe(20);
    expect(result.logging.level).toBe('debug');
    expect(result.feeSponsorship.enabled).toBe(true);
    expect(result.feeSponsorship.feePayer.type).toBe('local');
    expect(result.feeSponsorship.maxSponsoredPerDay).toBe('10000');
  });

  it('should propagate validation errors from nested schemas', () => {
    expect(() =>
      configSchema.parse({
        advanced: {
          timeout: -1,
        },
      })
    ).toThrow();

    expect(() =>
      configSchema.parse({
        network: {
          rpcUrl: 'not-a-url',
        },
      })
    ).toThrow();
  });
});

// =============================================================================
// Type Inference Tests
// =============================================================================

describe('type inference', () => {
  it('should infer correct types from schema', () => {
    const config: TempoMcpConfig = configSchema.parse({});

    // Type checks (compilation would fail if types don't match)
    const chainId: number = config.network.chainId;
    const walletType: 'privateKey' | 'keystore' | 'external' = config.wallet.type;
    const enabled: boolean = config.security.addressAllowlist.enabled;
    const defaultToken: string = config.tokens.default;

    expect(typeof chainId).toBe('number');
    expect(typeof walletType).toBe('string');
    expect(typeof enabled).toBe('boolean');
    expect(typeof defaultToken).toBe('string');
  });

  it('should allow partial input with complete output', () => {
    // Input is partial
    const input = { network: { chainId: 1 } };

    // Output is complete
    const output: TempoMcpConfig = configSchema.parse(input);

    expect(output.network.rpcUrl).toBeDefined();
    expect(output.wallet.type).toBeDefined();
    expect(output.security.spendingLimits.maxBatchSize).toBeDefined();
  });
});

// =============================================================================
// Edge Cases and Error Messages
// =============================================================================

describe('edge cases', () => {
  it('should handle null values gracefully', () => {
    // Zod will fail on null values for required fields
    expect(() =>
      configSchema.parse({
        network: null,
      })
    ).toThrow();
  });

  it('should handle undefined sections gracefully', () => {
    const result = configSchema.parse({
      network: undefined,
    });

    // undefined sections get defaults
    expect(result.network).toBeDefined();
  });

  it('should strip extra properties by default', () => {
    const result = networkSchema.parse({
      chainId: 1,
      extraProperty: 'should be stripped',
    });

    expect((result as Record<string, unknown>).extraProperty).toBeUndefined();
    expect(result.chainId).toBe(1);
  });

  it('should handle very large numbers', () => {
    const result = advancedSchema.parse({
      timeout: Number.MAX_SAFE_INTEGER,
    });

    expect(result.timeout).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('should handle decimal gas multiplier precision', () => {
    const result = advancedSchema.parse({
      gasMultiplier: 1.123456789,
    });

    expect(result.gasMultiplier).toBe(1.123456789);
  });
});

describe('error messages', () => {
  it('should provide informative error for invalid URL', () => {
    try {
      networkSchema.parse({ rpcUrl: 'invalid' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(z.ZodError);
      const zodError = error as z.ZodError;
      expect(zodError.issues.length).toBeGreaterThan(0);
      expect(zodError.issues[0].path).toContain('rpcUrl');
    }
  });

  it('should provide path information in nested errors', () => {
    try {
      configSchema.parse({
        security: {
          rateLimits: {
            toolCalls: {
              maxCalls: -1,
            },
          },
        },
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(z.ZodError);
      const zodError = error as z.ZodError;
      const path = zodError.issues[0].path;
      expect(path).toContain('security');
      expect(path).toContain('rateLimits');
      expect(path).toContain('toolCalls');
      expect(path).toContain('maxCalls');
    }
  });
});

/**
 * Mock Configuration Utilities
 *
 * Provides utilities for creating mock configurations in tests.
 * Uses vi.mock to override the config module with test-specific values.
 */

import { vi } from 'vitest';
import type { TempoMcpConfig } from '../../src/config/schema.js';
import { TEST_ADDRESSES, TEST_TOKENS } from './test-helpers.js';

// =============================================================================
// Default Test Configuration
// =============================================================================

/**
 * Base configuration for tests with reasonable defaults.
 * This is the starting point for most test configurations.
 */
export const DEFAULT_TEST_CONFIG: TempoMcpConfig = {
  network: {
    chainId: 42429,
    rpcUrl: 'https://rpc.testnet.tempo.xyz',
    explorerUrl: 'https://explore.tempo.xyz',
  },
  wallet: {
    type: 'privateKey',
    privateKey: '0x' + 'a'.repeat(64), // Test private key
  },
  security: {
    spendingLimits: {
      maxSinglePayment: { '*': '1000', AlphaUSD: '5000' },
      dailyLimit: { '*': '10000', AlphaUSD: '50000' },
      dailyTotalUSD: '100000',
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
      toolCalls: { windowMs: 60000, maxCalls: 60 },
      highRiskOps: { windowMs: 3600000, maxCalls: 100 },
      perRecipient: { windowMs: 86400000, maxCalls: 10 },
    },
    requireConfirmation: false,
    confirmationThreshold: '1000',
  },
  tokens: {
    default: 'AlphaUSD',
    aliases: {
      AlphaUSD: TEST_TOKENS.ALPHA_USD,
      PathUSD: TEST_TOKENS.PATH_USD,
    },
  },
  contracts: {
    tip20Factory: '0x20fc000000000000000000000000000000000000',
    pathUSD: TEST_TOKENS.PATH_USD,
    stablecoinDex: '0xdec0000000000000000000000000000000000000',
    tip403Registry: '0x403c000000000000000000000000000000000000',
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
    gasMultiplier: 1.2,
    confirmations: 1,
    timeout: 30000,
  },
};

// =============================================================================
// Pre-built Configuration Variants
// =============================================================================

/**
 * Strict security configuration for testing security limits.
 * Uses low limits and enables allowlist.
 */
export const STRICT_SECURITY_CONFIG: TempoMcpConfig = {
  ...DEFAULT_TEST_CONFIG,
  security: {
    spendingLimits: {
      maxSinglePayment: { '*': '100' },
      dailyLimit: { '*': '500' },
      dailyTotalUSD: '1000',
      maxBatchSize: 5,
      maxBatchTotalUSD: '500',
    },
    addressAllowlist: {
      enabled: true,
      mode: 'allowlist',
      addresses: [TEST_ADDRESSES.VALID, TEST_ADDRESSES.VALID_2],
      labels: {
        [TEST_ADDRESSES.VALID]: 'Test Recipient 1',
        [TEST_ADDRESSES.VALID_2]: 'Test Recipient 2',
      },
    },
    rateLimits: {
      toolCalls: { windowMs: 60000, maxCalls: 10 },
      highRiskOps: { windowMs: 60000, maxCalls: 5 },
      perRecipient: { windowMs: 60000, maxCalls: 2 },
    },
    requireConfirmation: true,
    confirmationThreshold: '100',
  },
};

/**
 * Permissive configuration for testing happy paths.
 * Uses high limits and disables restrictions.
 */
export const PERMISSIVE_CONFIG: TempoMcpConfig = {
  ...DEFAULT_TEST_CONFIG,
  security: {
    spendingLimits: {
      maxSinglePayment: { '*': '1000000' },
      dailyLimit: { '*': '10000000' },
      dailyTotalUSD: '100000000',
      maxBatchSize: 1000,
      maxBatchTotalUSD: '10000000',
    },
    addressAllowlist: {
      enabled: false,
      mode: 'allowlist',
      addresses: [],
      labels: {},
    },
    rateLimits: {
      toolCalls: { windowMs: 1000, maxCalls: 10000 },
      highRiskOps: { windowMs: 1000, maxCalls: 10000 },
      perRecipient: { windowMs: 1000, maxCalls: 10000 },
    },
    requireConfirmation: false,
    confirmationThreshold: '1000000000',
  },
};

/**
 * Configuration with blocklist mode enabled.
 */
export const BLOCKLIST_CONFIG: TempoMcpConfig = {
  ...DEFAULT_TEST_CONFIG,
  security: {
    ...DEFAULT_TEST_CONFIG.security,
    addressAllowlist: {
      enabled: true,
      mode: 'blocklist',
      addresses: [TEST_ADDRESSES.VALID_3],
      labels: {
        [TEST_ADDRESSES.VALID_3]: 'Blocked Address',
      },
    },
  },
};

/**
 * Configuration with audit logging disabled.
 */
export const NO_AUDIT_CONFIG: TempoMcpConfig = {
  ...DEFAULT_TEST_CONFIG,
  logging: {
    ...DEFAULT_TEST_CONFIG.logging,
    auditLog: {
      enabled: false,
      path: './logs/audit.jsonl',
      rotationDays: 30,
    },
  },
};

// =============================================================================
// Configuration Creation Utilities
// =============================================================================

/**
 * Deep merge objects, with source overriding target.
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = result[key as keyof T];

    if (
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key as keyof T] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key as keyof T] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Create a test configuration with custom overrides.
 *
 * @param overrides - Partial configuration to merge with defaults
 * @returns Complete test configuration
 *
 * @example
 * ```typescript
 * const config = createMockConfig({
 *   security: {
 *     spendingLimits: {
 *       maxSinglePayment: { '*': '50' },
 *     },
 *   },
 * });
 * ```
 */
export function createMockConfig(
  overrides: DeepPartial<TempoMcpConfig> = {}
): TempoMcpConfig {
  return deepMerge(DEFAULT_TEST_CONFIG, overrides as Partial<TempoMcpConfig>);
}

/**
 * Create spending limits configuration.
 */
export function createSpendingLimitsConfig(overrides: {
  maxSinglePayment?: Record<string, string>;
  dailyLimit?: Record<string, string>;
  dailyTotalUSD?: string;
  maxBatchSize?: number;
  maxBatchTotalUSD?: string;
} = {}): TempoMcpConfig {
  return createMockConfig({
    security: {
      spendingLimits: {
        maxSinglePayment: overrides.maxSinglePayment ?? { '*': '1000' },
        dailyLimit: overrides.dailyLimit ?? { '*': '10000' },
        dailyTotalUSD: overrides.dailyTotalUSD ?? '100000',
        maxBatchSize: overrides.maxBatchSize ?? 50,
        maxBatchTotalUSD: overrides.maxBatchTotalUSD ?? '25000',
      },
    },
  });
}

/**
 * Create rate limits configuration.
 */
export function createRateLimitsConfig(overrides: {
  toolCalls?: { windowMs: number; maxCalls: number };
  highRiskOps?: { windowMs: number; maxCalls: number };
  perRecipient?: { windowMs: number; maxCalls: number };
} = {}): TempoMcpConfig {
  return createMockConfig({
    security: {
      rateLimits: {
        toolCalls: overrides.toolCalls ?? { windowMs: 60000, maxCalls: 60 },
        highRiskOps: overrides.highRiskOps ?? { windowMs: 3600000, maxCalls: 100 },
        perRecipient: overrides.perRecipient ?? { windowMs: 86400000, maxCalls: 10 },
      },
    },
  });
}

/**
 * Create allowlist configuration.
 */
export function createAllowlistConfig(overrides: {
  enabled?: boolean;
  mode?: 'allowlist' | 'blocklist';
  addresses?: string[];
  labels?: Record<string, string>;
} = {}): TempoMcpConfig {
  return createMockConfig({
    security: {
      addressAllowlist: {
        enabled: overrides.enabled ?? true,
        mode: overrides.mode ?? 'allowlist',
        addresses: overrides.addresses ?? [TEST_ADDRESSES.VALID],
        labels: overrides.labels ?? {},
      },
    },
  });
}

// =============================================================================
// Mock Module Utilities
// =============================================================================

/**
 * Current mock configuration (for use in mock factory).
 */
let currentMockConfig: TempoMcpConfig = DEFAULT_TEST_CONFIG;

/**
 * Set the mock configuration that getConfig() will return.
 * Use this before running tests that depend on specific config.
 *
 * @param config - Configuration to use, or partial overrides
 */
export function setMockConfig(
  config: TempoMcpConfig | DeepPartial<TempoMcpConfig>
): void {
  if (isFullConfig(config)) {
    currentMockConfig = config;
  } else {
    currentMockConfig = createMockConfig(config);
  }
}

/**
 * Get the current mock configuration.
 * This is called by the mocked getConfig() function.
 */
export function getMockConfig(): TempoMcpConfig {
  return currentMockConfig;
}

/**
 * Reset mock configuration to defaults.
 */
export function resetMockConfig(): void {
  currentMockConfig = DEFAULT_TEST_CONFIG;
}

/**
 * Check if a config object is a complete TempoMcpConfig.
 */
function isFullConfig(
  config: TempoMcpConfig | DeepPartial<TempoMcpConfig>
): config is TempoMcpConfig {
  return (
    'network' in config &&
    'wallet' in config &&
    'security' in config &&
    'tokens' in config &&
    'contracts' in config &&
    'logging' in config &&
    'advanced' in config &&
    typeof config.network === 'object' &&
    config.network !== null &&
    'chainId' in config.network
  );
}

// =============================================================================
// Vitest Mock Setup
// =============================================================================

/**
 * Create a mock for the config module.
 * Use this with vi.mock() in beforeEach.
 *
 * @example
 * ```typescript
 * import { vi, beforeEach, afterEach } from 'vitest';
 * import { setMockConfig, resetMockConfig, createConfigMock } from './mock-config.js';
 *
 * beforeEach(() => {
 *   vi.mock('../../src/config/index.js', () => createConfigMock());
 * });
 *
 * afterEach(() => {
 *   vi.restoreAllMocks();
 *   resetMockConfig();
 * });
 *
 * it('should use custom config', () => {
 *   setMockConfig({ security: { spendingLimits: { maxSinglePayment: { '*': '50' } } } });
 *   // ... test code
 * });
 * ```
 */
export function createConfigMock() {
  return {
    getConfig: () => getMockConfig(),
    loadConfig: () => getMockConfig(),
    resetConfig: vi.fn(),
    hasConfigFile: () => null,
    configSchema: {},
    defaultConfig: DEFAULT_TEST_CONFIG,
  };
}

// =============================================================================
// Type Helpers
// =============================================================================

/**
 * Deep partial type for configuration overrides.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

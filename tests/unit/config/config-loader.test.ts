/**
 * Configuration Loader Unit Tests
 *
 * Tests for configuration loading, merging, caching, and validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Setup Mocks Before Imports
// =============================================================================

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

// Mock yaml parser
vi.mock('yaml', () => ({
  parse: vi.fn((content: string) => JSON.parse(content)),
}));

// Mock dotenv
vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

// Store original env
const originalEnv = { ...process.env };

// =============================================================================
// Imports After Mocks
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { loadFromEnv, removeUndefined } from '../../../src/config/env-loader.js';
import { loadFromFile, findConfigFile } from '../../../src/config/file-loader.js';
import {
  loadConfig,
  getConfig,
  resetConfig,
  hasConfigFile,
} from '../../../src/config/index.js';

// =============================================================================
// Environment Variable Loader Tests
// =============================================================================

describe('loadFromEnv', () => {
  beforeEach(() => {
    // Clear all TEMPO_ environment variables
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('TEMPO_')) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  it('should return empty structure when no env vars set', () => {
    const result = loadFromEnv();

    expect(result.network).toBeDefined();
    expect(result.wallet).toBeDefined();
    expect(result.security).toBeDefined();
  });

  it('should load network configuration', () => {
    process.env.TEMPO_CHAIN_ID = '1';
    process.env.TEMPO_RPC_URL = 'https://mainnet.infura.io';
    process.env.TEMPO_EXPLORER_URL = 'https://etherscan.io';

    const result = loadFromEnv();

    expect((result.network as Record<string, unknown>).chainId).toBe(1);
    expect((result.network as Record<string, unknown>).rpcUrl).toBe('https://mainnet.infura.io');
    expect((result.network as Record<string, unknown>).explorerUrl).toBe('https://etherscan.io');
  });

  it('should load wallet configuration with privateKey', () => {
    process.env.TEMPO_PRIVATE_KEY = '0x123456';

    const result = loadFromEnv();
    const wallet = result.wallet as Record<string, unknown>;

    expect(wallet.type).toBe('privateKey');
    expect(wallet.privateKey).toBe('0x123456');
  });

  it('should prefer keystore type when keystore path is set', () => {
    process.env.TEMPO_PRIVATE_KEY = '0x123456';
    process.env.TEMPO_KEYSTORE_PATH = './keystore.json';
    process.env.TEMPO_KEYSTORE_PASSWORD = 'secret';

    const result = loadFromEnv();
    const wallet = result.wallet as Record<string, unknown>;

    expect(wallet.type).toBe('keystore');
    expect(wallet.keystorePath).toBe('./keystore.json');
    expect(wallet.keystorePassword).toBe('secret');
  });

  it('should load security configuration', () => {
    process.env.TEMPO_MAX_SINGLE_PAYMENT = '500';
    process.env.TEMPO_DAILY_LIMIT = '5000';
    process.env.TEMPO_DAILY_TOTAL_USD = '25000';
    process.env.TEMPO_MAX_BATCH_SIZE = '25';
    process.env.TEMPO_ALLOWLIST_ENABLED = 'true';
    process.env.TEMPO_REQUIRE_CONFIRMATION = 'yes';
    process.env.TEMPO_CONFIRMATION_THRESHOLD = '1000';

    const result = loadFromEnv();
    const security = result.security as Record<string, unknown>;
    const spending = security.spendingLimits as Record<string, unknown>;
    const allowlist = security.addressAllowlist as Record<string, unknown>;

    expect((spending.maxSinglePayment as Record<string, string>)['*']).toBe('500');
    expect((spending.dailyLimit as Record<string, string>)['*']).toBe('5000');
    expect(spending.dailyTotalUSD).toBe('25000');
    expect(spending.maxBatchSize).toBe(25);
    expect(allowlist.enabled).toBe(true);
    expect(security.requireConfirmation).toBe(true);
    expect(security.confirmationThreshold).toBe('1000');
  });

  it('should load rate limit configuration', () => {
    process.env.TEMPO_RATE_LIMIT = '30';
    process.env.TEMPO_HIGH_RISK_RATE_LIMIT = '50';

    const result = loadFromEnv();
    const security = result.security as Record<string, unknown>;
    const rateLimits = security.rateLimits as Record<string, unknown>;

    expect((rateLimits.toolCalls as Record<string, number>).maxCalls).toBe(30);
    expect((rateLimits.highRiskOps as Record<string, number>).maxCalls).toBe(50);
  });

  it('should load token configuration', () => {
    process.env.TEMPO_DEFAULT_TOKEN = 'USDC';
    process.env.TEMPO_ALPHAUSD_ADDRESS = '0xAlphaUSD';

    const result = loadFromEnv();
    const tokens = result.tokens as Record<string, unknown>;

    expect(tokens.default).toBe('USDC');
    expect((tokens.aliases as Record<string, string>).AlphaUSD).toBe('0xAlphaUSD');
  });

  it('should load logging configuration', () => {
    process.env.TEMPO_LOG_LEVEL = 'debug';
    process.env.TEMPO_AUDIT_LOG_ENABLED = 'false';
    process.env.TEMPO_AUDIT_LOG_PATH = '/var/log/audit.jsonl';
    process.env.TEMPO_AUDIT_LOG_ROTATION_DAYS = '7';

    const result = loadFromEnv();
    const logging = result.logging as Record<string, unknown>;
    const auditLog = logging.auditLog as Record<string, unknown>;

    expect(logging.level).toBe('debug');
    expect(auditLog.enabled).toBe(false);
    expect(auditLog.path).toBe('/var/log/audit.jsonl');
    expect(auditLog.rotationDays).toBe(7);
  });

  it('should load advanced configuration', () => {
    process.env.TEMPO_GAS_MULTIPLIER = '1.5';
    process.env.TEMPO_CONFIRMATIONS = '3';
    process.env.TEMPO_TIMEOUT = '60000';

    const result = loadFromEnv();
    const advanced = result.advanced as Record<string, unknown>;

    expect(advanced.gasMultiplier).toBe(1.5);
    expect(advanced.confirmations).toBe(3);
    expect(advanced.timeout).toBe(60000);
  });

  it('should parse boolean values correctly', () => {
    // Test various truthy values
    process.env.TEMPO_ALLOWLIST_ENABLED = 'true';
    let result = loadFromEnv();
    expect((result.security as Record<string, unknown>).addressAllowlist).toEqual({ enabled: true });

    process.env.TEMPO_ALLOWLIST_ENABLED = '1';
    result = loadFromEnv();
    expect((result.security as Record<string, unknown>).addressAllowlist).toEqual({ enabled: true });

    process.env.TEMPO_ALLOWLIST_ENABLED = 'YES';
    result = loadFromEnv();
    expect((result.security as Record<string, unknown>).addressAllowlist).toEqual({ enabled: true });

    // Test falsy values
    process.env.TEMPO_ALLOWLIST_ENABLED = 'false';
    result = loadFromEnv();
    expect((result.security as Record<string, unknown>).addressAllowlist).toEqual({ enabled: false });

    process.env.TEMPO_ALLOWLIST_ENABLED = 'no';
    result = loadFromEnv();
    expect((result.security as Record<string, unknown>).addressAllowlist).toEqual({ enabled: false });
  });

  it('should handle invalid number values', () => {
    process.env.TEMPO_CHAIN_ID = 'not-a-number';
    process.env.TEMPO_GAS_MULTIPLIER = 'invalid';

    const result = loadFromEnv();

    expect((result.network as Record<string, unknown>).chainId).toBeUndefined();
    expect((result.advanced as Record<string, unknown>).gasMultiplier).toBeUndefined();
  });
});

// =============================================================================
// removeUndefined Tests
// =============================================================================

describe('removeUndefined', () => {
  it('should remove undefined values', () => {
    const input = {
      a: 'value',
      b: undefined,
      c: 123,
    };

    const result = removeUndefined(input);

    expect(result).toEqual({ a: 'value', c: 123 });
    expect('b' in result).toBe(false);
  });

  it('should recursively clean nested objects', () => {
    const input = {
      level1: {
        keep: 'value',
        remove: undefined,
        level2: {
          deepKeep: 'deep',
          deepRemove: undefined,
        },
      },
    };

    const result = removeUndefined(input);

    expect(result).toEqual({
      level1: {
        keep: 'value',
        level2: {
          deepKeep: 'deep',
        },
      },
    });
  });

  it('should remove empty nested objects', () => {
    const input = {
      keep: 'value',
      emptyNested: {
        allUndefined: undefined,
      },
    };

    const result = removeUndefined(input);

    expect(result).toEqual({ keep: 'value' });
    expect('emptyNested' in result).toBe(false);
  });

  it('should preserve arrays', () => {
    const input = {
      arr: [1, 2, 3],
      nested: {
        nestedArr: ['a', 'b'],
      },
    };

    const result = removeUndefined(input);

    expect(result.arr).toEqual([1, 2, 3]);
    expect((result.nested as Record<string, unknown>).nestedArr).toEqual(['a', 'b']);
  });

  it('should preserve null values', () => {
    const input = {
      nullValue: null,
      definedValue: 'test',
    };

    const result = removeUndefined(input);

    expect(result.nullValue).toBeNull();
  });

  it('should handle empty object', () => {
    const result = removeUndefined({});
    expect(result).toEqual({});
  });
});

// =============================================================================
// File Loader Tests
// =============================================================================

describe('loadFromFile', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
    vi.mocked(readFileSync).mockReset();
  });

  it('should return null when no config file exists', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = loadFromFile('/test/path');

    expect(result).toBeNull();
  });

  it('should load YAML config file', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).endsWith('tempo-mcp.config.yaml');
    });
    vi.mocked(readFileSync).mockReturnValue('{"network": {"chainId": 1}}');

    const result = loadFromFile('/test/path');

    expect(result).toEqual({ network: { chainId: 1 } });
  });

  it('should load JSON config file', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).endsWith('tempo-mcp.config.json');
    });
    vi.mocked(readFileSync).mockReturnValue('{"network": {"chainId": 42}}');

    const result = loadFromFile('/test/path');

    expect(result).toEqual({ network: { chainId: 42 } });
  });

  it('should throw on parse error', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('invalid json {{{');

    expect(() => loadFromFile('/test/path')).toThrow('Failed to parse config file');
  });

  it('should prefer yaml over yml over json', () => {
    // Simulate only json exists
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).endsWith('.json');
    });
    vi.mocked(readFileSync).mockReturnValue('{"source": "json"}');

    const result = loadFromFile('/test');

    expect(result).toEqual({ source: 'json' });

    // Now simulate yaml exists
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).endsWith('.yaml');
    });
    vi.mocked(readFileSync).mockReturnValue('{"source": "yaml"}');

    const result2 = loadFromFile('/test');

    expect(result2).toEqual({ source: 'yaml' });
  });
});

describe('findConfigFile', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
  });

  it('should return null when no config exists', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = findConfigFile('/test');

    expect(result).toBeNull();
  });

  it('should return filename when config exists', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).endsWith('tempo-mcp.config.yaml');
    });

    const result = findConfigFile('/test');

    expect(result).toBe('tempo-mcp.config.yaml');
  });
});

// =============================================================================
// Config Loader Integration Tests
// =============================================================================

describe('loadConfig', () => {
  beforeEach(() => {
    resetConfig();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReset();

    // Clear TEMPO_ env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('TEMPO_')) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
  });

  it('should return default config when no sources exist', () => {
    const config = loadConfig();

    expect(config.network.chainId).toBe(42429);
    expect(config.wallet.type).toBe('privateKey');
    expect(config.security.spendingLimits.maxSinglePayment).toEqual({ '*': '1000' });
  });

  it('should merge file config over defaults', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).endsWith('.yaml');
    });
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        network: { chainId: 1 },
        security: {
          spendingLimits: {
            maxSinglePayment: { '*': '500' },
          },
        },
      })
    );

    const config = loadConfig();

    expect(config.network.chainId).toBe(1);
    expect(config.security.spendingLimits.maxSinglePayment['*']).toBe('500');
    // Default values should still be present
    expect(config.network.rpcUrl).toBe('https://rpc.testnet.tempo.xyz');
  });

  it('should merge env config over file config', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).endsWith('.yaml');
    });
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        network: { chainId: 1 },
      })
    );

    process.env.TEMPO_CHAIN_ID = '42';

    const config = loadConfig();

    // Env should override file
    expect(config.network.chainId).toBe(42);
  });

  it('should cache config after first load', () => {
    const config1 = loadConfig();
    const config2 = loadConfig();

    expect(config1).toBe(config2); // Same reference
  });

  it('should throw on invalid config', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).endsWith('.yaml');
    });
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        network: { rpcUrl: 'not-a-valid-url' },
      })
    );

    expect(() => loadConfig()).toThrow('Configuration validation failed');
  });

  it('should include field path in validation error', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).endsWith('.yaml');
    });
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        advanced: { timeout: -1 },
      })
    );

    try {
      loadConfig();
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('advanced.timeout');
    }
  });
});

describe('getConfig', () => {
  beforeEach(() => {
    resetConfig();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    resetConfig();
  });

  it('should load config on first call', () => {
    const config = getConfig();

    expect(config).toBeDefined();
    expect(config.network.chainId).toBe(42429);
  });

  it('should return cached config on subsequent calls', () => {
    const config1 = getConfig();
    const config2 = getConfig();

    expect(config1).toBe(config2);
  });
});

describe('resetConfig', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    resetConfig();
  });

  it('should clear cached config', () => {
    const config1 = getConfig();

    resetConfig();

    const config2 = getConfig();

    // Different instances after reset
    expect(config1).not.toBe(config2);
  });
});

describe('hasConfigFile', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
  });

  it('should return filename if config exists', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).endsWith('.yaml');
    });

    const result = hasConfigFile();

    expect(result).toBe('tempo-mcp.config.yaml');
  });

  it('should return null if no config exists', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = hasConfigFile();

    expect(result).toBeNull();
  });
});

// =============================================================================
// Deep Merge Behavior Tests
// =============================================================================

describe('config deep merge behavior', () => {
  beforeEach(() => {
    resetConfig();
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).endsWith('.yaml');
    });

    // Clear TEMPO_ env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('TEMPO_')) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
  });

  it('should deep merge nested objects', () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        security: {
          spendingLimits: {
            maxSinglePayment: { AlphaUSD: '100', USDC: '200' },
          },
        },
      })
    );

    const config = loadConfig();

    // File values should be present
    expect(config.security.spendingLimits.maxSinglePayment.AlphaUSD).toBe('100');
    expect(config.security.spendingLimits.maxSinglePayment.USDC).toBe('200');
  });

  it('should replace arrays (not merge them)', () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        security: {
          addressAllowlist: {
            addresses: ['0x111', '0x222'],
          },
        },
      })
    );

    const config = loadConfig();

    // Array should be replaced, not merged with default
    expect(config.security.addressAllowlist.addresses).toEqual(['0x111', '0x222']);
  });

  it('should allow env vars to partially override file config', () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        network: {
          chainId: 1,
          rpcUrl: 'https://file.rpc',
        },
      })
    );

    process.env.TEMPO_RPC_URL = 'https://env.rpc';

    const config = loadConfig();

    // chainId from file, rpcUrl from env
    expect(config.network.chainId).toBe(1);
    expect(config.network.rpcUrl).toBe('https://env.rpc');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('edge cases', () => {
  beforeEach(() => {
    resetConfig();
    vi.mocked(existsSync).mockReturnValue(false);

    for (const key of Object.keys(process.env)) {
      if (key.startsWith('TEMPO_')) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
  });

  it('should handle empty env values', () => {
    process.env.TEMPO_PRIVATE_KEY = '';
    process.env.TEMPO_CHAIN_ID = '';

    const result = loadFromEnv();

    // Empty string is still a value for privateKey
    expect((result.wallet as Record<string, unknown>).privateKey).toBe('');
    // Empty string for number should be undefined
    expect((result.network as Record<string, unknown>).chainId).toBeUndefined();
  });

  it('should handle whitespace in env values', () => {
    process.env.TEMPO_RPC_URL = '  https://rpc.url  ';

    const result = loadFromEnv();

    // Note: Values are not trimmed by default
    expect((result.network as Record<string, unknown>).rpcUrl).toBe('  https://rpc.url  ');
  });

  it('should handle very large numbers', () => {
    process.env.TEMPO_TIMEOUT = String(Number.MAX_SAFE_INTEGER);

    const result = loadFromEnv();

    expect((result.advanced as Record<string, unknown>).timeout).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('should handle negative numbers', () => {
    process.env.TEMPO_CHAIN_ID = '-1';

    const result = loadFromEnv();

    expect((result.network as Record<string, unknown>).chainId).toBe(-1);
    // Note: Schema validation will catch this later
  });
});

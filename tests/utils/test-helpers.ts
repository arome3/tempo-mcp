/**
 * Test Helpers
 *
 * Common test utilities, constants, and helper functions used across all tests.
 * Import these in test files to ensure consistent test data and patterns.
 */

// =============================================================================
// Test Addresses
// =============================================================================

/**
 * Standard Ethereum test addresses for various scenarios.
 */
export const TEST_ADDRESSES = {
  /** Valid checksummed address (viem getAddress output) */
  VALID: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  /** Second valid address for transfers */
  VALID_2: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
  /** Third valid address for batch testing */
  VALID_3: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  /** Zero address (burn address) */
  ZERO: '0x0000000000000000000000000000000000000000',
  /** Invalid - contains non-hex characters */
  INVALID: '0xinvalidaddress000000000000000000000000',
  /** Invalid - too short */
  SHORT: '0x742d35',
  /** Invalid - too long */
  LONG: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb1234',
  /** Invalid - missing prefix */
  NO_PREFIX: '742d35cc6634c0532925a3b844bc9e7595f0bebb',
  /** Valid but all lowercase (viem accepts these) */
  LOWERCASE: '0x742d35cc6634c0532925a3b844bc454e4438f44e',
} as const;

// =============================================================================
// Test Tokens
// =============================================================================

/**
 * Test token addresses matching Tempo testnet.
 */
export const TEST_TOKENS = {
  /** AlphaUSD - primary test stablecoin */
  ALPHA_USD: '0x20c0000000000000000000000000000000000001',
  /** PathUSD - quote token for DEX */
  PATH_USD: '0x20c0000000000000000000000000000000000000',
  /** Invalid token address */
  INVALID: '0xinvalid',
  /** Unknown token (valid format, not configured) */
  UNKNOWN: '0x1111111111111111111111111111111111111111',
} as const;

/**
 * Test token symbols.
 */
export const TEST_TOKEN_SYMBOLS = {
  ALPHA_USD: 'AlphaUSD',
  PATH_USD: 'PathUSD',
  UNKNOWN: 'FAKEUSD',
} as const;

// =============================================================================
// Test Transaction Hashes
// =============================================================================

/**
 * Test transaction hashes for various scenarios.
 */
export const TEST_TX_HASHES = {
  /** Valid transaction hash (66 chars with 0x) */
  VALID: ('0x' + 'a'.repeat(64)) as `0x${string}`,
  /** Second valid hash */
  VALID_2: ('0x' + 'b'.repeat(64)) as `0x${string}`,
  /** Invalid - contains non-hex characters */
  INVALID: '0x' + 'z'.repeat(64),
  /** Invalid - too short */
  SHORT: '0xabc123',
  /** Invalid - missing prefix */
  NO_PREFIX: 'a'.repeat(64),
} as const;

// =============================================================================
// Test Amounts
// =============================================================================

/**
 * Test amounts for payment scenarios.
 */
export const TEST_AMOUNTS = {
  /** Small amount under most limits */
  SMALL: '10.00',
  /** Medium amount */
  MEDIUM: '100.00',
  /** Large amount near typical single-payment limits */
  LARGE: '1000.00',
  /** Very large amount likely exceeding limits */
  VERY_LARGE: '100000.00',
  /** Zero amount */
  ZERO: '0',
  /** Negative amount (invalid) */
  NEGATIVE: '-100',
  /** With many decimals */
  MANY_DECIMALS: '100.123456',
  /** Too many decimals for typical stablecoins */
  TOO_MANY_DECIMALS: '100.1234567890123456789',
  /** Scientific notation (invalid for our validation) */
  SCIENTIFIC: '1e18',
  /** Non-numeric (invalid) */
  NON_NUMERIC: 'abc',
  /** Infinity (invalid) */
  INFINITY: 'Infinity',
  /** NaN (invalid) */
  NAN: 'NaN',
} as const;

// =============================================================================
// Test Roles
// =============================================================================

/**
 * Test role names for TIP-20 role management.
 */
export const TEST_ROLES = {
  /** Default admin role - has all permissions */
  DEFAULT_ADMIN: 'DEFAULT_ADMIN_ROLE',
  /** Issuer role - can mint and burn */
  ISSUER: 'ISSUER_ROLE',
  /** Pause role - can pause transfers */
  PAUSE: 'PAUSE_ROLE',
  /** Unpause role - can unpause transfers */
  UNPAUSE: 'UNPAUSE_ROLE',
  /** Burn blocked role - can burn from blocked addresses */
  BURN_BLOCKED: 'BURN_BLOCKED_ROLE',
  /** Invalid role name */
  INVALID: 'INVALID_ROLE',
} as const;

// =============================================================================
// Test Memos
// =============================================================================

/**
 * Test memos for TIP-20 transfers.
 */
export const TEST_MEMOS = {
  /** Valid short memo */
  SHORT: 'INV-001',
  /** Valid memo at exactly 32 bytes */
  EXACT_32: 'a'.repeat(32),
  /** Invalid - exceeds 32 bytes */
  TOO_LONG: 'a'.repeat(33),
  /** Multi-byte UTF-8 characters (each emoji is 4 bytes) */
  EMOJI: '🎉🎉🎉🎉🎉🎉🎉🎉', // 32 bytes = 8 emojis
  /** UTF-8 that exceeds 32 bytes due to multi-byte chars */
  EMOJI_TOO_LONG: '🎉'.repeat(9), // 36 bytes
  /** Empty string (valid - optional) */
  EMPTY: '',
} as const;

// =============================================================================
// Time Utilities
// =============================================================================

/**
 * Wait for a specified number of milliseconds.
 * Useful for testing async operations and timeouts.
 *
 * @param ms - Milliseconds to wait
 */
export async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get today's date as YYYY-MM-DD string.
 * Matches the format used in spending limits.
 */
export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get a date string for N days from today.
 *
 * @param daysFromNow - Number of days from today (can be negative)
 */
export function getDateString(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

/**
 * Create a timestamp for a specific time today.
 *
 * @param hours - Hour of day (0-23)
 * @param minutes - Minutes (0-59)
 * @param seconds - Seconds (0-59)
 */
export function createTodayTimestamp(
  hours: number,
  minutes: number = 0,
  seconds: number = 0
): Date {
  const date = new Date();
  date.setHours(hours, minutes, seconds, 0);
  return date;
}

/**
 * Create a midnight timestamp for testing daily resets.
 *
 * @param daysFromNow - Days from today (0 = today, 1 = tomorrow)
 */
export function createMidnight(daysFromNow: number = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(0, 0, 0, 0);
  return date;
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Assert that a function throws an error with the expected code.
 * Works with TempoMcpError and its subclasses.
 *
 * @param fn - Function that should throw
 * @param expectedCode - Expected error code
 */
export function expectErrorCode(
  fn: () => void,
  expectedCode: number
): void {
  try {
    fn();
    throw new Error(`Expected error with code ${expectedCode}, but no error was thrown`);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error) {
      const errorWithCode = error as Error & { code: number };
      if (errorWithCode.code !== expectedCode) {
        throw new Error(
          `Expected error code ${expectedCode}, got ${errorWithCode.code}`
        );
      }
    } else {
      throw error;
    }
  }
}

/**
 * Assert that an async function throws an error with the expected code.
 *
 * @param fn - Async function that should throw
 * @param expectedCode - Expected error code
 */
export async function expectErrorCodeAsync(
  fn: () => Promise<void>,
  expectedCode: number
): Promise<void> {
  try {
    await fn();
    throw new Error(`Expected error with code ${expectedCode}, but no error was thrown`);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error) {
      const errorWithCode = error as Error & { code: number };
      if (errorWithCode.code !== expectedCode) {
        throw new Error(
          `Expected error code ${expectedCode}, got ${errorWithCode.code}`
        );
      }
    } else {
      throw error;
    }
  }
}

// =============================================================================
// Random Data Generators
// =============================================================================

/**
 * Generate a random valid Ethereum address.
 */
export function randomAddress(): `0x${string}` {
  const chars = '0123456789abcdef';
  let address = '0x';
  for (let i = 0; i < 40; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  return address as `0x${string}`;
}

/**
 * Generate a random valid transaction hash.
 */
export function randomTxHash(): `0x${string}` {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash as `0x${string}`;
}

/**
 * Generate a random request ID for audit logging tests.
 */
export function randomRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// =============================================================================
// Environment Helpers
// =============================================================================

/**
 * Temporarily set environment variables for a test.
 * Returns a cleanup function to restore original values.
 *
 * @param vars - Environment variables to set
 * @returns Cleanup function
 */
export function setEnvVars(vars: Record<string, string>): () => void {
  const original: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(vars)) {
    original[key] = process.env[key];
    process.env[key] = value;
  }

  return () => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

/**
 * Clear all TEMPO_* environment variables.
 * Useful for ensuring clean test state.
 */
export function clearTempoEnvVars(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('TEMPO_')) {
      delete process.env[key];
    }
  }
}

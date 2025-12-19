/**
 * Security Layer Facade Unit Tests
 *
 * Tests for the SecurityLayer class that combines all security components.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SecurityLayer,
  getSecurityLayer,
  resetSecurityLayer,
} from '../../../src/security/index.js';
import { resetSpendingLimitsManager } from '../../../src/security/spending-limits.js';
import { resetRateLimiter } from '../../../src/security/rate-limiter.js';
import { resetAddressAllowlistManager } from '../../../src/security/address-allowlist.js';
import { resetAuditLogger } from '../../../src/security/audit-logger.js';
import { SecurityError } from '../../../src/utils/errors.js';
import {
  setMockConfig,
  resetMockConfig,
  createMockConfig,
  STRICT_SECURITY_CONFIG,
} from '../../utils/mock-config.js';
import { TEST_ADDRESSES } from '../../utils/test-helpers.js';

// =============================================================================
// Mock Configuration and Pino
// =============================================================================

vi.mock('../../../src/config/index.js', async () => {
  const { getMockConfig } = await import('../../utils/mock-config.js');
  return {
    getConfig: () => getMockConfig(),
    loadConfig: () => getMockConfig(),
    resetConfig: vi.fn(),
  };
});

vi.mock('pino', () => {
  const mockPino = vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }));

  (mockPino as unknown as Record<string, unknown>).destination = vi.fn(() => ({
    flushSync: vi.fn(),
  }));

  return {
    pino: mockPino,
    destination: (mockPino as unknown as Record<string, unknown>).destination,
  };
});

vi.mock('fs/promises', () => ({
  stat: vi.fn().mockRejectedValue({ code: 'ENOENT' }),
  rename: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// =============================================================================
// Test Suite
// =============================================================================

describe('SecurityLayer', () => {
  let security: SecurityLayer;

  beforeEach(() => {
    // Reset all security singletons
    resetSecurityLayer();
    resetSpendingLimitsManager();
    resetRateLimiter();
    resetAddressAllowlistManager();
    resetAuditLogger();
    resetMockConfig();

    // Use strict security config for testing
    setMockConfig(STRICT_SECURITY_CONFIG);

    security = new SecurityLayer();
  });

  afterEach(() => {
    resetMockConfig();
  });

  // ===========================================================================
  // validatePayment() Tests
  // ===========================================================================

  describe('validatePayment', () => {
    it('should pass all validations for valid payment', async () => {
      // STRICT_SECURITY_CONFIG has allowlist enabled with VALID and VALID_2
      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '50', // Under limit of 100
        })
      ).resolves.toBeUndefined();
    });

    it('should run all validations in order', async () => {
      // With strict config, we can test that validations run in order
      // by triggering each type of failure

      // 1. General rate limit is first - exhaust it
      const rateLimiter = security.getRateLimiter();
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordRequest('toolCalls');
      }

      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '50',
        })
      ).rejects.toThrow(SecurityError);
    });

    it('should throw on general rate limit exceeded', async () => {
      const rateLimiter = security.getRateLimiter();

      // Exhaust general rate limit (10 in strict config)
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordRequest('toolCalls');
      }

      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '50',
        })
      ).rejects.toThrow(SecurityError);
    });

    it('should throw on high-risk rate limit exceeded', async () => {
      const rateLimiter = security.getRateLimiter();

      // Exhaust high-risk rate limit (5 in strict config)
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest('highRiskOps');
      }

      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '50',
        })
      ).rejects.toThrow(SecurityError);
    });

    it('should throw on address not allowed', async () => {
      // VALID_3 is not in the allowlist
      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID_3 as `0x${string}`,
          amount: '50',
        })
      ).rejects.toThrow(SecurityError);
    });

    it('should throw on spending limit exceeded', async () => {
      // Strict config has maxSinglePayment of 100
      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '150', // Exceeds limit
        })
      ).rejects.toThrow(SecurityError);
    });

    it('should throw on per-recipient rate limit exceeded', async () => {
      const rateLimiter = security.getRateLimiter();

      // Exhaust per-recipient limit (2 in strict config)
      rateLimiter.recordRequest('perRecipient', TEST_ADDRESSES.VALID);
      rateLimiter.recordRequest('perRecipient', TEST_ADDRESSES.VALID);

      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '50',
        })
      ).rejects.toThrow(SecurityError);
    });
  });

  // ===========================================================================
  // recordPayment() Tests
  // ===========================================================================

  describe('recordPayment', () => {
    it('should record spending for token', () => {
      security.recordPayment({
        token: 'AlphaUSD',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '50',
      });

      const spending = security.getSpendingLimits().getTokenSpending('AlphaUSD');
      expect(spending.amount).toBe(50);
    });

    it('should record all rate limit categories', () => {
      security.recordPayment({
        token: 'AlphaUSD',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '50',
      });

      const rateLimiter = security.getRateLimiter();
      expect(rateLimiter.check('toolCalls').currentCount).toBe(1);
      expect(rateLimiter.check('highRiskOps').currentCount).toBe(1);
      expect(rateLimiter.check('perRecipient', TEST_ADDRESSES.VALID).currentCount).toBe(1);
    });
  });

  // ===========================================================================
  // Non-Throwing Check Methods Tests
  // ===========================================================================

  describe('checkSpendingLimits', () => {
    it('should return valid=true for valid params', () => {
      const result = security.checkSpendingLimits({
        token: 'AlphaUSD',
        amount: '50',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return valid=false with errors for invalid params', () => {
      const result = security.checkSpendingLimits({
        token: 'AlphaUSD',
        amount: '150', // Exceeds limit
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('checkAddressAllowlist', () => {
    it('should return valid=true for allowed addresses', () => {
      const result = security.checkAddressAllowlist(TEST_ADDRESSES.VALID);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return valid=false with reason for disallowed addresses', () => {
      const result = security.checkAddressAllowlist(TEST_ADDRESSES.VALID_3);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('checkRateLimit', () => {
    it('should return RateLimitResult', () => {
      const result = security.checkRateLimit('toolCalls');

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(0);
      expect(typeof result.maxCount).toBe('number');
    });

    it('should work with per-recipient key', () => {
      security.getRateLimiter().recordRequest('perRecipient', TEST_ADDRESSES.VALID);

      const result = security.checkRateLimit('perRecipient', TEST_ADDRESSES.VALID);

      expect(result.currentCount).toBe(1);
    });
  });

  // ===========================================================================
  // Audit Logging Methods Tests
  // ===========================================================================

  describe('audit logging', () => {
    it('should log via logSuccess', async () => {
      const entry = await security.logSuccess({
        tool: 'send_payment',
        arguments: { amount: '100' },
        durationMs: 100,
      });

      expect(entry.result).toBe('success');
      expect(entry.tool).toBe('send_payment');
    });

    it('should log via logFailure', async () => {
      const entry = await security.logFailure({
        tool: 'send_payment',
        arguments: { amount: '100' },
        durationMs: 100,
        errorMessage: 'Transaction failed',
      });

      expect(entry.result).toBe('failure');
      expect(entry.errorMessage).toBe('Transaction failed');
    });

    it('should log via logRejected', async () => {
      const entry = await security.logRejected({
        tool: 'send_payment',
        arguments: { amount: '100' },
        durationMs: 5,
        rejectionReason: 'Rate limit exceeded',
      });

      expect(entry.result).toBe('rejected');
      expect(entry.rejectionReason).toBe('Rate limit exceeded');
    });

    it('should retrieve recent logs', async () => {
      await security.logSuccess({
        tool: 'test1',
        arguments: {},
        durationMs: 100,
      });

      await security.logSuccess({
        tool: 'test2',
        arguments: {},
        durationMs: 100,
      });

      const logs = security.getRecentLogs(10);
      expect(logs.length).toBe(2);
    });

    it('should retrieve logs by requestId', async () => {
      const requestId = 'req_test_123';

      await security.log({
        requestId,
        tool: 'test',
        arguments: {},
        result: 'success',
        durationMs: 100,
      });

      const logs = security.getLogsByRequestId(requestId);
      expect(logs.length).toBe(1);
      expect(logs[0].requestId).toBe(requestId);
    });
  });

  // ===========================================================================
  // Accessor Methods Tests
  // ===========================================================================

  describe('accessor methods', () => {
    it('should return spending limits manager', () => {
      const spendingLimits = security.getSpendingLimits();
      expect(spendingLimits).toBeDefined();
      expect(typeof spendingLimits.validate).toBe('function');
    });

    it('should return address allowlist manager', () => {
      const addressAllowlist = security.getAddressAllowlist();
      expect(addressAllowlist).toBeDefined();
      expect(typeof addressAllowlist.check).toBe('function');
    });

    it('should return rate limiter', () => {
      const rateLimiter = security.getRateLimiter();
      expect(rateLimiter).toBeDefined();
      expect(typeof rateLimiter.check).toBe('function');
    });

    it('should return audit logger', () => {
      const auditLogger = security.getAuditLogger();
      expect(auditLogger).toBeDefined();
      expect(typeof auditLogger.log).toBe('function');
    });

    it('should return remaining allowance', () => {
      security.getSpendingLimits().recordSpending('AlphaUSD', '100');

      const allowance = security.getRemainingAllowance('AlphaUSD');

      expect(allowance.tokenRemaining).toBeDefined();
      expect(allowance.totalRemaining).toBeDefined();
    });
  });

  // ===========================================================================
  // Singleton Management
  // ===========================================================================

  describe('singleton management', () => {
    beforeEach(() => {
      resetSecurityLayer();
    });

    it('getSecurityLayer should return same instance', () => {
      const instance1 = getSecurityLayer();
      const instance2 = getSecurityLayer();

      expect(instance1).toBe(instance2);
    });

    it('resetSecurityLayer should clear singleton', () => {
      const instance1 = getSecurityLayer();

      resetSecurityLayer();

      const instance2 = getSecurityLayer();
      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // Integration Scenarios
  // ===========================================================================

  describe('integration scenarios', () => {
    it('should handle full payment flow', async () => {
      // 1. Validate payment
      await security.validatePayment({
        token: 'AlphaUSD',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '50',
      });

      // 2. Record successful payment
      security.recordPayment({
        token: 'AlphaUSD',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '50',
      });

      // 3. Log success
      await security.logSuccess({
        tool: 'send_payment',
        arguments: { token: 'AlphaUSD', to: TEST_ADDRESSES.VALID, amount: '50' },
        durationMs: 1500,
        transactionHash: '0xabc',
      });

      // Verify state
      expect(security.getSpendingLimits().getTotalDailySpending()).toBe(50);
      expect(security.getRateLimiter().check('toolCalls').currentCount).toBe(1);
      expect(security.getRecentLogs(1)[0].result).toBe('success');
    });

    it('should handle rejected payment flow', async () => {
      const startTime = Date.now();

      try {
        // Try to validate with invalid address
        await security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID_3 as `0x${string}`, // Not in allowlist
          amount: '50',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        // Log rejection
        await security.logRejected({
          tool: 'send_payment',
          arguments: { token: 'AlphaUSD', to: TEST_ADDRESSES.VALID_3, amount: '50' },
          durationMs: Date.now() - startTime,
          rejectionReason: (error as Error).message,
        });
      }

      // Verify rejection was logged
      expect(security.getRecentLogs(1)[0].result).toBe('rejected');
    });
  });
});

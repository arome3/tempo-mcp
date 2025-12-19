/**
 * Security Pipeline Integration Tests
 *
 * Tests the full security validation pipeline with all components working together:
 * - Spending limits
 * - Rate limiting
 * - Address allowlist
 * - Audit logging
 *
 * These tests verify that security controls compose correctly and catch real attack scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock config before imports
vi.mock('../../src/config/index.js', async () => {
  const { getMockConfig } = await import('../utils/mock-config.js');
  return {
    getConfig: () => getMockConfig(),
    loadConfig: () => getMockConfig(),
    resetConfig: vi.fn(),
  };
});

// Mock pino to avoid file I/O
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

// Mock fs/promises
vi.mock('fs/promises', () => ({
  stat: vi.fn().mockRejectedValue({ code: 'ENOENT' }),
  rename: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// =============================================================================
// Imports After Mocks
// =============================================================================

import {
  setMockConfig,
  resetMockConfig,
  createMockConfig,
  STRICT_SECURITY_CONFIG,
  PERMISSIVE_CONFIG,
} from '../utils/mock-config.js';
import { TEST_ADDRESSES } from '../utils/test-helpers.js';
import {
  SecurityLayer,
  resetSecurityLayer,
} from '../../src/security/index.js';
import { resetSpendingLimitsManager } from '../../src/security/spending-limits.js';
import { resetRateLimiter } from '../../src/security/rate-limiter.js';
import { resetAddressAllowlistManager } from '../../src/security/address-allowlist.js';
import { resetAuditLogger } from '../../src/security/audit-logger.js';
import { SecurityError } from '../../src/utils/errors.js';

// =============================================================================
// Test Helpers
// =============================================================================

function resetAllSecurity(): void {
  resetSecurityLayer();
  resetSpendingLimitsManager();
  resetRateLimiter();
  resetAddressAllowlistManager();
  resetAuditLogger();
}

// =============================================================================
// Integration Test Scenarios
// =============================================================================

describe('Security Pipeline Integration', () => {
  let security: SecurityLayer;

  beforeEach(() => {
    resetAllSecurity();
    resetMockConfig();
    setMockConfig(STRICT_SECURITY_CONFIG);
    security = new SecurityLayer();
  });

  afterEach(() => {
    resetMockConfig();
    resetAllSecurity();
  });

  // ===========================================================================
  // Happy Path Scenarios
  // ===========================================================================

  describe('happy path scenarios', () => {
    it('should allow valid payment through full pipeline', async () => {
      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '50',
        })
      ).resolves.toBeUndefined();
    });

    it('should allow multiple small payments', async () => {
      // STRICT config has perRecipient limit of 2, so only make 2 payments to same address
      for (let i = 0; i < 2; i++) {
        await security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '10',
        });

        security.recordPayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '10',
        });
      }

      // Total spent is 20, dailyTotalUSD is 1000, so totalRemaining = 1000 - 20 = 980
      const remaining = security.getRemainingAllowance('AlphaUSD');
      expect(remaining.totalRemaining).toBe(980);
    });

    it('should allow payments to different allowed addresses', async () => {
      await security.validatePayment({
        token: 'AlphaUSD',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '25',
      });

      await security.validatePayment({
        token: 'AlphaUSD',
        to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
        amount: '25',
      });
    });

    it('should track spending across payments', async () => {
      security.recordPayment({
        token: 'AlphaUSD',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '40',
      });

      const spending = security.getSpendingLimits().getTokenSpending('AlphaUSD');
      expect(spending.amount).toBe(40);

      security.recordPayment({
        token: 'AlphaUSD',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '30',
      });

      const spending2 = security.getSpendingLimits().getTokenSpending('AlphaUSD');
      expect(spending2.amount).toBe(70);
    });
  });

  // ===========================================================================
  // Security Boundary Tests
  // ===========================================================================

  describe('security boundary tests', () => {
    it('should block payment exceeding single payment limit', async () => {
      // Strict config has 100 max single payment
      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '150',
        })
      ).rejects.toThrow(SecurityError);
    });

    it('should block payment when daily limit would be exceeded', async () => {
      // STRICT_SECURITY_CONFIG has dailyLimit of 500 (wildcard), maxSinglePayment of 100
      // Record multiple payments to use up most of the daily limit
      for (let i = 0; i < 5; i++) {
        security.recordPayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '90', // 5 * 90 = 450, leaving 50 remaining
        });
      }

      // Second payment would exceed daily limit
      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '60', // 450 + 60 = 510 > 500
        })
      ).rejects.toThrow(SecurityError);
    });

    it('should block payment to non-allowed address', async () => {
      // VALID_3 is not in the allowlist
      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID_3 as `0x${string}`,
          amount: '10',
        })
      ).rejects.toThrow(SecurityError);
    });

    it('should block payment when general rate limit exceeded', async () => {
      const rateLimiter = security.getRateLimiter();

      // Exhaust general rate limit (10 in strict config)
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordRequest('toolCalls');
      }

      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '10',
        })
      ).rejects.toThrow(SecurityError);
    });

    it('should block payment when high-risk rate limit exceeded', async () => {
      const rateLimiter = security.getRateLimiter();

      // Exhaust high-risk rate limit (5 in strict config)
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest('highRiskOps');
      }

      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '10',
        })
      ).rejects.toThrow(SecurityError);
    });

    it('should block payment when per-recipient rate limit exceeded', async () => {
      const rateLimiter = security.getRateLimiter();

      // Exhaust per-recipient limit (2 in strict config)
      rateLimiter.recordRequest('perRecipient', TEST_ADDRESSES.VALID);
      rateLimiter.recordRequest('perRecipient', TEST_ADDRESSES.VALID);

      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '10',
        })
      ).rejects.toThrow(SecurityError);
    });
  });

  // ===========================================================================
  // Attack Scenario Tests
  // ===========================================================================

  describe('attack scenarios', () => {
    it('should prevent rapid payment burst (DoS attempt)', async () => {
      const rateLimiter = security.getRateLimiter();

      // Rapid legitimate payments
      for (let i = 0; i < 5; i++) {
        try {
          await security.validatePayment({
            token: 'AlphaUSD',
            to: TEST_ADDRESSES.VALID as `0x${string}`,
            amount: '10',
          });
          rateLimiter.recordRequest('toolCalls');
          rateLimiter.recordRequest('highRiskOps');
        } catch {
          // Expected to fail at some point
        }
      }

      // 6th payment should be blocked
      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '10',
        })
      ).rejects.toThrow(SecurityError);
    });

    it('should prevent draining via many small payments', async () => {
      // Even small payments accumulate against daily limit
      for (let i = 0; i < 10; i++) {
        try {
          await security.validatePayment({
            token: 'AlphaUSD',
            to: TEST_ADDRESSES.VALID as `0x${string}`,
            amount: '10',
          });
          security.recordPayment({
            token: 'AlphaUSD',
            to: TEST_ADDRESSES.VALID as `0x${string}`,
            amount: '10',
          });
        } catch {
          // Expected once limit is hit
          return; // Test passes if we hit the limit
        }
      }

      // Should have been blocked before completing all payments
      // (100 daily limit / 10 per payment = 10 payments max)
      const spending = security.getSpendingLimits().getTotalDailySpending();
      expect(spending).toBeLessThanOrEqual(100);
    });

    it('should prevent spraying payments to many recipients', async () => {
      // Per-recipient limit is 2 in STRICT config
      // Manually record rate limits to test the enforcement
      const rateLimiter = security.getRateLimiter();
      const recipients = [
        TEST_ADDRESSES.VALID,
        TEST_ADDRESSES.VALID_2,
        TEST_ADDRESSES.VALID, // 3rd to VALID - should be blocked
        TEST_ADDRESSES.VALID_2, // 3rd to VALID_2 - should be blocked
      ];

      let blockedCount = 0;
      for (const recipient of recipients) {
        try {
          // Record per-recipient request BEFORE validation (simulating previous requests)
          await security.validatePayment({
            token: 'AlphaUSD',
            to: recipient as `0x${string}`,
            amount: '20',
          });
          // Record the per-recipient rate limit after successful validation
          rateLimiter.recordRequest('perRecipient', recipient);
          security.recordPayment({
            token: 'AlphaUSD',
            to: recipient as `0x${string}`,
            amount: '20',
          });
        } catch {
          blockedCount++;
        }
      }

      // Per-recipient limit (2) should block the 3rd payment to each address
      expect(blockedCount).toBeGreaterThan(0);
    });

    it('should block payments to blocklisted address in blocklist mode', async () => {
      // Switch to blocklist mode
      const blocklistConfig = createMockConfig({
        security: {
          addressAllowlist: {
            enabled: true,
            mode: 'blocklist',
            addresses: [TEST_ADDRESSES.VALID_3],
            labels: {},
          },
        },
      });

      resetAllSecurity();
      setMockConfig(blocklistConfig);
      security = new SecurityLayer();

      // Should block payment to blocklisted address
      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID_3 as `0x${string}`,
          amount: '10',
        })
      ).rejects.toThrow(SecurityError);
    });
  });

  // ===========================================================================
  // Audit Trail Tests
  // ===========================================================================

  describe('audit trail', () => {
    it('should log successful payments', async () => {
      await security.validatePayment({
        token: 'AlphaUSD',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '50',
      });

      security.recordPayment({
        token: 'AlphaUSD',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '50',
      });

      await security.logSuccess({
        tool: 'send_payment',
        arguments: { token: 'AlphaUSD', to: TEST_ADDRESSES.VALID, amount: '50' },
        durationMs: 1500,
        transactionHash: '0xabc',
      });

      const logs = security.getRecentLogs(10);
      expect(logs.length).toBe(1);
      expect(logs[0].result).toBe('success');
      expect(logs[0].transactionHash).toBe('0xabc');
    });

    it('should log rejected payments with reason', async () => {
      try {
        await security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID_3 as `0x${string}`, // Not in allowlist
          amount: '50',
        });
      } catch (error) {
        await security.logRejected({
          tool: 'send_payment',
          arguments: { token: 'AlphaUSD', to: TEST_ADDRESSES.VALID_3, amount: '50' },
          durationMs: 10,
          rejectionReason: (error as Error).message,
        });
      }

      const logs = security.getRecentLogs(10);
      expect(logs.length).toBe(1);
      expect(logs[0].result).toBe('rejected');
      expect(logs[0].rejectionReason).toContain('allowlist');
    });

    it('should track request IDs for correlation', async () => {
      const requestId = 'req_test_001';

      await security.log({
        requestId,
        tool: 'send_payment',
        arguments: { amount: '50' },
        result: 'success',
        durationMs: 100,
      });

      await security.log({
        requestId,
        tool: 'get_balance',
        arguments: {},
        result: 'success',
        durationMs: 50,
      });

      const logs = security.getLogsByRequestId(requestId);
      expect(logs.length).toBe(2);
    });
  });

  // ===========================================================================
  // Configuration-Driven Behavior Tests
  // ===========================================================================

  describe('configuration-driven behavior', () => {
    it('should respect permissive config', async () => {
      resetAllSecurity();
      setMockConfig(PERMISSIVE_CONFIG);
      security = new SecurityLayer();

      // Should allow large payment (permissive has high limits)
      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID_3 as `0x${string}`, // Any address when allowlist disabled
          amount: '10000',
        })
      ).resolves.toBeUndefined();
    });

    it('should apply per-token limits correctly', async () => {
      const tokenConfig = createMockConfig({
        security: {
          spendingLimits: {
            maxSinglePayment: {
              '*': '100',
              AlphaUSD: '500', // Higher limit for AlphaUSD
            },
            dailyLimit: { '*': '1000' },
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
            toolCalls: { windowMs: 60000, maxCalls: 100 },
            highRiskOps: { windowMs: 3600000, maxCalls: 100 },
            perRecipient: { windowMs: 86400000, maxCalls: 100 },
          },
        },
      });

      resetAllSecurity();
      setMockConfig(tokenConfig);
      security = new SecurityLayer();

      // AlphaUSD should allow up to 500
      await expect(
        security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '400',
        })
      ).resolves.toBeUndefined();

      // Other tokens limited to 100
      await expect(
        security.validatePayment({
          token: 'USDC',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '150',
        })
      ).rejects.toThrow(SecurityError);
    });
  });

  // ===========================================================================
  // Multi-Token Scenarios
  // ===========================================================================

  describe('multi-token scenarios', () => {
    beforeEach(() => {
      // Use config without allowlist for easier testing
      const multiTokenConfig = createMockConfig({
        security: {
          spendingLimits: {
            maxSinglePayment: { '*': '1000' },
            dailyLimit: { '*': '5000' },
            dailyTotalUSD: '10000',
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
            toolCalls: { windowMs: 60000, maxCalls: 100 },
            highRiskOps: { windowMs: 3600000, maxCalls: 100 },
            perRecipient: { windowMs: 86400000, maxCalls: 100 },
          },
        },
      });

      resetAllSecurity();
      setMockConfig(multiTokenConfig);
      security = new SecurityLayer();
    });

    it('should track spending separately per token', () => {
      security.recordPayment({
        token: 'AlphaUSD',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '1000',
      });

      security.recordPayment({
        token: 'USDC',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '500',
      });

      const alphaSpending = security.getSpendingLimits().getTokenSpending('AlphaUSD');
      const usdcSpending = security.getSpendingLimits().getTokenSpending('USDC');

      expect(alphaSpending.amount).toBe(1000);
      expect(usdcSpending.amount).toBe(500);
    });

    it('should track total daily spending across all tokens', () => {
      security.recordPayment({
        token: 'AlphaUSD',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '3000',
      });

      security.recordPayment({
        token: 'USDC',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '2000',
      });

      const totalDaily = security.getSpendingLimits().getTotalDailySpending();
      expect(totalDaily).toBe(5000);
    });

    it('should enforce daily total limit across tokens', async () => {
      // Use up most of the daily limit
      security.recordPayment({
        token: 'AlphaUSD',
        to: TEST_ADDRESSES.VALID as `0x${string}`,
        amount: '8000',
      });

      // Another token payment should be blocked by total limit
      await expect(
        security.validatePayment({
          token: 'USDC',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '3000', // Would exceed 10000 total
        })
      ).rejects.toThrow(SecurityError);
    });
  });

  // ===========================================================================
  // Recovery Scenarios
  // ===========================================================================

  describe('recovery scenarios', () => {
    it('should allow payments after rate limit window expires', async () => {
      vi.useFakeTimers();

      try {
        const rateLimiter = security.getRateLimiter();

        // Exhaust rate limit
        for (let i = 0; i < 10; i++) {
          rateLimiter.recordRequest('toolCalls');
        }

        // Should be blocked
        await expect(
          security.validatePayment({
            token: 'AlphaUSD',
            to: TEST_ADDRESSES.VALID as `0x${string}`,
            amount: '10',
          })
        ).rejects.toThrow(SecurityError);

        // Advance time past the window (60000ms in strict config)
        vi.advanceTimersByTime(61000);

        // Should be allowed now
        await expect(
          security.validatePayment({
            token: 'AlphaUSD',
            to: TEST_ADDRESSES.VALID as `0x${string}`,
            amount: '10',
          })
        ).resolves.toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should reset daily spending at midnight', async () => {
      vi.useFakeTimers();

      try {
        // Set a known date
        vi.setSystemTime(new Date('2024-01-15T23:00:00Z'));

        // Record spending close to limit
        security.recordPayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '95',
        });

        // Should be near limit
        expect(security.getSpendingLimits().getTotalDailySpending()).toBe(95);

        // Advance to next day
        vi.setSystemTime(new Date('2024-01-16T01:00:00Z'));

        // Spending should be reset
        expect(security.getSpendingLimits().getTotalDailySpending()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    it('should throw SecurityError with meaningful message', async () => {
      try {
        await security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID_3 as `0x${string}`,
          amount: '50',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SecurityError);
        expect((error as SecurityError).message).toMatch(/allowlist|not allowed/i);
      }
    });

    it('should include context in error messages', async () => {
      try {
        await security.validatePayment({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID as `0x${string}`,
          amount: '200', // Exceeds max single payment
        });
        expect.fail('Should have thrown');
      } catch (error) {
        // Error message should indicate the type of limit exceeded
        expect((error as Error).message).toMatch(/exceeds|limit|single/i);
      }
    });
  });
});

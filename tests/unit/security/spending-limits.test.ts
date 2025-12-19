/**
 * Spending Limits Manager Unit Tests
 *
 * Comprehensive tests for the SpendingLimitsManager class,
 * covering validation, recording, TOCTOU prevention, and daily resets.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SpendingLimitsManager,
  getSpendingLimitsManager,
  resetSpendingLimitsManager,
} from '../../../src/security/spending-limits.js';
import { ValidationError, SecurityError } from '../../../src/utils/errors.js';
import {
  setMockConfig,
  resetMockConfig,
  createMockConfig,
  createSpendingLimitsConfig,
} from '../../utils/mock-config.js';
import { TEST_AMOUNTS } from '../../utils/test-helpers.js';

// =============================================================================
// Mock Configuration Module
// =============================================================================

vi.mock('../../../src/config/index.js', async () => {
  const { getMockConfig, createConfigMock } = await import('../../utils/mock-config.js');
  return {
    getConfig: () => getMockConfig(),
    loadConfig: () => getMockConfig(),
    resetConfig: vi.fn(),
  };
});

// =============================================================================
// Test Suite
// =============================================================================

describe('SpendingLimitsManager', () => {
  let manager: SpendingLimitsManager;

  beforeEach(() => {
    // Reset singleton and mock config before each test
    resetSpendingLimitsManager();
    resetMockConfig();
    manager = new SpendingLimitsManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMockConfig();
  });

  // ===========================================================================
  // Constructor and Initialization
  // ===========================================================================

  describe('constructor', () => {
    it('should initialize with zero spending', () => {
      expect(manager.getTotalDailySpending()).toBe(0);
      expect(manager.getTokenSpending('AlphaUSD').amount).toBe(0);
    });

    it('should initialize with current date', () => {
      const spending = manager.getTokenSpending('AlphaUSD');
      expect(spending.date).toBe(new Date().toISOString().split('T')[0]);
    });
  });

  // ===========================================================================
  // Amount Validation
  // ===========================================================================

  describe('validate - amount validation', () => {
    beforeEach(() => {
      setMockConfig(createSpendingLimitsConfig({
        maxSinglePayment: { '*': '1000' },
        dailyLimit: { '*': '10000' },
      }));
    });

    it('should reject NaN amounts', () => {
      expect(() =>
        manager.validate({ token: 'AlphaUSD', amount: 'NaN' })
      ).toThrow(ValidationError);
    });

    it('should reject Infinity amounts', () => {
      expect(() =>
        manager.validate({ token: 'AlphaUSD', amount: 'Infinity' })
      ).toThrow(ValidationError);
    });

    it('should reject negative Infinity amounts', () => {
      expect(() =>
        manager.validate({ token: 'AlphaUSD', amount: '-Infinity' })
      ).toThrow(ValidationError);
    });

    it('should reject negative amounts', () => {
      expect(() =>
        manager.validate({ token: 'AlphaUSD', amount: '-100' })
      ).toThrow(ValidationError);
    });

    it('should reject zero amounts', () => {
      expect(() =>
        manager.validate({ token: 'AlphaUSD', amount: '0' })
      ).toThrow(ValidationError);
    });

    it('should reject non-numeric strings', () => {
      expect(() =>
        manager.validate({ token: 'AlphaUSD', amount: 'abc' })
      ).toThrow(ValidationError);
    });

    it('should accept valid positive amounts', () => {
      expect(() =>
        manager.validate({ token: 'AlphaUSD', amount: '100' })
      ).not.toThrow();
    });

    it('should accept decimal amounts', () => {
      expect(() =>
        manager.validate({ token: 'AlphaUSD', amount: '100.50' })
      ).not.toThrow();
    });
  });

  // ===========================================================================
  // Per-Transaction Limits
  // ===========================================================================

  describe('validate - per-transaction limits', () => {
    beforeEach(() => {
      setMockConfig(createSpendingLimitsConfig({
        maxSinglePayment: { '*': '100', 'AlphaUSD': '500' },
        dailyLimit: { '*': '10000' },
      }));
    });

    it('should pass when amount is under default limit', () => {
      expect(() =>
        manager.validate({ token: 'UnknownToken', amount: '50' })
      ).not.toThrow();
    });

    it('should reject when amount exceeds default limit', () => {
      expect(() =>
        manager.validate({ token: 'UnknownToken', amount: '150' })
      ).toThrow(SecurityError);
    });

    it('should use token-specific limit when configured', () => {
      // AlphaUSD has limit of 500
      expect(() =>
        manager.validate({ token: 'AlphaUSD', amount: '400' })
      ).not.toThrow();
    });

    it('should reject when token-specific limit exceeded', () => {
      expect(() =>
        manager.validate({ token: 'AlphaUSD', amount: '600' })
      ).toThrow(SecurityError);
    });

    it('should allow exact limit amount', () => {
      expect(() =>
        manager.validate({ token: 'AlphaUSD', amount: '500' })
      ).not.toThrow();
    });
  });

  // ===========================================================================
  // Default to Deny (Unconfigured Tokens)
  // ===========================================================================

  describe('validate - deny-by-default for unconfigured tokens', () => {
    beforeEach(async () => {
      // No wildcard '*' configured - should deny unconfigured tokens
      // Use setMockConfig with full config to REPLACE (not merge) limits
      const { getMockConfig } = await import('../../utils/mock-config.js');
      const baseConfig = getMockConfig();
      setMockConfig({
        ...baseConfig,
        security: {
          ...baseConfig.security,
          spendingLimits: {
            maxSinglePayment: { AlphaUSD: '1000' }, // No '*' wildcard
            dailyLimit: { AlphaUSD: '10000' }, // No '*' wildcard
            dailyTotalUSD: '100000',
            maxBatchSize: 50,
            maxBatchTotalUSD: '25000',
          },
        },
      });
    });

    it('should deny payments for tokens without configured limits', () => {
      expect(() =>
        manager.validate({ token: 'UnknownToken', amount: '1' })
      ).toThrow(SecurityError);
    });

    it('should allow payments for tokens with configured limits', () => {
      expect(() =>
        manager.validate({ token: 'AlphaUSD', amount: '100' })
      ).not.toThrow();
    });
  });

  // ===========================================================================
  // Daily Limits
  // ===========================================================================

  describe('validate - daily limits', () => {
    beforeEach(() => {
      // Use TestToken to avoid AlphaUSD-specific limits from DEFAULT_TEST_CONFIG
      setMockConfig(createSpendingLimitsConfig({
        maxSinglePayment: { '*': '1000' },
        dailyLimit: { '*': '500' },
        dailyTotalUSD: '10000',
      }));
    });

    it('should track cumulative daily spending', () => {
      manager.recordSpending('TestToken', '200');
      manager.recordSpending('TestToken', '200');

      const spending = manager.getTokenSpending('TestToken');
      expect(spending.amount).toBe(400);
      expect(spending.count).toBe(2);
    });

    it('should reject when daily limit exceeded', () => {
      manager.recordSpending('TestToken', '400');

      expect(() =>
        manager.validate({ token: 'TestToken', amount: '200' })
      ).toThrow(SecurityError);
    });

    it('should allow spending up to exact daily limit', () => {
      manager.recordSpending('TestToken', '400');

      expect(() =>
        manager.validate({ token: 'TestToken', amount: '100' })
      ).not.toThrow();
    });

    it('should reject when projected spending exceeds limit', () => {
      manager.recordSpending('TestToken', '450');

      expect(() =>
        manager.validate({ token: 'TestToken', amount: '100' })
      ).toThrow(SecurityError);
    });
  });

  // ===========================================================================
  // Total Daily USD Limit
  // ===========================================================================

  describe('validate - total daily USD limit', () => {
    beforeEach(() => {
      setMockConfig(createSpendingLimitsConfig({
        maxSinglePayment: { '*': '10000' },
        dailyLimit: { '*': '100000' },
        dailyTotalUSD: '1000', // Low total limit
      }));
    });

    it('should track total spending across all tokens', () => {
      manager.recordSpending('AlphaUSD', '300');
      manager.recordSpending('PathUSD', '200');

      expect(manager.getTotalDailySpending()).toBe(500);
    });

    it('should reject when total USD limit exceeded', () => {
      manager.recordSpending('AlphaUSD', '900');

      expect(() =>
        manager.validate({ token: 'PathUSD', amount: '200' })
      ).toThrow(SecurityError);
    });

    it('should allow spending up to exact total limit', () => {
      manager.recordSpending('AlphaUSD', '900');

      expect(() =>
        manager.validate({ token: 'PathUSD', amount: '100' })
      ).not.toThrow();
    });
  });

  // ===========================================================================
  // Batch Payment Validation
  // ===========================================================================

  describe('validate - batch payments', () => {
    beforeEach(() => {
      setMockConfig(createSpendingLimitsConfig({
        maxSinglePayment: { '*': '1000' },
        dailyLimit: { '*': '100000' },
        dailyTotalUSD: '100000',
        maxBatchSize: 10,
        maxBatchTotalUSD: '5000',
      }));
    });

    it('should reject batch without batchTotal parameter', () => {
      expect(() =>
        manager.validate({
          token: 'AlphaUSD',
          amount: '100',
          isBatch: true,
          recipientCount: 5,
          // batchTotal missing
        })
      ).toThrow(SecurityError);
    });

    it('should reject batch exceeding max batch size', () => {
      expect(() =>
        manager.validate({
          token: 'AlphaUSD',
          amount: '100',
          isBatch: true,
          batchTotal: '1000',
          recipientCount: 15, // Exceeds limit of 10
        })
      ).toThrow(SecurityError);
    });

    it('should reject batch exceeding max batch total USD', () => {
      expect(() =>
        manager.validate({
          token: 'AlphaUSD',
          amount: '100',
          isBatch: true,
          batchTotal: '6000', // Exceeds limit of 5000
          recipientCount: 5,
        })
      ).toThrow(SecurityError);
    });

    it('should allow valid batch payments', () => {
      expect(() =>
        manager.validate({
          token: 'AlphaUSD',
          amount: '100',
          isBatch: true,
          batchTotal: '500',
          recipientCount: 5,
        })
      ).not.toThrow();
    });

    it('should validate individual payment amount in batch', () => {
      // Individual payment of 1500 exceeds maxSinglePayment of 1000
      // Use TestToken to avoid AlphaUSD-specific limits (maxSinglePayment: 5000)
      expect(() =>
        manager.validate({
          token: 'TestToken',
          amount: '1500',
          isBatch: true,
          batchTotal: '3000',
          recipientCount: 2,
        })
      ).toThrow(SecurityError);
    });

    it('should reject invalid batchTotal amounts', () => {
      expect(() =>
        manager.validate({
          token: 'AlphaUSD',
          amount: '100',
          isBatch: true,
          batchTotal: '-100',
          recipientCount: 5,
        })
      ).toThrow(ValidationError);
    });
  });

  // ===========================================================================
  // TOCTOU Prevention (validateAndReserve)
  // ===========================================================================

  describe('validateAndReserve - TOCTOU prevention', () => {
    beforeEach(() => {
      // Use TestToken to avoid AlphaUSD-specific limits
      setMockConfig(createSpendingLimitsConfig({
        maxSinglePayment: { '*': '1000' },
        dailyLimit: { '*': '100' },
        dailyTotalUSD: '10000',
      }));
    });

    it('should atomically reserve amount after validation', () => {
      const release = manager.validateAndReserve({
        token: 'TestToken',
        amount: '60',
      });

      expect(manager.getTokenSpending('TestToken').amount).toBe(60);
      expect(manager.getTotalDailySpending()).toBe(60);
      expect(typeof release).toBe('function');
    });

    it('should return release function that undoes reservation', () => {
      const release = manager.validateAndReserve({
        token: 'TestToken',
        amount: '60',
      });

      // Verify reserved
      expect(manager.getTokenSpending('TestToken').amount).toBe(60);

      // Release
      release();

      // Verify released
      expect(manager.getTokenSpending('TestToken').amount).toBe(0);
      expect(manager.getTotalDailySpending()).toBe(0);
    });

    it('should prevent double-release', () => {
      const release = manager.validateAndReserve({
        token: 'TestToken',
        amount: '60',
      });

      release();
      release(); // Second call should be no-op

      expect(manager.getTokenSpending('TestToken').amount).toBe(0);
    });

    it('should prevent concurrent reservations that exceed limit', () => {
      // Reserve 60 of 100 daily limit
      const release1 = manager.validateAndReserve({
        token: 'TestToken',
        amount: '60',
      });

      // Try to reserve another 60 (would exceed 100 limit)
      expect(() =>
        manager.validateAndReserve({
          token: 'TestToken',
          amount: '60',
        })
      ).toThrow(SecurityError);

      // Release first reservation
      release1();

      // Now second reservation should work
      const release2 = manager.validateAndReserve({
        token: 'TestToken',
        amount: '60',
      });
      expect(release2).toBeDefined();
    });

    it('should allow multiple valid reservations', () => {
      const release1 = manager.validateAndReserve({
        token: 'TestToken',
        amount: '30',
      });
      const release2 = manager.validateAndReserve({
        token: 'TestToken',
        amount: '30',
      });

      expect(manager.getTokenSpending('TestToken').amount).toBe(60);

      release1();
      release2();

      expect(manager.getTokenSpending('TestToken').amount).toBe(0);
    });
  });

  // ===========================================================================
  // recordSpending
  // ===========================================================================

  describe('recordSpending', () => {
    beforeEach(() => {
      setMockConfig(createSpendingLimitsConfig());
    });

    it('should update token spending correctly', () => {
      manager.recordSpending('AlphaUSD', '100');

      const spending = manager.getTokenSpending('AlphaUSD');
      expect(spending.amount).toBe(100);
    });

    it('should increment transaction count', () => {
      manager.recordSpending('AlphaUSD', '100');
      manager.recordSpending('AlphaUSD', '50');

      const spending = manager.getTokenSpending('AlphaUSD');
      expect(spending.count).toBe(2);
    });

    it('should update total daily spending', () => {
      manager.recordSpending('AlphaUSD', '100');
      manager.recordSpending('PathUSD', '50');

      expect(manager.getTotalDailySpending()).toBe(150);
    });

    it('should ignore NaN amounts', () => {
      manager.recordSpending('AlphaUSD', 'NaN');

      expect(manager.getTokenSpending('AlphaUSD').amount).toBe(0);
    });

    it('should ignore Infinity amounts', () => {
      manager.recordSpending('AlphaUSD', 'Infinity');

      expect(manager.getTokenSpending('AlphaUSD').amount).toBe(0);
    });

    it('should ignore negative amounts', () => {
      manager.recordSpending('AlphaUSD', '-100');

      expect(manager.getTokenSpending('AlphaUSD').amount).toBe(0);
    });

    it('should ignore zero amounts', () => {
      manager.recordSpending('AlphaUSD', '0');

      expect(manager.getTokenSpending('AlphaUSD').amount).toBe(0);
      expect(manager.getTokenSpending('AlphaUSD').count).toBe(0);
    });
  });

  // ===========================================================================
  // Daily Reset
  // ===========================================================================

  describe('daily reset logic', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      setMockConfig(createSpendingLimitsConfig());
    });

    it('should reset spending at midnight', () => {
      // Set time to 11:59 PM
      vi.setSystemTime(new Date('2024-12-15T23:59:00Z'));
      manager = new SpendingLimitsManager();

      manager.recordSpending('TestToken', '100');
      expect(manager.getTokenSpending('TestToken').amount).toBe(100);

      // Advance to next day (use UTC to avoid timezone issues)
      vi.setSystemTime(new Date('2024-12-16T00:00:01Z'));

      // Getting spending triggers reset check - should return 0 for new day
      const spending = manager.getTokenSpending('TestToken');
      expect(spending.amount).toBe(0);
    });

    it('should preserve spending within same day', () => {
      vi.setSystemTime(new Date('2024-12-15T10:00:00Z'));
      manager = new SpendingLimitsManager();

      manager.recordSpending('TestToken', '100');

      // Later same day
      vi.setSystemTime(new Date('2024-12-15T22:00:00Z'));

      expect(manager.getTokenSpending('TestToken').amount).toBe(100);
    });

    it('should reset all token spending on new day', () => {
      vi.setSystemTime(new Date('2024-12-15T12:00:00Z'));
      manager = new SpendingLimitsManager();

      manager.recordSpending('TokenA', '100');
      manager.recordSpending('TokenB', '50');

      // Next day
      vi.setSystemTime(new Date('2024-12-16T12:00:00Z'));

      expect(manager.getTokenSpending('TokenA').amount).toBe(0);
      expect(manager.getTokenSpending('TokenB').amount).toBe(0);
      expect(manager.getTotalDailySpending()).toBe(0);
    });

    it('should reset total daily spending on new day', () => {
      vi.setSystemTime(new Date('2024-12-15T12:00:00Z'));
      manager = new SpendingLimitsManager();

      manager.recordSpending('TestToken', '100');
      expect(manager.getTotalDailySpending()).toBe(100);

      // Next day
      vi.setSystemTime(new Date('2024-12-16T12:00:00Z'));

      expect(manager.getTotalDailySpending()).toBe(0);
    });
  });

  // ===========================================================================
  // getRemainingAllowance
  // ===========================================================================

  describe('getRemainingAllowance', () => {
    beforeEach(() => {
      setMockConfig(createSpendingLimitsConfig({
        maxSinglePayment: { '*': '1000' },
        dailyLimit: { '*': '500', 'AlphaUSD': '1000' },
        dailyTotalUSD: '2000',
      }));
    });

    it('should return correct remaining token allowance', () => {
      manager.recordSpending('AlphaUSD', '300');

      const allowance = manager.getRemainingAllowance('AlphaUSD');
      expect(allowance.tokenRemaining).toBe(700); // 1000 - 300
    });

    it('should return correct remaining total allowance', () => {
      manager.recordSpending('AlphaUSD', '300');
      manager.recordSpending('PathUSD', '200');

      const allowance = manager.getRemainingAllowance('AlphaUSD');
      expect(allowance.totalRemaining).toBe(1500); // 2000 - 500
    });

    it('should return 0 when limit exhausted', () => {
      manager.recordSpending('AlphaUSD', '1000');

      const allowance = manager.getRemainingAllowance('AlphaUSD');
      expect(allowance.tokenRemaining).toBe(0);
    });

    it('should use wildcard limit for unconfigured tokens', () => {
      manager.recordSpending('UnknownToken', '200');

      const allowance = manager.getRemainingAllowance('UnknownToken');
      expect(allowance.tokenRemaining).toBe(300); // 500 (wildcard) - 200
    });
  });

  // ===========================================================================
  // reset
  // ===========================================================================

  describe('reset', () => {
    beforeEach(() => {
      setMockConfig(createSpendingLimitsConfig());
    });

    it('should clear all token spending', () => {
      manager.recordSpending('AlphaUSD', '100');
      manager.recordSpending('PathUSD', '50');

      manager.reset();

      expect(manager.getTokenSpending('AlphaUSD').amount).toBe(0);
      expect(manager.getTokenSpending('PathUSD').amount).toBe(0);
    });

    it('should clear total daily spending', () => {
      manager.recordSpending('AlphaUSD', '100');

      manager.reset();

      expect(manager.getTotalDailySpending()).toBe(0);
    });
  });

  // ===========================================================================
  // Singleton Management
  // ===========================================================================

  describe('singleton management', () => {
    beforeEach(() => {
      resetSpendingLimitsManager();
      setMockConfig(createSpendingLimitsConfig());
    });

    it('getSpendingLimitsManager should return same instance', () => {
      const instance1 = getSpendingLimitsManager();
      const instance2 = getSpendingLimitsManager();

      expect(instance1).toBe(instance2);
    });

    it('resetSpendingLimitsManager should clear singleton', () => {
      const instance1 = getSpendingLimitsManager();
      instance1.recordSpending('AlphaUSD', '100');

      resetSpendingLimitsManager();

      const instance2 = getSpendingLimitsManager();
      expect(instance2.getTokenSpending('AlphaUSD').amount).toBe(0);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    beforeEach(() => {
      setMockConfig(createSpendingLimitsConfig({
        maxSinglePayment: { '*': '1000' },
        dailyLimit: { '*': '10000' },
      }));
    });

    it('should handle very small amounts', () => {
      expect(() =>
        manager.validate({ token: 'AlphaUSD', amount: '0.000001' })
      ).not.toThrow();
    });

    it('should handle amounts with many decimal places', () => {
      manager.recordSpending('AlphaUSD', '100.123456789');
      expect(manager.getTokenSpending('AlphaUSD').amount).toBeCloseTo(100.123456789);
    });

    it('should handle rapid consecutive validations', () => {
      for (let i = 0; i < 100; i++) {
        expect(() =>
          manager.validate({ token: 'AlphaUSD', amount: '1' })
        ).not.toThrow();
      }
    });

    it('should handle multiple different tokens', () => {
      manager.recordSpending('Token1', '100');
      manager.recordSpending('Token2', '200');
      manager.recordSpending('Token3', '300');

      expect(manager.getTokenSpending('Token1').amount).toBe(100);
      expect(manager.getTokenSpending('Token2').amount).toBe(200);
      expect(manager.getTokenSpending('Token3').amount).toBe(300);
      expect(manager.getTotalDailySpending()).toBe(600);
    });
  });
});

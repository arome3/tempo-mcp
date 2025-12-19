/**
 * Rate Limiter Unit Tests
 *
 * Comprehensive tests for the RateLimiter class,
 * covering sliding window logic, TOCTOU prevention, and memory management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RateLimiter,
  getRateLimiter,
  resetRateLimiter,
  type RateLimitCategory,
} from '../../../src/security/rate-limiter.js';
import { SecurityError } from '../../../src/utils/errors.js';
import {
  setMockConfig,
  resetMockConfig,
  createRateLimitsConfig,
} from '../../utils/mock-config.js';
import { TEST_ADDRESSES } from '../../utils/test-helpers.js';

// =============================================================================
// Mock Configuration Module
// =============================================================================

vi.mock('../../../src/config/index.js', async () => {
  const { getMockConfig } = await import('../../utils/mock-config.js');
  return {
    getConfig: () => getMockConfig(),
    loadConfig: () => getMockConfig(),
    resetConfig: vi.fn(),
  };
});

// =============================================================================
// Test Suite
// =============================================================================

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    resetRateLimiter();
    resetMockConfig();
    limiter = new RateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMockConfig();
  });

  // ===========================================================================
  // check() Method Tests
  // ===========================================================================

  describe('check', () => {
    beforeEach(() => {
      setMockConfig(createRateLimitsConfig({
        toolCalls: { windowMs: 60000, maxCalls: 5 },
        highRiskOps: { windowMs: 3600000, maxCalls: 10 },
        perRecipient: { windowMs: 86400000, maxCalls: 3 },
      }));
    });

    it('should allow first request in window', () => {
      const result = limiter.check('toolCalls');

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(0);
      expect(result.maxCount).toBe(5);
    });

    it('should count requests within sliding window', () => {
      limiter.recordRequest('toolCalls');
      limiter.recordRequest('toolCalls');

      const result = limiter.check('toolCalls');

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(2);
    });

    it('should allow up to maxCalls in window', () => {
      for (let i = 0; i < 4; i++) {
        limiter.recordRequest('toolCalls');
      }

      const result = limiter.check('toolCalls');

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(4);
    });

    it('should disallow when maxCalls exceeded', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordRequest('toolCalls');
      }

      const result = limiter.check('toolCalls');

      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(5);
    });

    it('should calculate correct resetInSeconds', () => {
      vi.setSystemTime(new Date('2024-12-15T12:00:00'));
      limiter.recordRequest('toolCalls');

      // Advance 30 seconds
      vi.setSystemTime(new Date('2024-12-15T12:00:30'));

      const result = limiter.check('toolCalls');

      // Window is 60s, oldest request was 30s ago, so reset in ~30s
      expect(result.resetInSeconds).toBeCloseTo(30, 0);
    });

    it('should calculate retryAfter when rate limited', () => {
      vi.setSystemTime(new Date('2024-12-15T12:00:00'));

      for (let i = 0; i < 5; i++) {
        limiter.recordRequest('toolCalls');
      }

      // Advance 10 seconds
      vi.setSystemTime(new Date('2024-12-15T12:00:10'));

      const result = limiter.check('toolCalls');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should handle per-recipient keys correctly', () => {
      const address1 = TEST_ADDRESSES.VALID;
      const address2 = TEST_ADDRESSES.VALID_2;

      limiter.recordRequest('perRecipient', address1);
      limiter.recordRequest('perRecipient', address1);
      limiter.recordRequest('perRecipient', address2);

      const result1 = limiter.check('perRecipient', address1);
      const result2 = limiter.check('perRecipient', address2);

      expect(result1.currentCount).toBe(2);
      expect(result2.currentCount).toBe(1);
    });

    it('should normalize key to lowercase', () => {
      const upperCase = TEST_ADDRESSES.VALID.toUpperCase();
      const lowerCase = TEST_ADDRESSES.VALID.toLowerCase();

      limiter.recordRequest('perRecipient', upperCase);

      const result = limiter.check('perRecipient', lowerCase);

      expect(result.currentCount).toBe(1);
    });
  });

  // ===========================================================================
  // validate() Method Tests
  // ===========================================================================

  describe('validate', () => {
    beforeEach(() => {
      setMockConfig(createRateLimitsConfig({
        toolCalls: { windowMs: 60000, maxCalls: 3 },
      }));
    });

    it('should not throw when under limit', () => {
      limiter.recordRequest('toolCalls');
      limiter.recordRequest('toolCalls');

      expect(() => limiter.validate('toolCalls')).not.toThrow();
    });

    it('should throw SecurityError when rate limit exceeded', () => {
      for (let i = 0; i < 3; i++) {
        limiter.recordRequest('toolCalls');
      }

      expect(() => limiter.validate('toolCalls')).toThrow(SecurityError);
    });

    it('should include retryAfter in error', () => {
      vi.setSystemTime(new Date('2024-12-15T12:00:00'));

      for (let i = 0; i < 3; i++) {
        limiter.recordRequest('toolCalls');
      }

      try {
        limiter.validate('toolCalls');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SecurityError);
        expect((error as SecurityError).retryAfter).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // Sliding Window Tests
  // ===========================================================================

  describe('sliding window', () => {
    beforeEach(() => {
      setMockConfig(createRateLimitsConfig({
        toolCalls: { windowMs: 60000, maxCalls: 3 },
      }));
    });

    it('should expire old timestamps outside window', () => {
      vi.setSystemTime(new Date('2024-12-15T12:00:00'));

      // Record 3 requests
      for (let i = 0; i < 3; i++) {
        limiter.recordRequest('toolCalls');
      }

      // Verify at limit
      expect(limiter.check('toolCalls').allowed).toBe(false);

      // Advance past window (61 seconds)
      vi.setSystemTime(new Date('2024-12-15T12:01:01'));

      // Should be allowed again
      const result = limiter.check('toolCalls');
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(0);
    });

    it('should allow requests after window slides', () => {
      vi.setSystemTime(new Date('2024-12-15T12:00:00'));

      // Fill up the limit
      for (let i = 0; i < 3; i++) {
        limiter.recordRequest('toolCalls');
      }

      // Advance 30 seconds
      vi.setSystemTime(new Date('2024-12-15T12:00:30'));

      // Still at limit
      expect(limiter.check('toolCalls').allowed).toBe(false);

      // Advance another 31 seconds (total 61s - past first request)
      vi.setSystemTime(new Date('2024-12-15T12:01:01'));

      // Now allowed (all old requests expired)
      expect(limiter.check('toolCalls').allowed).toBe(true);
    });

    it('should handle requests at window boundary', () => {
      vi.setSystemTime(new Date('2024-12-15T12:00:00'));
      limiter.recordRequest('toolCalls');

      // Advance exactly to window boundary
      vi.setSystemTime(new Date('2024-12-15T12:01:00'));

      // Request at exactly windowMs should still be counted
      const result = limiter.check('toolCalls');
      // The request at T=0 expires at T>=60000, so at exactly T=60000 it's still in
      expect(result.currentCount).toBeLessThanOrEqual(1);
    });

    it('should partially expire requests as window slides', () => {
      vi.setSystemTime(new Date('2024-12-15T12:00:00'));
      limiter.recordRequest('toolCalls');

      vi.setSystemTime(new Date('2024-12-15T12:00:30'));
      limiter.recordRequest('toolCalls');

      vi.setSystemTime(new Date('2024-12-15T12:00:50'));
      limiter.recordRequest('toolCalls');

      // At T=50s: all 3 requests in window
      expect(limiter.check('toolCalls').currentCount).toBe(3);

      // Advance to T=65s: first request (T=0) expired
      vi.setSystemTime(new Date('2024-12-15T12:01:05'));
      expect(limiter.check('toolCalls').currentCount).toBe(2);

      // Advance to T=95s: first two requests expired
      vi.setSystemTime(new Date('2024-12-15T12:01:35'));
      expect(limiter.check('toolCalls').currentCount).toBe(1);
    });
  });

  // ===========================================================================
  // checkAndRecordAtomic() - TOCTOU Prevention
  // ===========================================================================

  describe('checkAndRecordAtomic - TOCTOU prevention', () => {
    beforeEach(() => {
      setMockConfig(createRateLimitsConfig({
        toolCalls: { windowMs: 60000, maxCalls: 3 },
      }));
    });

    it('should add timestamp BEFORE checking count', () => {
      // After atomic check-and-record, count should be 1
      limiter.checkAndRecordAtomic('toolCalls');

      const result = limiter.check('toolCalls');
      expect(result.currentCount).toBe(1);
    });

    it('should rollback timestamp if over limit', () => {
      // Fill to limit
      limiter.checkAndRecordAtomic('toolCalls');
      limiter.checkAndRecordAtomic('toolCalls');
      limiter.checkAndRecordAtomic('toolCalls');

      // Fourth should throw and rollback
      expect(() => limiter.checkAndRecordAtomic('toolCalls')).toThrow(
        SecurityError
      );

      // Count should still be 3, not 4
      const result = limiter.check('toolCalls');
      expect(result.currentCount).toBe(3);
    });

    it('should return release function for operation failure', () => {
      const release = limiter.checkAndRecordAtomic('toolCalls');

      expect(typeof release).toBe('function');

      // Before release
      expect(limiter.check('toolCalls').currentCount).toBe(1);

      // After release
      release();
      expect(limiter.check('toolCalls').currentCount).toBe(0);
    });

    it('should prevent double release', () => {
      const release = limiter.checkAndRecordAtomic('toolCalls');

      release();
      release(); // Should be no-op

      expect(limiter.check('toolCalls').currentCount).toBe(0);
    });

    it('should calculate correct retryAfter on rejection', () => {
      vi.setSystemTime(new Date('2024-12-15T12:00:00'));

      // Fill to limit
      for (let i = 0; i < 3; i++) {
        limiter.checkAndRecordAtomic('toolCalls');
      }

      // Advance 10 seconds
      vi.setSystemTime(new Date('2024-12-15T12:00:10'));

      try {
        limiter.checkAndRecordAtomic('toolCalls');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SecurityError);
        // retryAfter should be ~50s (60s window - 10s elapsed)
        expect((error as SecurityError).retryAfter).toBeGreaterThan(40);
      }
    });

    it('should handle concurrent atomic operations correctly', () => {
      // Simulate concurrent operations by rapid calls
      const releases: Array<() => void> = [];

      // All three should succeed
      releases.push(limiter.checkAndRecordAtomic('toolCalls'));
      releases.push(limiter.checkAndRecordAtomic('toolCalls'));
      releases.push(limiter.checkAndRecordAtomic('toolCalls'));

      // Fourth should fail
      expect(() => limiter.checkAndRecordAtomic('toolCalls')).toThrow();

      // Release one
      releases[0]();

      // Now should be able to add another
      const release4 = limiter.checkAndRecordAtomic('toolCalls');
      expect(release4).toBeDefined();
    });
  });

  // ===========================================================================
  // Memory Management Tests
  // ===========================================================================

  describe('memory management', () => {
    beforeEach(() => {
      setMockConfig(createRateLimitsConfig({
        toolCalls: { windowMs: 60000, maxCalls: 10000 },
      }));
    });

    it('should enforce MAX_TIMESTAMPS_PER_KEY limit', () => {
      // The MAX_TIMESTAMPS_PER_KEY is 1000 in the implementation
      // Record many requests
      for (let i = 0; i < 1500; i++) {
        limiter.recordRequest('toolCalls');
      }

      // Check that it still works (doesn't crash)
      const result = limiter.check('toolCalls');
      // Should be capped at MAX_TIMESTAMPS_PER_KEY
      expect(result.currentCount).toBeLessThanOrEqual(1000);
    });

    it('should cleanup empty records', () => {
      vi.setSystemTime(new Date('2024-12-15T12:00:00'));
      limiter.recordRequest('toolCalls');

      // Advance past window to expire all timestamps
      vi.setSystemTime(new Date('2024-12-15T12:02:00'));

      // Trigger cleanup by checking
      limiter.check('toolCalls');

      // After cleanup, count should be 0
      expect(limiter.check('toolCalls').currentCount).toBe(0);
    });

    it('should run cleanup periodically', () => {
      // The CLEANUP_INTERVAL is 100 in the implementation
      // After 100 operations, cleanup should run
      for (let i = 0; i < 150; i++) {
        limiter.check('toolCalls');
      }

      // This shouldn't throw - cleanup ran successfully
      expect(() => limiter.check('toolCalls')).not.toThrow();
    });
  });

  // ===========================================================================
  // Category-Specific Tests
  // ===========================================================================

  describe('rate limit categories', () => {
    beforeEach(() => {
      setMockConfig(createRateLimitsConfig({
        toolCalls: { windowMs: 60000, maxCalls: 5 },
        highRiskOps: { windowMs: 3600000, maxCalls: 10 },
        perRecipient: { windowMs: 86400000, maxCalls: 3 },
      }));
    });

    it('should apply toolCalls limits correctly', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordRequest('toolCalls');
      }

      expect(limiter.check('toolCalls').allowed).toBe(false);
      expect(limiter.check('toolCalls').maxCount).toBe(5);
    });

    it('should apply highRiskOps limits correctly', () => {
      for (let i = 0; i < 10; i++) {
        limiter.recordRequest('highRiskOps');
      }

      expect(limiter.check('highRiskOps').allowed).toBe(false);
      expect(limiter.check('highRiskOps').maxCount).toBe(10);
    });

    it('should apply perRecipient limits correctly', () => {
      const address = TEST_ADDRESSES.VALID;

      for (let i = 0; i < 3; i++) {
        limiter.recordRequest('perRecipient', address);
      }

      expect(limiter.check('perRecipient', address).allowed).toBe(false);
      expect(limiter.check('perRecipient', address).maxCount).toBe(3);
    });

    it('should track categories independently', () => {
      // Fill toolCalls
      for (let i = 0; i < 5; i++) {
        limiter.recordRequest('toolCalls');
      }

      // highRiskOps should still be allowed
      expect(limiter.check('toolCalls').allowed).toBe(false);
      expect(limiter.check('highRiskOps').allowed).toBe(true);
    });

    it('should track different recipients independently', () => {
      const address1 = TEST_ADDRESSES.VALID;
      const address2 = TEST_ADDRESSES.VALID_2;

      // Fill limit for address1
      for (let i = 0; i < 3; i++) {
        limiter.recordRequest('perRecipient', address1);
      }

      // address1 blocked, address2 still allowed
      expect(limiter.check('perRecipient', address1).allowed).toBe(false);
      expect(limiter.check('perRecipient', address2).allowed).toBe(true);
    });
  });

  // ===========================================================================
  // getStats() Tests
  // ===========================================================================

  describe('getStats', () => {
    beforeEach(() => {
      setMockConfig(createRateLimitsConfig({
        toolCalls: { windowMs: 60000, maxCalls: 10 },
      }));
    });

    it('should return correct stats for category', () => {
      limiter.recordRequest('toolCalls');
      limiter.recordRequest('toolCalls');

      const stats = limiter.getStats('toolCalls');

      expect(stats.currentCount).toBe(2);
      expect(stats.maxCount).toBe(10);
      expect(stats.windowMs).toBe(60000);
      expect(stats.remainingRequests).toBe(8);
    });

    it('should return 0 remaining when limit reached', () => {
      for (let i = 0; i < 10; i++) {
        limiter.recordRequest('toolCalls');
      }

      const stats = limiter.getStats('toolCalls');

      expect(stats.remainingRequests).toBe(0);
    });
  });

  // ===========================================================================
  // reset() Tests
  // ===========================================================================

  describe('reset', () => {
    beforeEach(() => {
      setMockConfig(createRateLimitsConfig({
        toolCalls: { windowMs: 60000, maxCalls: 10 },
        highRiskOps: { windowMs: 3600000, maxCalls: 10 },
      }));
    });

    it('should reset all categories when called without arguments', () => {
      limiter.recordRequest('toolCalls');
      limiter.recordRequest('highRiskOps');

      limiter.reset();

      expect(limiter.check('toolCalls').currentCount).toBe(0);
      expect(limiter.check('highRiskOps').currentCount).toBe(0);
    });

    it('should reset specific category when provided', () => {
      limiter.recordRequest('toolCalls');
      limiter.recordRequest('highRiskOps');

      limiter.reset('toolCalls');

      expect(limiter.check('toolCalls').currentCount).toBe(0);
      expect(limiter.check('highRiskOps').currentCount).toBe(1);
    });

    it('should reset specific key within category', () => {
      const address1 = TEST_ADDRESSES.VALID;
      const address2 = TEST_ADDRESSES.VALID_2;

      limiter.recordRequest('perRecipient', address1);
      limiter.recordRequest('perRecipient', address2);

      limiter.reset('perRecipient', address1);

      expect(limiter.check('perRecipient', address1).currentCount).toBe(0);
      expect(limiter.check('perRecipient', address2).currentCount).toBe(1);
    });
  });

  // ===========================================================================
  // Singleton Management
  // ===========================================================================

  describe('singleton management', () => {
    beforeEach(() => {
      resetRateLimiter();
      setMockConfig(createRateLimitsConfig());
    });

    it('getRateLimiter should return same instance', () => {
      const instance1 = getRateLimiter();
      const instance2 = getRateLimiter();

      expect(instance1).toBe(instance2);
    });

    it('resetRateLimiter should clear singleton', () => {
      const instance1 = getRateLimiter();
      instance1.recordRequest('toolCalls');

      resetRateLimiter();

      const instance2 = getRateLimiter();
      expect(instance2.check('toolCalls').currentCount).toBe(0);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    beforeEach(() => {
      setMockConfig(createRateLimitsConfig({
        toolCalls: { windowMs: 60000, maxCalls: 5 },
      }));
    });

    it('should handle very rapid requests', () => {
      for (let i = 0; i < 100; i++) {
        if (limiter.check('toolCalls').allowed) {
          limiter.recordRequest('toolCalls');
        }
      }

      // Should have recorded exactly maxCalls
      expect(limiter.check('toolCalls').currentCount).toBe(5);
    });

    it('should handle empty key string', () => {
      limiter.recordRequest('perRecipient', '');
      expect(limiter.check('perRecipient', '').currentCount).toBe(1);
    });

    it('should handle very long key strings', () => {
      const longKey = 'a'.repeat(1000);
      limiter.recordRequest('perRecipient', longKey);
      expect(limiter.check('perRecipient', longKey).currentCount).toBe(1);
    });
  });
});

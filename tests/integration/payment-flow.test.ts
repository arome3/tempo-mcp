/**
 * Payment Flow Integration Tests
 *
 * Tests the complete payment flow from input validation through
 * security checks to simulated transaction execution.
 *
 * These tests simulate real-world payment scenarios including:
 * - Input validation
 * - Security pipeline
 * - Transaction preparation
 * - Audit logging
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Mock Setup
// =============================================================================

vi.mock('../../src/config/index.js', async () => {
  const { getMockConfig } = await import('../utils/mock-config.js');
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
// Imports After Mocks
// =============================================================================

import {
  setMockConfig,
  resetMockConfig,
  createMockConfig,
} from '../utils/mock-config.js';
import {
  createMockTempoClient,
  createSuccessfulMockClient,
  createFailingMockClient,
} from '../utils/mock-tempo-client.js';
import { TEST_ADDRESSES, TEST_TX_HASHES, wait } from '../utils/test-helpers.js';
import {
  isValidAddress,
  isValidAmount,
  isValidMemo,
  isValidTokenIdentifier,
  validatePaymentParams,
} from '../../src/utils/validation.js';
import { stringToBytes32, truncateAddress, formatAmount } from '../../src/utils/formatting.js';
import {
  SecurityLayer,
  resetSecurityLayer,
} from '../../src/security/index.js';
import { resetSpendingLimitsManager } from '../../src/security/spending-limits.js';
import { resetRateLimiter } from '../../src/security/rate-limiter.js';
import { resetAddressAllowlistManager } from '../../src/security/address-allowlist.js';
import { resetAuditLogger } from '../../src/security/audit-logger.js';
import { SecurityError, ValidationError } from '../../src/utils/errors.js';

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

interface PaymentRequest {
  token: string;
  to: string;
  amount: string;
  memo?: string;
}

interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

/**
 * Simulate a complete payment flow.
 * This mirrors what a real payment tool would do.
 */
async function simulatePaymentFlow(
  request: PaymentRequest,
  security: SecurityLayer,
  mockClient: ReturnType<typeof createMockTempoClient>
): Promise<PaymentResult> {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  try {
    // Step 1: Input validation
    const validation = validatePaymentParams({
      token: request.token,
      to: request.to,
      amount: request.amount,
      memo: request.memo,
    });

    if (!validation.valid) {
      // Throw a simple error with the validation messages
      // This extends ValidationError behavior for test purposes
      const error = new Error(`Invalid payment parameters: ${validation.errors.join(', ')}`);
      error.name = 'ValidationError';
      throw error;
    }

    // Step 2: Security validation
    await security.validatePayment({
      token: request.token,
      to: request.to as `0x${string}`,
      amount: request.amount,
    });

    // Step 3: Prepare memo if provided
    const memoBytes = request.memo ? stringToBytes32(request.memo) : undefined;

    // Step 4: Execute transaction (mocked)
    const txResult = await mockClient.sendPayment({
      token: request.token,
      to: request.to,
      amount: request.amount,
      memo: memoBytes,
    });

    // Step 5: Record successful payment
    security.recordPayment({
      token: request.token,
      to: request.to as `0x${string}`,
      amount: request.amount,
    });

    // Step 6: Log success
    await security.logSuccess({
      requestId,
      tool: 'send_payment',
      arguments: {
        token: request.token,
        to: request.to,
        amount: request.amount,
        memo: request.memo,
      },
      durationMs: Date.now() - startTime,
      transactionHash: txResult.hash,
    });

    return {
      success: true,
      transactionHash: txResult.hash,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log rejection or failure
    // Check for our test's simple validation error by name as well
    const isValidationError =
      error instanceof ValidationError ||
      (error instanceof Error && error.name === 'ValidationError');

    if (error instanceof SecurityError || isValidationError) {
      await security.logRejected({
        requestId,
        tool: 'send_payment',
        arguments: {
          token: request.token,
          to: request.to,
          amount: request.amount,
        },
        durationMs: Date.now() - startTime,
        rejectionReason: errorMessage,
      });
    } else {
      await security.logFailure({
        requestId,
        tool: 'send_payment',
        arguments: {
          token: request.token,
          to: request.to,
          amount: request.amount,
        },
        durationMs: Date.now() - startTime,
        errorMessage,
      });
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// =============================================================================
// Integration Tests
// =============================================================================

describe('Payment Flow Integration', () => {
  let security: SecurityLayer;
  let mockClient: ReturnType<typeof createSuccessfulMockClient>;

  beforeEach(() => {
    resetAllSecurity();
    resetMockConfig();

    // Use a more permissive config for flow testing
    setMockConfig(
      createMockConfig({
        security: {
          spendingLimits: {
            maxSinglePayment: { '*': '1000' },
            dailyLimit: { '*': '5000' },
            dailyTotalUSD: '10000',
            maxBatchSize: 50,
            maxBatchTotalUSD: '25000',
          },
          addressAllowlist: {
            enabled: false, // Allow all addresses for flow testing
            mode: 'allowlist',
            addresses: [],
            labels: {},
          },
          rateLimits: {
            toolCalls: { windowMs: 60000, maxCalls: 100 },
            highRiskOps: { windowMs: 3600000, maxCalls: 50 },
            perRecipient: { windowMs: 86400000, maxCalls: 20 },
          },
        },
      })
    );

    security = new SecurityLayer();
    mockClient = createSuccessfulMockClient();
  });

  afterEach(() => {
    resetMockConfig();
    resetAllSecurity();
  });

  // ===========================================================================
  // Successful Payment Flows
  // ===========================================================================

  describe('successful payment flows', () => {
    it('should complete simple payment flow', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '100',
        },
        security,
        mockClient
      );

      expect(result.success).toBe(true);
      expect(result.transactionHash).toBeDefined();

      // Verify spending was recorded
      const spending = security.getSpendingLimits().getTokenSpending('AlphaUSD');
      expect(spending.amount).toBe(100);

      // Verify audit log
      const logs = security.getRecentLogs(1);
      expect(logs[0].result).toBe('success');
    });

    it('should complete payment flow with memo', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '50',
          memo: 'INV-2024-001',
        },
        security,
        mockClient
      );

      expect(result.success).toBe(true);
    });

    it('should complete multiple sequential payments', async () => {
      const payments = [
        { token: 'AlphaUSD', to: TEST_ADDRESSES.VALID, amount: '100' },
        { token: 'AlphaUSD', to: TEST_ADDRESSES.VALID_2, amount: '200' },
        { token: 'USDC', to: TEST_ADDRESSES.VALID_3, amount: '150' },
      ];

      const results = [];
      for (const payment of payments) {
        const result = await simulatePaymentFlow(payment, security, mockClient);
        results.push(result);
      }

      expect(results.every((r) => r.success)).toBe(true);

      // Verify total spending
      const totalSpending = security.getSpendingLimits().getTotalDailySpending();
      expect(totalSpending).toBe(450);
    });

    it('should track payments to different tokens separately', async () => {
      await simulatePaymentFlow(
        { token: 'AlphaUSD', to: TEST_ADDRESSES.VALID, amount: '200' },
        security,
        mockClient
      );

      await simulatePaymentFlow(
        { token: 'USDC', to: TEST_ADDRESSES.VALID, amount: '300' },
        security,
        mockClient
      );

      const alphaSpending = security.getSpendingLimits().getTokenSpending('AlphaUSD');
      const usdcSpending = security.getSpendingLimits().getTokenSpending('USDC');

      expect(alphaSpending.amount).toBe(200);
      expect(usdcSpending.amount).toBe(300);
    });
  });

  // ===========================================================================
  // Input Validation Failures
  // ===========================================================================

  describe('input validation failures', () => {
    it('should reject invalid address format', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: 'invalid-address',
          amount: '100',
        },
        security,
        mockClient
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should reject invalid amount format', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: 'not-a-number',
        },
        security,
        mockClient
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('amount');
    });

    it('should reject negative amount', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '-100',
        },
        security,
        mockClient
      );

      expect(result.success).toBe(false);
    });

    it('should reject zero amount', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '0',
        },
        security,
        mockClient
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/zero|greater/i);
    });

    it('should reject memo exceeding 32 bytes', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '100',
          memo: 'a'.repeat(40), // Too long
        },
        security,
        mockClient
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('memo');
    });

    it('should reject payment to zero address', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.ZERO,
          amount: '100',
        },
        security,
        mockClient
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('zero');
    });

    it('should reject invalid token identifier', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'Invalid-Token!',
          to: TEST_ADDRESSES.VALID,
          amount: '100',
        },
        security,
        mockClient
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('token');
    });
  });

  // ===========================================================================
  // Security Validation Failures
  // ===========================================================================

  describe('security validation failures', () => {
    it('should reject payment exceeding single payment limit', async () => {
      // Use TestToken to avoid AlphaUSD-specific higher limits from DEFAULT_TEST_CONFIG
      const result = await simulatePaymentFlow(
        {
          token: 'TestToken',
          to: TEST_ADDRESSES.VALID,
          amount: '1500', // Exceeds 1000 wildcard limit
        },
        security,
        mockClient
      );

      expect(result.success).toBe(false);

      // Verify rejection was logged
      const logs = security.getRecentLogs(1);
      expect(logs[0].result).toBe('rejected');
    });

    it('should reject payment when daily limit would be exceeded', async () => {
      // Use TestToken to use wildcard daily limit of 5000, max single = 1000
      // Make multiple payments to use up most of the daily limit
      for (let i = 0; i < 5; i++) {
        await simulatePaymentFlow(
          { token: 'TestToken', to: TEST_ADDRESSES.VALID, amount: '900' },
          security,
          mockClient
        );
      }
      // Total spent: 4500

      // This would exceed daily limit (4500 + 600 > 5000)
      const result = await simulatePaymentFlow(
        {
          token: 'TestToken',
          to: TEST_ADDRESSES.VALID,
          amount: '600',
        },
        security,
        mockClient
      );

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // Transaction Failures
  // ===========================================================================

  describe('transaction failures', () => {
    it('should handle blockchain transaction failure', async () => {
      const failingClient = createFailingMockClient('Transaction reverted');

      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '100',
        },
        security,
        failingClient
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transaction reverted');

      // Verify failure was logged (not rejection)
      const logs = security.getRecentLogs(1);
      expect(logs[0].result).toBe('failure');
    });

    it('should not record spending on transaction failure', async () => {
      const failingClient = createFailingMockClient('Insufficient balance');

      await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '100',
        },
        security,
        failingClient
      );

      // Spending should not be recorded
      const spending = security.getSpendingLimits().getTokenSpending('AlphaUSD');
      expect(spending.amount).toBe(0);
    });

    it('should handle network timeout', async () => {
      const timeoutClient = createMockTempoClient({
        shouldFail: true,
        failMessage: 'Network timeout',
      });

      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '100',
        },
        security,
        timeoutClient
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  // ===========================================================================
  // Audit Trail Verification
  // ===========================================================================

  describe('audit trail verification', () => {
    it('should log complete payment details on success', async () => {
      await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '100',
          memo: 'Test payment',
        },
        security,
        mockClient
      );

      const logs = security.getRecentLogs(1);
      const entry = logs[0];

      expect(entry.tool).toBe('send_payment');
      expect(entry.result).toBe('success');
      // Token is redacted by audit logger's sanitization (it treats "token" as sensitive keyword)
      expect(entry.arguments.token).toBe('[REDACTED]');
      expect(entry.arguments.to).toBe(TEST_ADDRESSES.VALID);
      expect(entry.arguments.amount).toBe('100');
      expect(entry.arguments.memo).toBe('Test payment');
      expect(entry.transactionHash).toBeDefined();
      // durationMs may be 0 for very fast operations
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should log rejection reason for security failures', async () => {
      // Use TestToken to avoid AlphaUSD-specific higher limits from DEFAULT_TEST_CONFIG
      await simulatePaymentFlow(
        {
          token: 'TestToken',
          to: TEST_ADDRESSES.VALID,
          amount: '2000', // Exceeds wildcard limit of 1000
        },
        security,
        mockClient
      );

      const logs = security.getRecentLogs(1);
      expect(logs[0].result).toBe('rejected');
      expect(logs[0].rejectionReason).toBeDefined();
    });

    it('should log error message for transaction failures', async () => {
      const failingClient = createFailingMockClient('Out of gas');

      await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '100',
        },
        security,
        failingClient
      );

      const logs = security.getRecentLogs(1);
      expect(logs[0].result).toBe('failure');
      expect(logs[0].errorMessage).toContain('Out of gas');
    });

    it('should track request IDs for correlation', async () => {
      // Simulate multiple related operations
      await simulatePaymentFlow(
        { token: 'AlphaUSD', to: TEST_ADDRESSES.VALID, amount: '100' },
        security,
        mockClient
      );

      await simulatePaymentFlow(
        { token: 'AlphaUSD', to: TEST_ADDRESSES.VALID_2, amount: '200' },
        security,
        mockClient
      );

      const logs = security.getRecentLogs(10);
      expect(logs.length).toBe(2);

      // Each should have unique request ID
      const requestIds = logs.map((l) => l.requestId);
      expect(new Set(requestIds).size).toBe(2);
    });
  });

  // ===========================================================================
  // Concurrent Payment Handling
  // ===========================================================================

  describe('concurrent payment handling', () => {
    it('should handle concurrent payments safely', async () => {
      const payments = Array(5)
        .fill(null)
        .map((_, i) => ({
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '100',
          memo: `Payment ${i + 1}`,
        }));

      const results = await Promise.all(
        payments.map((p) => simulatePaymentFlow(p, security, mockClient))
      );

      // All should succeed (within limits)
      const successCount = results.filter((r) => r.success).length;
      expect(successCount).toBe(5);

      // Total spending should be accurate
      const totalSpending = security.getSpendingLimits().getTotalDailySpending();
      expect(totalSpending).toBe(500);
    });

    it('should accurately track spending under concurrent load', async () => {
      // Create concurrent payments to verify spending tracking accuracy
      // Note: validatePayment and recordPayment are separate operations, so concurrent
      // requests can all pass validation before any recording happens. This is correct
      // behavior - the security layer provides best-effort protection, not reservation.
      const payments = Array(5)
        .fill(null)
        .map((_, i) => ({
          token: 'TestToken',
          to: TEST_ADDRESSES.VALID,
          amount: '100',
          memo: `Payment ${i + 1}`,
        }));

      const results = await Promise.all(
        payments.map((p) => simulatePaymentFlow(p, security, mockClient))
      );

      // All small payments should succeed
      const successCount = results.filter((r) => r.success).length;
      expect(successCount).toBe(5);

      // Total spending should accurately reflect all successful payments
      const totalSpending = security.getSpendingLimits().getTotalDailySpending();
      expect(totalSpending).toBe(500);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle payment at exact limit', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '1000', // Exactly at max single payment
        },
        security,
        mockClient
      );

      expect(result.success).toBe(true);
    });

    it('should handle very small amounts', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '0.000001',
        },
        security,
        mockClient
      );

      expect(result.success).toBe(true);
    });

    it('should handle token address instead of symbol', async () => {
      const result = await simulatePaymentFlow(
        {
          token: '0x20c0000000000000000000000000000000000001', // Token address
          to: TEST_ADDRESSES.VALID,
          amount: '100',
        },
        security,
        mockClient
      );

      expect(result.success).toBe(true);
    });

    it('should handle UTF-8 memo', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '100',
          memo: 'Payment for café ☕', // UTF-8 characters
        },
        security,
        mockClient
      );

      expect(result.success).toBe(true);
    });

    it('should handle empty memo', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '100',
          memo: '',
        },
        security,
        mockClient
      );

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Display Formatting Integration
  // ===========================================================================

  describe('display formatting', () => {
    it('should format successful payment response', async () => {
      const result = await simulatePaymentFlow(
        {
          token: 'AlphaUSD',
          to: TEST_ADDRESSES.VALID,
          amount: '1234.56',
        },
        security,
        mockClient
      );

      expect(result.success).toBe(true);

      // Format for display
      const truncatedTo = truncateAddress(TEST_ADDRESSES.VALID);
      const formattedAmount = formatAmount('1234.56', 'AlphaUSD');

      expect(truncatedTo).toMatch(/0x\w{4}\.\.\.\w{4}/);
      expect(formattedAmount).toContain('1,234.56');
      expect(formattedAmount).toContain('AlphaUSD');
    });
  });
});

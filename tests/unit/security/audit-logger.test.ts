/**
 * Audit Logger Unit Tests
 *
 * Comprehensive tests for the AuditLogger class,
 * covering logging, sanitization, queries, and buffer management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AuditLogger,
  getAuditLogger,
  resetAuditLogger,
  type AuditLogEntry,
} from '../../../src/security/audit-logger.js';
import {
  setMockConfig,
  resetMockConfig,
  createMockConfig,
} from '../../utils/mock-config.js';
import { TEST_TX_HASHES, randomRequestId } from '../../utils/test-helpers.js';

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

// Mock Pino to avoid file I/O in tests
vi.mock('pino', () => {
  const mockPino = vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }));

  // pino.destination() is called on the pino function itself
  (mockPino as unknown as Record<string, unknown>).destination = vi.fn(() => ({
    flushSync: vi.fn(),
  }));

  return {
    pino: mockPino,
    destination: (mockPino as unknown as Record<string, unknown>).destination,
  };
});

// Mock fs/promises to avoid actual file operations
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

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    resetAuditLogger();
    resetMockConfig();
    setMockConfig(createMockConfig({
      logging: {
        level: 'info',
        auditLog: {
          enabled: true,
          path: './logs/audit.jsonl',
          rotationDays: 30,
        },
      },
    }));
    logger = new AuditLogger();
  });

  afterEach(async () => {
    await logger.close();
    resetMockConfig();
  });

  // ===========================================================================
  // log() Method Tests
  // ===========================================================================

  describe('log', () => {
    it('should create entry with unique ID', async () => {
      const entry1 = await logger.log({
        tool: 'send_payment',
        arguments: { amount: '100' },
        result: 'success',
        durationMs: 100,
      });

      const entry2 = await logger.log({
        tool: 'send_payment',
        arguments: { amount: '200' },
        result: 'success',
        durationMs: 100,
      });

      expect(entry1.id).toBeDefined();
      expect(entry2.id).toBeDefined();
      expect(entry1.id).not.toBe(entry2.id);
    });

    it('should include all provided parameters', async () => {
      const requestId = randomRequestId();
      const entry = await logger.log({
        requestId,
        tool: 'send_payment',
        arguments: { amount: '100', to: '0x123' },
        result: 'success',
        transactionHash: TEST_TX_HASHES.VALID,
        gasCost: '0.001',
        durationMs: 1500,
        clientInfo: { name: 'Claude', version: '1.0' },
      });

      expect(entry.requestId).toBe(requestId);
      expect(entry.tool).toBe('send_payment');
      expect(entry.arguments).toEqual({ amount: '100', to: '0x123' });
      expect(entry.result).toBe('success');
      expect(entry.transactionHash).toBe(TEST_TX_HASHES.VALID);
      expect(entry.gasCost).toBe('0.001');
      expect(entry.durationMs).toBe(1500);
      expect(entry.clientInfo).toEqual({ name: 'Claude', version: '1.0' });
    });

    it('should add entry to recentLogs buffer', async () => {
      await logger.log({
        tool: 'get_balance',
        arguments: {},
        result: 'success',
        durationMs: 50,
      });

      const recentLogs = logger.getRecentLogs(10);
      expect(recentLogs.length).toBe(1);
      expect(recentLogs[0].tool).toBe('get_balance');
    });

    it('should include timestamp in ISO format', async () => {
      const entry = await logger.log({
        tool: 'send_payment',
        arguments: {},
        result: 'success',
        durationMs: 100,
      });

      expect(entry.timestamp).toBeDefined();
      // ISO format: 2024-12-15T12:00:00.000Z
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should handle disabled logging gracefully', async () => {
      setMockConfig(createMockConfig({
        logging: {
          level: 'info',
          auditLog: {
            enabled: false,
            path: './logs/audit.jsonl',
            rotationDays: 30,
          },
        },
      }));

      const disabledLogger = new AuditLogger();
      const entry = await disabledLogger.log({
        tool: 'send_payment',
        arguments: {},
        result: 'success',
        durationMs: 100,
      });

      // Should still return entry (in-memory buffer works)
      expect(entry.id).toBeDefined();
      await disabledLogger.close();
    });

    it('should include error details for failures', async () => {
      const entry = await logger.log({
        tool: 'send_payment',
        arguments: {},
        result: 'failure',
        errorMessage: 'Insufficient balance',
        errorCode: 3001,
        durationMs: 100,
      });

      expect(entry.result).toBe('failure');
      expect(entry.errorMessage).toBe('Insufficient balance');
      expect(entry.errorCode).toBe(3001);
    });

    it('should include rejection reason for rejected operations', async () => {
      const entry = await logger.log({
        tool: 'send_payment',
        arguments: {},
        result: 'rejected',
        rejectionReason: 'Rate limit exceeded',
        durationMs: 5,
      });

      expect(entry.result).toBe('rejected');
      expect(entry.rejectionReason).toBe('Rate limit exceeded');
    });
  });

  // ===========================================================================
  // Argument Sanitization Tests
  // ===========================================================================

  describe('sanitizeArguments', () => {
    it('should redact privateKey fields', async () => {
      const entry = await logger.log({
        tool: 'test',
        arguments: {
          privateKey: '0x1234567890abcdef',
          amount: '100',
        },
        result: 'success',
        durationMs: 100,
      });

      expect(entry.arguments.privateKey).toBe('[REDACTED]');
      expect(entry.arguments.amount).toBe('100');
    });

    it('should redact password fields', async () => {
      const entry = await logger.log({
        tool: 'test',
        arguments: {
          password: 'mysecretpassword',
          keystorePassword: 'another_secret',
        },
        result: 'success',
        durationMs: 100,
      });

      expect(entry.arguments.password).toBe('[REDACTED]');
      expect(entry.arguments.keystorePassword).toBe('[REDACTED]');
    });

    it('should redact fields containing "secret"', async () => {
      const entry = await logger.log({
        tool: 'test',
        arguments: {
          mySecret: 'hidden',
          secretValue: 'also_hidden',
        },
        result: 'success',
        durationMs: 100,
      });

      expect(entry.arguments.mySecret).toBe('[REDACTED]');
      expect(entry.arguments.secretValue).toBe('[REDACTED]');
    });

    it('should redact fields containing "token"', async () => {
      const entry = await logger.log({
        tool: 'test',
        arguments: {
          accessToken: 'jwt_token_here',
          authToken: 'bearer_token',
          // Note: 'token' as in cryptocurrency should be fine if it's not a string
          tokenSymbol: 'AlphaUSD', // This is a string but contains 'token'
        },
        result: 'success',
        durationMs: 100,
      });

      expect(entry.arguments.accessToken).toBe('[REDACTED]');
      expect(entry.arguments.authToken).toBe('[REDACTED]');
      // tokenSymbol contains 'token' so it gets redacted too
      expect(entry.arguments.tokenSymbol).toBe('[REDACTED]');
    });

    it('should handle nested objects recursively', async () => {
      const entry = await logger.log({
        tool: 'test',
        arguments: {
          wallet: {
            privateKey: '0xabc123',
            address: '0x742d...',
          },
          nested: {
            deep: {
              password: 'secret123',
              value: 'visible',
            },
          },
        },
        result: 'success',
        durationMs: 100,
      });

      expect((entry.arguments.wallet as Record<string, unknown>).privateKey).toBe('[REDACTED]');
      expect((entry.arguments.wallet as Record<string, unknown>).address).toBe('0x742d...');
      expect(
        ((entry.arguments.nested as Record<string, unknown>).deep as Record<string, unknown>)
          .password
      ).toBe('[REDACTED]');
      expect(
        ((entry.arguments.nested as Record<string, unknown>).deep as Record<string, unknown>)
          .value
      ).toBe('visible');
    });

    it('should handle arrays of objects', async () => {
      const entry = await logger.log({
        tool: 'batch_payments',
        arguments: {
          payments: [
            { to: '0x111', amount: '100', privateKey: 'key1' },
            { to: '0x222', amount: '200', privateKey: 'key2' },
          ],
        },
        result: 'success',
        durationMs: 100,
      });

      const payments = entry.arguments.payments as Array<Record<string, unknown>>;
      expect(payments[0].to).toBe('0x111');
      expect(payments[0].privateKey).toBe('[REDACTED]');
      expect(payments[1].privateKey).toBe('[REDACTED]');
    });

    it('should preserve non-sensitive values', async () => {
      const entry = await logger.log({
        tool: 'send_payment',
        arguments: {
          to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb',
          amount: '100.50',
          memo: 'INV-2024-001',
          isUrgent: true,
          count: 5,
        },
        result: 'success',
        durationMs: 100,
      });

      expect(entry.arguments.to).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb');
      expect(entry.arguments.amount).toBe('100.50');
      expect(entry.arguments.memo).toBe('INV-2024-001');
      expect(entry.arguments.isUrgent).toBe(true);
      expect(entry.arguments.count).toBe(5);
    });

    it('should handle null and undefined values', async () => {
      const entry = await logger.log({
        tool: 'test',
        arguments: {
          nullValue: null,
          undefinedValue: undefined,
        },
        result: 'success',
        durationMs: 100,
      });

      expect(entry.arguments.nullValue).toBe(null);
      expect(entry.arguments.undefinedValue).toBeUndefined();
    });
  });

  // ===========================================================================
  // Log Query Tests
  // ===========================================================================

  describe('log queries', () => {
    beforeEach(async () => {
      // Create several log entries
      await logger.log({
        tool: 'send_payment',
        arguments: { amount: '100' },
        result: 'success',
        transactionHash: TEST_TX_HASHES.VALID,
        durationMs: 100,
      });

      await logger.log({
        requestId: 'req_123',
        tool: 'get_balance',
        arguments: {},
        result: 'success',
        durationMs: 50,
      });

      await logger.log({
        requestId: 'req_123',
        tool: 'send_payment',
        arguments: { amount: '200' },
        result: 'failure',
        errorMessage: 'Insufficient balance',
        durationMs: 75,
      });

      await logger.log({
        tool: 'get_balance',
        arguments: {},
        result: 'success',
        durationMs: 30,
      });
    });

    describe('getRecentLogs', () => {
      it('should return newest first', async () => {
        const logs = logger.getRecentLogs(10);

        expect(logs.length).toBe(4);
        expect(logs[0].durationMs).toBe(30); // Last logged = first in result
        expect(logs[3].durationMs).toBe(100); // First logged = last in result
      });

      it('should respect count limit', async () => {
        const logs = logger.getRecentLogs(2);

        expect(logs.length).toBe(2);
      });

      it('should return all if count exceeds available', async () => {
        const logs = logger.getRecentLogs(100);

        expect(logs.length).toBe(4);
      });

      it('should return empty array when no logs', async () => {
        logger.clearRecentLogs();
        const logs = logger.getRecentLogs(10);

        expect(logs).toEqual([]);
      });
    });

    describe('getLogsByTransaction', () => {
      it('should filter by transaction hash', async () => {
        const logs = logger.getLogsByTransaction(TEST_TX_HASHES.VALID);

        expect(logs.length).toBe(1);
        expect(logs[0].transactionHash).toBe(TEST_TX_HASHES.VALID);
      });

      it('should be case-insensitive', async () => {
        const logs = logger.getLogsByTransaction(TEST_TX_HASHES.VALID.toUpperCase());

        expect(logs.length).toBe(1);
      });

      it('should return empty array for non-matching hash', async () => {
        const logs = logger.getLogsByTransaction('0xnonexistent');

        expect(logs).toEqual([]);
      });
    });

    describe('getLogsByRequestId', () => {
      it('should filter by requestId', async () => {
        const logs = logger.getLogsByRequestId('req_123');

        expect(logs.length).toBe(2);
        logs.forEach((log) => expect(log.requestId).toBe('req_123'));
      });

      it('should return empty array for non-matching requestId', async () => {
        const logs = logger.getLogsByRequestId('req_nonexistent');

        expect(logs).toEqual([]);
      });
    });

    describe('getLogsByTool', () => {
      it('should filter by tool name', async () => {
        const logs = logger.getLogsByTool('send_payment');

        expect(logs.length).toBe(2);
        logs.forEach((log) => expect(log.tool).toBe('send_payment'));
      });

      it('should respect limit parameter', async () => {
        const logs = logger.getLogsByTool('send_payment', 1);

        expect(logs.length).toBe(1);
      });

      it('should return newest first', async () => {
        const logs = logger.getLogsByTool('get_balance');

        expect(logs[0].durationMs).toBe(30); // Most recent get_balance
        expect(logs[1].durationMs).toBe(50); // Older get_balance
      });
    });
  });

  // ===========================================================================
  // In-Memory Buffer Tests
  // ===========================================================================

  describe('recentLogs buffer', () => {
    it('should limit to maxRecentLogs entries', async () => {
      // Log more than maxRecentLogs (100) entries
      for (let i = 0; i < 120; i++) {
        await logger.log({
          tool: 'test',
          arguments: { index: i },
          result: 'success',
          durationMs: i,
        });
      }

      const logs = logger.getRecentLogs(200);

      // Should be capped at 100
      expect(logs.length).toBe(100);
    });

    it('should trim oldest entries when limit exceeded', async () => {
      // Log 110 entries
      for (let i = 0; i < 110; i++) {
        await logger.log({
          tool: 'test',
          arguments: { index: i },
          result: 'success',
          durationMs: i,
        });
      }

      const logs = logger.getRecentLogs(100);

      // Oldest entries (0-9) should be trimmed
      // Newest entry (109) should be first
      expect(logs[0].durationMs).toBe(109);
      expect(logs[99].durationMs).toBe(10); // Entry 10 is now the oldest
    });

    it('should clear buffer via clearRecentLogs()', async () => {
      await logger.log({
        tool: 'test',
        arguments: {},
        result: 'success',
        durationMs: 100,
      });

      expect(logger.getRecentLogs(10).length).toBe(1);

      logger.clearRecentLogs();

      expect(logger.getRecentLogs(10).length).toBe(0);
    });
  });

  // ===========================================================================
  // Convenience Method Tests
  // ===========================================================================

  describe('convenience methods', () => {
    it('logSuccess should set result to "success"', async () => {
      const entry = await logger.logSuccess({
        tool: 'send_payment',
        arguments: { amount: '100' },
        durationMs: 100,
        transactionHash: TEST_TX_HASHES.VALID,
      });

      expect(entry.result).toBe('success');
      expect(entry.transactionHash).toBe(TEST_TX_HASHES.VALID);
    });

    it('logFailure should set result to "failure"', async () => {
      const entry = await logger.logFailure({
        tool: 'send_payment',
        arguments: { amount: '100' },
        durationMs: 100,
        errorMessage: 'Transaction reverted',
        errorCode: 3003,
      });

      expect(entry.result).toBe('failure');
      expect(entry.errorMessage).toBe('Transaction reverted');
      expect(entry.errorCode).toBe(3003);
    });

    it('logRejected should set result to "rejected"', async () => {
      const entry = await logger.logRejected({
        tool: 'send_payment',
        arguments: { amount: '100000' },
        durationMs: 5,
        rejectionReason: 'Spending limit exceeded',
      });

      expect(entry.result).toBe('rejected');
      expect(entry.rejectionReason).toBe('Spending limit exceeded');
    });
  });

  // ===========================================================================
  // isEnabled() and getLogPath() Tests
  // ===========================================================================

  describe('configuration accessors', () => {
    it('isEnabled should return true when enabled', () => {
      setMockConfig(createMockConfig({
        logging: {
          level: 'info',
          auditLog: { enabled: true, path: './logs/audit.jsonl', rotationDays: 30 },
        },
      }));

      const enabledLogger = new AuditLogger();
      expect(enabledLogger.isEnabled()).toBe(true);
    });

    it('isEnabled should return false when disabled', () => {
      setMockConfig(createMockConfig({
        logging: {
          level: 'info',
          auditLog: { enabled: false, path: './logs/audit.jsonl', rotationDays: 30 },
        },
      }));

      const disabledLogger = new AuditLogger();
      expect(disabledLogger.isEnabled()).toBe(false);
    });

    it('getLogPath should return configured path', () => {
      setMockConfig(createMockConfig({
        logging: {
          level: 'info',
          auditLog: { enabled: true, path: '/custom/path/audit.jsonl', rotationDays: 30 },
        },
      }));

      const customLogger = new AuditLogger();
      expect(customLogger.getLogPath()).toBe('/custom/path/audit.jsonl');
    });
  });

  // ===========================================================================
  // Singleton Management
  // ===========================================================================

  describe('singleton management', () => {
    beforeEach(() => {
      resetAuditLogger();
    });

    it('getAuditLogger should return same instance', () => {
      const instance1 = getAuditLogger();
      const instance2 = getAuditLogger();

      expect(instance1).toBe(instance2);
    });

    it('resetAuditLogger should clear singleton', async () => {
      const instance1 = getAuditLogger();
      await instance1.log({
        tool: 'test',
        arguments: {},
        result: 'success',
        durationMs: 100,
      });

      resetAuditLogger();

      const instance2 = getAuditLogger();
      // New instance should have empty buffer
      expect(instance2.getRecentLogs(10).length).toBe(0);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle empty arguments object', async () => {
      const entry = await logger.log({
        tool: 'get_balance',
        arguments: {},
        result: 'success',
        durationMs: 50,
      });

      expect(entry.arguments).toEqual({});
    });

    it('should handle very long tool names', async () => {
      const longToolName = 'a'.repeat(500);
      const entry = await logger.log({
        tool: longToolName,
        arguments: {},
        result: 'success',
        durationMs: 100,
      });

      expect(entry.tool).toBe(longToolName);
    });

    it('should handle special characters in arguments', async () => {
      const entry = await logger.log({
        tool: 'test',
        arguments: {
          memo: 'Special chars: äöü, 你好, 🎉',
          json: '{"key": "value"}',
        },
        result: 'success',
        durationMs: 100,
      });

      expect(entry.arguments.memo).toBe('Special chars: äöü, 你好, 🎉');
      expect(entry.arguments.json).toBe('{"key": "value"}');
    });

    it('should handle zero duration', async () => {
      const entry = await logger.log({
        tool: 'fast_operation',
        arguments: {},
        result: 'success',
        durationMs: 0,
      });

      expect(entry.durationMs).toBe(0);
    });

    it('should handle large duration values', async () => {
      const entry = await logger.log({
        tool: 'slow_operation',
        arguments: {},
        result: 'success',
        durationMs: 9999999,
      });

      expect(entry.durationMs).toBe(9999999);
    });
  });
});

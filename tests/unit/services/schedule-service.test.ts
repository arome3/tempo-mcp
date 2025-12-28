/**
 * Schedule Service Unit Tests
 *
 * Tests for scheduled payment management including:
 * - Schedule creation and ID generation
 * - Schedule cancellation with state validation
 * - Status queries and state transitions
 * - Record management (get, getAll, filter by status)
 * - Singleton pattern
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TEST_ADDRESSES, TEST_TOKENS, TEST_TX_HASHES } from '../../utils/test-helpers.js';

// Mock the tempo-client module
const mockSendScheduledTransaction = vi.fn();
const mockWaitForTransaction = vi.fn();

vi.mock('../../../src/services/tempo-client.js', () => ({
  getTempoClient: vi.fn().mockImplementation(() => ({
    sendScheduledTransaction: mockSendScheduledTransaction,
    waitForTransaction: mockWaitForTransaction,
  })),
  TIP20_ABI: [
    {
      name: 'transfer',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
    {
      name: 'transferWithMemo',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'memo', type: 'bytes32' },
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
  ],
}));

// Mock formatting utils
vi.mock('../../../src/utils/formatting.js', () => ({
  stringToBytes32: vi.fn().mockImplementation((str: string) => {
    // Simple mock that returns a bytes32-like value
    return ('0x' + Buffer.from(str.padEnd(32, '\0')).toString('hex')) as `0x${string}`;
  }),
}));

// Import after mocks are set up
import {
  ScheduleService,
  getScheduleService,
  resetScheduleService,
  type ScheduleStatus,
  type CreateScheduleParams,
} from '../../../src/services/schedule-service.js';

describe('ScheduleService', () => {
  let service: ScheduleService;
  const futureDate = new Date(Date.now() + 86400000); // Tomorrow
  const pastDate = new Date(Date.now() - 86400000); // Yesterday

  const defaultParams: CreateScheduleParams = {
    tokenAddress: TEST_TOKENS.ALPHA_USD as `0x${string}`,
    tokenSymbol: 'AlphaUSD',
    decimals: 6,
    to: TEST_ADDRESSES.VALID as `0x${string}`,
    amount: '100.00',
    executeAt: futureDate,
  };

  beforeEach(() => {
    // Reset singleton
    resetScheduleService();
    // Create fresh instance
    service = new ScheduleService();
    // Reset mocks
    mockSendScheduledTransaction.mockReset();
    mockWaitForTransaction.mockReset();
    // Default mock implementation
    mockSendScheduledTransaction.mockResolvedValue(TEST_TX_HASHES.VALID);
  });

  // ===========================================================================
  // Singleton Pattern Tests
  // ===========================================================================

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const service1 = getScheduleService();
      const service2 = getScheduleService();
      expect(service1).toBe(service2);
    });

    it('should return new instance after reset', () => {
      const service1 = getScheduleService();
      resetScheduleService();
      const service2 = getScheduleService();
      expect(service1).not.toBe(service2);
    });

    it('should clear schedules on reset', async () => {
      const svc = getScheduleService();
      await svc.createSchedule(defaultParams);
      expect(svc.getAllSchedules().length).toBe(1);

      resetScheduleService();
      const newSvc = getScheduleService();
      expect(newSvc.getAllSchedules().length).toBe(0);
    });
  });

  // ===========================================================================
  // createSchedule Tests
  // ===========================================================================

  describe('createSchedule', () => {
    it('should create a schedule with basic params', async () => {
      const result = await service.createSchedule(defaultParams);

      expect(result.scheduleId).toMatch(/^sched_[a-f0-9]+_\d+$/);
      expect(result.transactionHash).toBe(TEST_TX_HASHES.VALID);
      expect(result.status).toBe('scheduled');
      expect(result.record).toBeDefined();
    });

    it('should store schedule record correctly', async () => {
      const result = await service.createSchedule(defaultParams);

      const stored = service.getSchedule(result.scheduleId);
      expect(stored).not.toBeNull();
      expect(stored!.tokenAddress).toBe(defaultParams.tokenAddress);
      expect(stored!.tokenSymbol).toBe(defaultParams.tokenSymbol);
      expect(stored!.to).toBe(defaultParams.to);
      expect(stored!.amount).toBe(defaultParams.amount);
      expect(stored!.status).toBe('scheduled');
    });

    it('should convert amount to raw value', async () => {
      const result = await service.createSchedule(defaultParams);

      // 100.00 with 6 decimals = 100000000
      expect(result.record.amountRaw).toBe('100000000');
    });

    it('should handle schedule with memo', async () => {
      const params: CreateScheduleParams = {
        ...defaultParams,
        memo: 'INV-2024-001',
      };

      const result = await service.createSchedule(params);

      expect(result.record.memo).toBe('INV-2024-001');
    });

    it('should handle schedule with validFrom', async () => {
      const validFrom = new Date(Date.now() + 3600000); // 1 hour from now
      const params: CreateScheduleParams = {
        ...defaultParams,
        validFrom,
      };

      const result = await service.createSchedule(params);

      expect(result.record.validFrom).toEqual(validFrom);
    });

    it('should handle schedule with validUntil', async () => {
      const validUntil = new Date(Date.now() + 172800000); // 2 days from now
      const params: CreateScheduleParams = {
        ...defaultParams,
        validUntil,
      };

      const result = await service.createSchedule(params);

      expect(result.record.validUntil).toEqual(validUntil);
    });

    it('should handle schedule with recurring config', async () => {
      const params: CreateScheduleParams = {
        ...defaultParams,
        recurring: {
          interval: 'monthly',
          occurrences: 12,
        },
      };

      const result = await service.createSchedule(params);

      expect(result.record.recurring).toEqual({
        interval: 'monthly',
        occurrences: 12,
      });
    });

    it('should generate unique IDs for multiple schedules', async () => {
      const result1 = await service.createSchedule(defaultParams);
      const result2 = await service.createSchedule(defaultParams);
      const result3 = await service.createSchedule(defaultParams);

      expect(result1.scheduleId).not.toBe(result2.scheduleId);
      expect(result2.scheduleId).not.toBe(result3.scheduleId);
      expect(result1.scheduleId).not.toBe(result3.scheduleId);
    });

    it('should call sendScheduledTransaction with correct params', async () => {
      await service.createSchedule(defaultParams);

      expect(mockSendScheduledTransaction).toHaveBeenCalledTimes(1);
      const call = mockSendScheduledTransaction.mock.calls[0][0];

      expect(call.to).toBe(defaultParams.tokenAddress);
      expect(call.data).toBeDefined();
      expect(call.scheduledAt).toBe(Math.floor(futureDate.getTime() / 1000));
    });

    it('should throw if transaction submission fails', async () => {
      mockSendScheduledTransaction.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.createSchedule(defaultParams)).rejects.toThrow('Network error');
    });

    it('should set createdAt timestamp', async () => {
      const beforeCreate = new Date();
      const result = await service.createSchedule(defaultParams);
      const afterCreate = new Date();

      expect(result.record.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(result.record.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });
  });

  // ===========================================================================
  // cancelSchedule Tests
  // ===========================================================================

  describe('cancelSchedule', () => {
    it('should cancel a scheduled payment', async () => {
      const { scheduleId } = await service.createSchedule(defaultParams);

      const result = await service.cancelSchedule(scheduleId);

      expect(result).toBe(true);
      const record = service.getSchedule(scheduleId);
      expect(record!.status).toBe('cancelled');
    });

    it('should throw for non-existent schedule', async () => {
      await expect(service.cancelSchedule('sched_nonexistent_1')).rejects.toThrow(
        /Schedule not found/
      );
    });

    it('should throw for already executed schedule', async () => {
      const { scheduleId } = await service.createSchedule(defaultParams);

      // Manually set to executed
      const record = service.getSchedule(scheduleId)!;
      (record as any).status = 'executed';

      await expect(service.cancelSchedule(scheduleId)).rejects.toThrow(
        /already been executed/
      );
    });

    it('should throw for already cancelled schedule', async () => {
      const { scheduleId } = await service.createSchedule(defaultParams);

      // First cancellation succeeds
      await service.cancelSchedule(scheduleId);

      // Second cancellation fails
      await expect(service.cancelSchedule(scheduleId)).rejects.toThrow(
        /already cancelled/
      );
    });

    it('should throw and mark as expired for expired schedule', async () => {
      const params: CreateScheduleParams = {
        ...defaultParams,
        validUntil: pastDate, // Already expired
      };
      const { scheduleId } = await service.createSchedule(params);

      await expect(service.cancelSchedule(scheduleId)).rejects.toThrow(/expired/);

      // Should be marked as expired
      const record = service.getSchedule(scheduleId);
      expect(record!.status).toBe('expired');
    });
  });

  // ===========================================================================
  // getScheduleStatus Tests
  // ===========================================================================

  describe('getScheduleStatus', () => {
    it('should return scheduled status for new schedule', async () => {
      const { scheduleId } = await service.createSchedule(defaultParams);

      const status = await service.getScheduleStatus(scheduleId);

      expect(status).toBe('scheduled');
    });

    it('should throw for non-existent schedule', async () => {
      await expect(service.getScheduleStatus('sched_nonexistent_1')).rejects.toThrow(
        /Schedule not found/
      );
    });

    it('should return executed if already in terminal state', async () => {
      const { scheduleId } = await service.createSchedule(defaultParams);
      const record = service.getSchedule(scheduleId)!;
      (record as any).status = 'executed';

      const status = await service.getScheduleStatus(scheduleId);

      expect(status).toBe('executed');
      expect(mockWaitForTransaction).not.toHaveBeenCalled();
    });

    it('should return cancelled if already in terminal state', async () => {
      const { scheduleId } = await service.createSchedule(defaultParams);
      await service.cancelSchedule(scheduleId);

      const status = await service.getScheduleStatus(scheduleId);

      expect(status).toBe('cancelled');
    });

    it('should detect expired status', async () => {
      const params: CreateScheduleParams = {
        ...defaultParams,
        validUntil: pastDate,
      };
      const { scheduleId } = await service.createSchedule(params);

      const status = await service.getScheduleStatus(scheduleId);

      expect(status).toBe('expired');
    });

    it('should update to executed if transaction succeeded', async () => {
      const { scheduleId } = await service.createSchedule(defaultParams);

      // Mock successful transaction
      mockWaitForTransaction.mockResolvedValueOnce({ status: 'success' });

      const status = await service.getScheduleStatus(scheduleId);

      expect(status).toBe('executed');
      expect(mockWaitForTransaction).toHaveBeenCalledWith(TEST_TX_HASHES.VALID);
    });

    it('should keep scheduled status if transaction check fails', async () => {
      const { scheduleId } = await service.createSchedule(defaultParams);

      // Mock failed transaction check
      mockWaitForTransaction.mockRejectedValueOnce(new Error('Not found'));

      const status = await service.getScheduleStatus(scheduleId);

      expect(status).toBe('scheduled');
    });

    it('should keep scheduled status if transaction not yet successful', async () => {
      const { scheduleId } = await service.createSchedule(defaultParams);

      // Mock pending transaction (null or no success)
      mockWaitForTransaction.mockResolvedValueOnce(null);

      const status = await service.getScheduleStatus(scheduleId);

      expect(status).toBe('scheduled');
    });
  });

  // ===========================================================================
  // getSchedule Tests
  // ===========================================================================

  describe('getSchedule', () => {
    it('should return schedule record by ID', async () => {
      const { scheduleId, record } = await service.createSchedule(defaultParams);

      const result = service.getSchedule(scheduleId);

      expect(result).toEqual(record);
    });

    it('should return null for non-existent schedule', () => {
      const result = service.getSchedule('sched_nonexistent_1');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // getAllSchedules Tests
  // ===========================================================================

  describe('getAllSchedules', () => {
    it('should return empty array when no schedules', () => {
      const result = service.getAllSchedules();

      expect(result).toEqual([]);
    });

    it('should return all schedules', async () => {
      await service.createSchedule(defaultParams);
      await service.createSchedule(defaultParams);
      await service.createSchedule(defaultParams);

      const result = service.getAllSchedules();

      expect(result).toHaveLength(3);
    });

    it('should return independent array', async () => {
      await service.createSchedule(defaultParams);

      const result1 = service.getAllSchedules();
      const result2 = service.getAllSchedules();

      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2);
    });
  });

  // ===========================================================================
  // getSchedulesByStatus Tests
  // ===========================================================================

  describe('getSchedulesByStatus', () => {
    it('should return empty array when no matching schedules', () => {
      const result = service.getSchedulesByStatus('executed');

      expect(result).toEqual([]);
    });

    it('should filter by scheduled status', async () => {
      await service.createSchedule(defaultParams);
      await service.createSchedule(defaultParams);
      const { scheduleId } = await service.createSchedule(defaultParams);
      await service.cancelSchedule(scheduleId);

      const scheduled = service.getSchedulesByStatus('scheduled');
      const cancelled = service.getSchedulesByStatus('cancelled');

      expect(scheduled).toHaveLength(2);
      expect(cancelled).toHaveLength(1);
    });

    it('should return all matching schedules', async () => {
      await service.createSchedule(defaultParams);
      await service.createSchedule(defaultParams);
      await service.createSchedule(defaultParams);

      const result = service.getSchedulesByStatus('scheduled');

      expect(result).toHaveLength(3);
      expect(result.every((r) => r.status === 'scheduled')).toBe(true);
    });

    it('should filter by multiple statuses correctly', async () => {
      const s1 = await service.createSchedule(defaultParams);
      const s2 = await service.createSchedule(defaultParams);
      const s3 = await service.createSchedule(defaultParams);

      await service.cancelSchedule(s1.scheduleId);
      const record2 = service.getSchedule(s2.scheduleId)!;
      (record2 as any).status = 'executed';

      expect(service.getSchedulesByStatus('scheduled')).toHaveLength(1);
      expect(service.getSchedulesByStatus('cancelled')).toHaveLength(1);
      expect(service.getSchedulesByStatus('executed')).toHaveLength(1);
      expect(service.getSchedulesByStatus('expired')).toHaveLength(0);
    });
  });

  // ===========================================================================
  // clear Tests
  // ===========================================================================

  describe('clear', () => {
    it('should remove all schedules', async () => {
      await service.createSchedule(defaultParams);
      await service.createSchedule(defaultParams);
      await service.createSchedule(defaultParams);

      service.clear();

      expect(service.getAllSchedules()).toHaveLength(0);
    });

    it('should reset ID counter', async () => {
      const result1 = await service.createSchedule(defaultParams);
      expect(result1.scheduleId).toContain('_1');

      service.clear();

      const result2 = await service.createSchedule(defaultParams);
      expect(result2.scheduleId).toContain('_1');
    });
  });

  // ===========================================================================
  // ID Generation Tests
  // ===========================================================================

  describe('ID Generation', () => {
    it('should use transaction hash prefix in ID', async () => {
      const result = await service.createSchedule(defaultParams);

      // TEST_TX_HASHES.VALID starts with 0x, so slice(2, 10) gets first 8 hex chars
      const expectedPrefix = TEST_TX_HASHES.VALID.slice(2, 10);
      expect(result.scheduleId).toContain(expectedPrefix);
    });

    it('should increment counter for each schedule', async () => {
      const result1 = await service.createSchedule(defaultParams);
      const result2 = await service.createSchedule(defaultParams);
      const result3 = await service.createSchedule(defaultParams);

      expect(result1.scheduleId.endsWith('_1')).toBe(true);
      expect(result2.scheduleId.endsWith('_2')).toBe(true);
      expect(result3.scheduleId.endsWith('_3')).toBe(true);
    });

    it('should handle different transaction hashes', async () => {
      const txHash1 = ('0x' + 'a'.repeat(64)) as `0x${string}`;
      const txHash2 = ('0x' + 'b'.repeat(64)) as `0x${string}`;

      mockSendScheduledTransaction.mockResolvedValueOnce(txHash1);
      const result1 = await service.createSchedule(defaultParams);

      mockSendScheduledTransaction.mockResolvedValueOnce(txHash2);
      const result2 = await service.createSchedule(defaultParams);

      expect(result1.scheduleId).toContain('aaaaaaaa');
      expect(result2.scheduleId).toContain('bbbbbbbb');
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle decimal amounts', async () => {
      const params: CreateScheduleParams = {
        ...defaultParams,
        amount: '0.000001', // Smallest unit for 6 decimals
      };

      const result = await service.createSchedule(params);

      expect(result.record.amountRaw).toBe('1');
    });

    it('should handle large amounts', async () => {
      const params: CreateScheduleParams = {
        ...defaultParams,
        amount: '1000000000.123456',
      };

      const result = await service.createSchedule(params);

      expect(result.record.amountRaw).toBe('1000000000123456');
    });

    it('should preserve all optional fields as undefined when not provided', async () => {
      const result = await service.createSchedule(defaultParams);

      expect(result.record.memo).toBeUndefined();
      expect(result.record.validFrom).toBeUndefined();
      expect(result.record.validUntil).toBeUndefined();
      expect(result.record.recurring).toBeUndefined();
    });

    it('should handle schedule with all optional fields', async () => {
      const params: CreateScheduleParams = {
        ...defaultParams,
        memo: 'Test memo',
        validFrom: new Date(Date.now() + 1000),
        validUntil: new Date(Date.now() + 200000),
        recurring: {
          interval: 'weekly',
          endDate: '2025-12-31',
        },
      };

      const result = await service.createSchedule(params);

      expect(result.record.memo).toBe('Test memo');
      expect(result.record.validFrom).toBeDefined();
      expect(result.record.validUntil).toBeDefined();
      expect(result.record.recurring).toEqual({
        interval: 'weekly',
        endDate: '2025-12-31',
      });
    });

    it('should handle concurrent schedule creations', async () => {
      const promises = Array.from({ length: 10 }, () =>
        service.createSchedule(defaultParams)
      );

      const results = await Promise.all(promises);

      // All should have unique IDs
      const ids = results.map((r) => r.scheduleId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);
    });
  });

  // ===========================================================================
  // Status Transitions
  // ===========================================================================

  describe('Status Transitions', () => {
    it('should transition: scheduled -> cancelled', async () => {
      const { scheduleId } = await service.createSchedule(defaultParams);

      expect(service.getSchedule(scheduleId)!.status).toBe('scheduled');
      await service.cancelSchedule(scheduleId);
      expect(service.getSchedule(scheduleId)!.status).toBe('cancelled');
    });

    it('should transition: scheduled -> expired (on status check)', async () => {
      const params: CreateScheduleParams = {
        ...defaultParams,
        validUntil: pastDate,
      };
      const { scheduleId } = await service.createSchedule(params);

      expect(service.getSchedule(scheduleId)!.status).toBe('scheduled');
      await service.getScheduleStatus(scheduleId);
      expect(service.getSchedule(scheduleId)!.status).toBe('expired');
    });

    it('should transition: scheduled -> executed (on status check)', async () => {
      const { scheduleId } = await service.createSchedule(defaultParams);
      mockWaitForTransaction.mockResolvedValueOnce({ status: 'success' });

      expect(service.getSchedule(scheduleId)!.status).toBe('scheduled');
      await service.getScheduleStatus(scheduleId);
      expect(service.getSchedule(scheduleId)!.status).toBe('executed');
    });

    it('should not allow transition from terminal states', async () => {
      const { scheduleId } = await service.createSchedule(defaultParams);
      await service.cancelSchedule(scheduleId);

      // Trying to cancel again should fail
      await expect(service.cancelSchedule(scheduleId)).rejects.toThrow();
    });
  });
});

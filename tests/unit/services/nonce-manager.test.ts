/**
 * Nonce Manager Unit Tests
 *
 * Tests for transaction nonce management including:
 * - Nonce tracking and auto-increment
 * - Chain synchronization
 * - Pending transaction tracking
 * - Reset functionality
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TEST_ADDRESSES } from '../../utils/test-helpers.js';

// Create mock function that can be controlled
const mockGetTransactionCount = vi.fn();

// Mock viem - factory must not reference external variables
vi.mock('viem', () => {
  const mockFn = vi.fn();
  return {
    createClient: vi.fn().mockReturnValue({
      extend: vi.fn().mockImplementation(() => ({
        getTransactionCount: mockFn,
      })),
    }),
    http: vi.fn().mockReturnValue('http-transport'),
    publicActions: 'public-actions',
    // Export the mock for access in tests
    __mockGetTransactionCount: mockFn,
  };
});

// Mock tempo.ts/chains
vi.mock('tempo.ts/chains', () => ({
  tempo: vi.fn().mockReturnValue({
    id: 100001,
    name: 'Tempo',
    network: 'tempo',
  }),
}));

// Mock config
vi.mock('../../../src/config/index.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    network: {
      rpcUrl: 'https://rpc.tempo.xyz',
    },
    tokens: {
      default: 'PathUSD',
      aliases: {
        PathUSD: '0x' + '0'.repeat(38) + '01',
      },
    },
  }),
}));

// Import after mocks are set up
import { NonceManager, nonceManager } from '../../../src/services/nonce-manager.js';
import * as viemMock from 'viem';

// Get the mock function from viem mock
const getMockGetTransactionCount = () =>
  (viemMock as unknown as { __mockGetTransactionCount: ReturnType<typeof vi.fn> })
    .__mockGetTransactionCount;

describe('NonceManager', () => {
  let manager: NonceManager;
  const testAddress = TEST_ADDRESSES.VALID_1 as `0x${string}`;
  const testAddress2 = TEST_ADDRESSES.VALID_2 as `0x${string}`;

  beforeEach(() => {
    // Create fresh instance for each test
    manager = new NonceManager();
    // Reset mocks
    const mockFn = getMockGetTransactionCount();
    mockFn.mockReset();
    mockFn.mockResolvedValue(5); // Default chain nonce
  });

  // ===========================================================================
  // Singleton Instance Tests
  // ===========================================================================

  describe('Singleton Instance', () => {
    it('should export a singleton instance', () => {
      expect(nonceManager).toBeDefined();
      expect(nonceManager).toBeInstanceOf(NonceManager);
    });

    it('singleton should have all required methods', () => {
      expect(typeof nonceManager.getNextNonce).toBe('function');
      expect(typeof nonceManager.markPending).toBe('function');
      expect(typeof nonceManager.markConfirmed).toBe('function');
      expect(typeof nonceManager.hasPending).toBe('function');
      expect(typeof nonceManager.getPendingNonces).toBe('function');
      expect(typeof nonceManager.reset).toBe('function');
      expect(typeof nonceManager.resetAll).toBe('function');
      expect(typeof nonceManager.syncWithChain).toBe('function');
    });
  });

  // ===========================================================================
  // getNextNonce Tests
  // ===========================================================================

  describe('getNextNonce', () => {
    it('should fetch from chain on first call for an address', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockResolvedValueOnce(10);

      const nonce = await manager.getNextNonce(testAddress);

      expect(nonce).toBe(10);
      expect(mockFn).toHaveBeenCalledWith({
        address: testAddress,
        blockTag: 'pending',
      });
    });

    it('should increment nonce on subsequent calls', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockResolvedValueOnce(5);

      const nonce1 = await manager.getNextNonce(testAddress);
      const nonce2 = await manager.getNextNonce(testAddress);
      const nonce3 = await manager.getNextNonce(testAddress);

      expect(nonce1).toBe(5);
      expect(nonce2).toBe(6);
      expect(nonce3).toBe(7);
      // Should only call chain once
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should track nonces separately per address', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn
        .mockResolvedValueOnce(10) // First address
        .mockResolvedValueOnce(20); // Second address

      const nonce1 = await manager.getNextNonce(testAddress);
      const nonce2 = await manager.getNextNonce(testAddress2);
      const nonce3 = await manager.getNextNonce(testAddress);
      const nonce4 = await manager.getNextNonce(testAddress2);

      expect(nonce1).toBe(10);
      expect(nonce2).toBe(20);
      expect(nonce3).toBe(11);
      expect(nonce4).toBe(21);
    });

    it('should handle chain returning zero nonce', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockResolvedValueOnce(0);

      const nonce = await manager.getNextNonce(testAddress);

      expect(nonce).toBe(0);
    });

    it('should handle chain errors gracefully', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockRejectedValueOnce(new Error('RPC error'));

      await expect(manager.getNextNonce(testAddress)).rejects.toThrow('RPC error');
    });
  });

  // ===========================================================================
  // markPending Tests
  // ===========================================================================

  describe('markPending', () => {
    it('should track pending nonces', () => {
      manager.markPending(testAddress, 5);

      expect(manager.hasPending(testAddress)).toBe(true);
      expect(manager.getPendingNonces(testAddress)).toContain(5);
    });

    it('should track multiple pending nonces', () => {
      manager.markPending(testAddress, 5);
      manager.markPending(testAddress, 6);
      manager.markPending(testAddress, 7);

      const pending = manager.getPendingNonces(testAddress);
      expect(pending).toContain(5);
      expect(pending).toContain(6);
      expect(pending).toContain(7);
      expect(pending).toHaveLength(3);
    });

    it('should handle duplicate nonces (idempotent)', () => {
      manager.markPending(testAddress, 5);
      manager.markPending(testAddress, 5);

      const pending = manager.getPendingNonces(testAddress);
      expect(pending).toHaveLength(1);
      expect(pending).toContain(5);
    });

    it('should track pending separately per address', () => {
      manager.markPending(testAddress, 5);
      manager.markPending(testAddress2, 10);

      expect(manager.getPendingNonces(testAddress)).toEqual([5]);
      expect(manager.getPendingNonces(testAddress2)).toEqual([10]);
    });
  });

  // ===========================================================================
  // markConfirmed Tests
  // ===========================================================================

  describe('markConfirmed', () => {
    it('should remove nonce from pending', () => {
      manager.markPending(testAddress, 5);
      manager.markPending(testAddress, 6);

      manager.markConfirmed(testAddress, 5);

      const pending = manager.getPendingNonces(testAddress);
      expect(pending).not.toContain(5);
      expect(pending).toContain(6);
    });

    it('should handle confirming non-existent nonce gracefully', () => {
      // Should not throw
      expect(() => manager.markConfirmed(testAddress, 99)).not.toThrow();
    });

    it('should handle confirming for address with no pending', () => {
      // Should not throw
      expect(() => manager.markConfirmed(testAddress, 5)).not.toThrow();
    });

    it('should set hasPending to false when all confirmed', () => {
      manager.markPending(testAddress, 5);
      manager.markConfirmed(testAddress, 5);

      expect(manager.hasPending(testAddress)).toBe(false);
    });
  });

  // ===========================================================================
  // hasPending Tests
  // ===========================================================================

  describe('hasPending', () => {
    it('should return false for address with no pending', () => {
      expect(manager.hasPending(testAddress)).toBe(false);
    });

    it('should return true when pending exists', () => {
      manager.markPending(testAddress, 5);
      expect(manager.hasPending(testAddress)).toBe(true);
    });

    it('should return false after all nonces confirmed', () => {
      manager.markPending(testAddress, 5);
      manager.markPending(testAddress, 6);
      manager.markConfirmed(testAddress, 5);
      manager.markConfirmed(testAddress, 6);

      expect(manager.hasPending(testAddress)).toBe(false);
    });

    it('should return correct state per address', () => {
      manager.markPending(testAddress, 5);

      expect(manager.hasPending(testAddress)).toBe(true);
      expect(manager.hasPending(testAddress2)).toBe(false);
    });
  });

  // ===========================================================================
  // getPendingNonces Tests
  // ===========================================================================

  describe('getPendingNonces', () => {
    it('should return empty array for address with no pending', () => {
      const pending = manager.getPendingNonces(testAddress);
      expect(pending).toEqual([]);
    });

    it('should return array of pending nonces', () => {
      manager.markPending(testAddress, 5);
      manager.markPending(testAddress, 6);
      manager.markPending(testAddress, 10);

      const pending = manager.getPendingNonces(testAddress);
      expect(pending).toHaveLength(3);
      expect(pending).toContain(5);
      expect(pending).toContain(6);
      expect(pending).toContain(10);
    });

    it('should return independent arrays (not the internal set)', () => {
      manager.markPending(testAddress, 5);

      const pending1 = manager.getPendingNonces(testAddress);
      const pending2 = manager.getPendingNonces(testAddress);

      // Should be equal but not the same reference
      expect(pending1).toEqual(pending2);
      expect(pending1).not.toBe(pending2);
    });
  });

  // ===========================================================================
  // reset Tests
  // ===========================================================================

  describe('reset', () => {
    it('should clear nonce tracking for address', async () => {
      const mockFn = getMockGetTransactionCount();
      // First establish a nonce
      mockFn.mockResolvedValue(5);
      await manager.getNextNonce(testAddress);

      // Reset
      await manager.reset(testAddress);

      // Should fetch from chain again
      mockFn.mockResolvedValue(10);
      const nonce = await manager.getNextNonce(testAddress);

      expect(nonce).toBe(10);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should clear pending nonces for address', async () => {
      manager.markPending(testAddress, 5);
      manager.markPending(testAddress, 6);

      await manager.reset(testAddress);

      expect(manager.hasPending(testAddress)).toBe(false);
      expect(manager.getPendingNonces(testAddress)).toEqual([]);
    });

    it('should only affect the specified address', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockResolvedValue(5);
      await manager.getNextNonce(testAddress);
      await manager.getNextNonce(testAddress2);
      manager.markPending(testAddress, 5);
      manager.markPending(testAddress2, 5);

      await manager.reset(testAddress);

      // testAddress2 should still have pending
      expect(manager.hasPending(testAddress)).toBe(false);
      expect(manager.hasPending(testAddress2)).toBe(true);
    });
  });

  // ===========================================================================
  // resetAll Tests
  // ===========================================================================

  describe('resetAll', () => {
    it('should clear all nonce tracking', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockResolvedValue(5);
      await manager.getNextNonce(testAddress);
      await manager.getNextNonce(testAddress2);

      manager.resetAll();

      // Should fetch from chain again for both
      mockFn.mockResolvedValue(100);
      const nonce1 = await manager.getNextNonce(testAddress);
      const nonce2 = await manager.getNextNonce(testAddress2);

      expect(nonce1).toBe(100);
      expect(nonce2).toBe(100);
    });

    it('should clear all pending nonces', () => {
      manager.markPending(testAddress, 5);
      manager.markPending(testAddress2, 10);

      manager.resetAll();

      expect(manager.hasPending(testAddress)).toBe(false);
      expect(manager.hasPending(testAddress2)).toBe(false);
    });
  });

  // ===========================================================================
  // syncWithChain Tests
  // ===========================================================================

  describe('syncWithChain', () => {
    it('should fetch current nonce from chain', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockResolvedValueOnce(42);

      const nonce = await manager.syncWithChain(testAddress);

      expect(nonce).toBe(42);
      expect(mockFn).toHaveBeenCalledWith({
        address: testAddress,
        blockTag: 'pending',
      });
    });

    it('should update tracked nonce after sync', async () => {
      const mockFn = getMockGetTransactionCount();
      // First establish a nonce
      mockFn.mockResolvedValueOnce(5);
      await manager.getNextNonce(testAddress);
      await manager.getNextNonce(testAddress); // Now at 6

      // Sync with different chain state
      mockFn.mockResolvedValueOnce(10);
      await manager.syncWithChain(testAddress);

      // Next nonce should be based on synced value
      const nonce = await manager.getNextNonce(testAddress);
      expect(nonce).toBe(10);
    });

    it('should handle chain errors', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockRejectedValueOnce(new Error('Network error'));

      await expect(manager.syncWithChain(testAddress)).rejects.toThrow('Network error');
    });

    it('should work for address not previously tracked', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockResolvedValueOnce(25);

      const nonce = await manager.syncWithChain(testAddress);

      expect(nonce).toBe(25);
    });
  });

  // ===========================================================================
  // Integration Scenarios
  // ===========================================================================

  describe('Integration Scenarios', () => {
    it('should handle typical transaction flow', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockResolvedValue(5);

      // Get nonce for first transaction
      const nonce1 = await manager.getNextNonce(testAddress);
      expect(nonce1).toBe(5);

      // Mark as pending
      manager.markPending(testAddress, nonce1);
      expect(manager.hasPending(testAddress)).toBe(true);

      // Get nonce for second transaction
      const nonce2 = await manager.getNextNonce(testAddress);
      expect(nonce2).toBe(6);
      manager.markPending(testAddress, nonce2);

      // First transaction confirms
      manager.markConfirmed(testAddress, nonce1);
      expect(manager.getPendingNonces(testAddress)).toEqual([6]);

      // Second transaction confirms
      manager.markConfirmed(testAddress, nonce2);
      expect(manager.hasPending(testAddress)).toBe(false);

      // Next transaction
      const nonce3 = await manager.getNextNonce(testAddress);
      expect(nonce3).toBe(7);
    });

    it('should handle transaction failure and reset', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockResolvedValueOnce(5);

      // Get nonce
      const nonce = await manager.getNextNonce(testAddress);
      manager.markPending(testAddress, nonce);

      // Transaction fails, reset and resync
      await manager.reset(testAddress);

      // Chain state might have changed
      mockFn.mockResolvedValueOnce(5); // Same nonce if tx never landed

      const retryNonce = await manager.getNextNonce(testAddress);
      expect(retryNonce).toBe(5);
    });

    it('should handle multiple addresses concurrently', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(30);

      const addr1 = '0x' + '1'.repeat(40) as `0x${string}`;
      const addr2 = '0x' + '2'.repeat(40) as `0x${string}`;
      const addr3 = '0x' + '3'.repeat(40) as `0x${string}`;

      // Concurrent operations
      const [n1, n2, n3] = await Promise.all([
        manager.getNextNonce(addr1),
        manager.getNextNonce(addr2),
        manager.getNextNonce(addr3),
      ]);

      expect(n1).toBe(10);
      expect(n2).toBe(20);
      expect(n3).toBe(30);

      // All should increment independently
      const [n1b, n2b, n3b] = await Promise.all([
        manager.getNextNonce(addr1),
        manager.getNextNonce(addr2),
        manager.getNextNonce(addr3),
      ]);

      expect(n1b).toBe(11);
      expect(n2b).toBe(21);
      expect(n3b).toBe(31);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle very large nonces', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockResolvedValueOnce(Number.MAX_SAFE_INTEGER - 1);

      const nonce = await manager.getNextNonce(testAddress);

      expect(nonce).toBe(Number.MAX_SAFE_INTEGER - 1);
    });

    it('should handle rapid sequential calls', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockResolvedValue(0);

      // Rapid fire calls
      const nonces = [];
      for (let i = 0; i < 100; i++) {
        nonces.push(await manager.getNextNonce(testAddress));
      }

      // Should be sequential
      for (let i = 0; i < 100; i++) {
        expect(nonces[i]).toBe(i);
      }

      // Should have only called chain once
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should handle lowercase and checksum addresses consistently', async () => {
      const mockFn = getMockGetTransactionCount();
      mockFn.mockResolvedValue(5);

      // Same address, different cases
      const lower = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;

      const nonce = await manager.getNextNonce(lower);
      expect(nonce).toBe(5);
    });
  });
});

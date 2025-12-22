/**
 * Rewards Service Unit Tests
 *
 * Tests for TIP-20 rewards management service including:
 * - Opt-in/opt-out operations
 * - Claiming rewards
 * - Query methods (pending rewards, status, recipient)
 * - Reward recipient management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TEST_ADDRESSES,
  TEST_TOKENS,
  TEST_TX_HASHES,
} from '../../utils/test-helpers.js';
import {
  createMockTempoClient,
  setMockClient,
  resetMockClient,
} from '../../utils/mock-tempo-client.js';

// Mock the tempo client module
vi.mock('../../../src/services/tempo-client.js', async () => {
  const { getMockClient } = await import('../../utils/mock-tempo-client.js');
  return {
    getTempoClient: () => getMockClient(),
    resetTempoClient: vi.fn(),
    TIP20_ABI: [],
  };
});

// Mock config module
vi.mock('../../../src/config/index.js', async () => {
  const { getMockConfig } = await import('../../utils/mock-config.js');
  return {
    getConfig: () => getMockConfig(),
    loadConfig: () => getMockConfig(),
    resetConfig: vi.fn(),
  };
});

// Import after mocks are set up
import {
  RewardsService,
  getRewardsService,
  resetRewardsService,
  TIP20_REWARDS_ABI,
} from '../../../src/services/rewards-service.js';

describe('RewardsService', () => {
  let rewardsService: RewardsService;

  beforeEach(() => {
    resetRewardsService();
    resetMockClient();
    setMockClient(createMockTempoClient());
    rewardsService = getRewardsService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockClient();
  });

  // ===========================================================================
  // ABI Constants Tests
  // ===========================================================================

  describe('ABI Constants', () => {
    it('should define TIP20_REWARDS_ABI with required functions', () => {
      const functionNames = TIP20_REWARDS_ABI
        .filter((item) => item.type === 'function')
        .map((item) => item.name);

      // Write functions
      expect(functionNames).toContain('optInRewards');
      expect(functionNames).toContain('optOutRewards');
      expect(functionNames).toContain('claimRewards');
      expect(functionNames).toContain('setRewardRecipient');

      // View functions
      expect(functionNames).toContain('pendingRewards');
      expect(functionNames).toContain('rewardRecipient');
      expect(functionNames).toContain('isOptedInRewards');
      expect(functionNames).toContain('totalOptedInSupply');
      expect(functionNames).toContain('optedInBalance');
      expect(functionNames).toContain('totalRewardsDistributed');
      expect(functionNames).toContain('totalRewardsClaimed');
    });

    it('should define reward-related events', () => {
      const eventNames = TIP20_REWARDS_ABI
        .filter((item) => item.type === 'event')
        .map((item) => item.name);

      expect(eventNames).toContain('RewardsOptIn');
      expect(eventNames).toContain('RewardsOptOut');
      expect(eventNames).toContain('RewardsClaimed');
      expect(eventNames).toContain('RewardRecipientSet');
    });
  });

  // ===========================================================================
  // Singleton Pattern Tests
  // ===========================================================================

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const service1 = getRewardsService();
      const service2 = getRewardsService();
      expect(service1).toBe(service2);
    });

    it('should return new instance after reset', () => {
      const service1 = getRewardsService();
      resetRewardsService();
      const service2 = getRewardsService();
      expect(service1).not.toBe(service2);
    });
  });

  // ===========================================================================
  // isOptedIn Tests
  // ===========================================================================

  describe('isOptedIn', () => {
    it('should return true when address is opted in', async () => {
      setMockClient(createMockTempoClient({ rewards: { isOptedIn: true } }));
      rewardsService = new RewardsService();

      const result = await rewardsService.isOptedIn(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(true);
    });

    it('should return false when address is not opted in', async () => {
      setMockClient(createMockTempoClient({ rewards: { isOptedIn: false } }));
      rewardsService = new RewardsService();

      const result = await rewardsService.isOptedIn(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(false);
    });

    it('should accept optional address parameter', async () => {
      setMockClient(createMockTempoClient({ rewards: { isOptedIn: true } }));
      rewardsService = new RewardsService();

      const result = await rewardsService.isOptedIn(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // getPendingRewards Tests
  // ===========================================================================

  describe('getPendingRewards', () => {
    it('should return pending rewards amount', async () => {
      const expectedPending = BigInt(500 * 1e6);
      setMockClient(
        createMockTempoClient({ rewards: { pendingRewards: expectedPending } })
      );
      rewardsService = new RewardsService();

      const result = await rewardsService.getPendingRewards(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(expectedPending);
    });

    it('should return zero when no pending rewards', async () => {
      setMockClient(
        createMockTempoClient({ rewards: { pendingRewards: BigInt(0) } })
      );
      rewardsService = new RewardsService();

      const result = await rewardsService.getPendingRewards(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(BigInt(0));
    });
  });

  // ===========================================================================
  // getRewardRecipient Tests
  // ===========================================================================

  describe('getRewardRecipient', () => {
    it('should return null when no recipient set', async () => {
      setMockClient(
        createMockTempoClient({ rewards: { rewardRecipient: null } })
      );
      rewardsService = new RewardsService();

      const result = await rewardsService.getRewardRecipient(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBeNull();
    });

    it('should return recipient address when set', async () => {
      setMockClient(
        createMockTempoClient({
          rewards: { rewardRecipient: TEST_ADDRESSES.VALID_2 },
        })
      );
      rewardsService = new RewardsService();

      const result = await rewardsService.getRewardRecipient(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(TEST_ADDRESSES.VALID_2);
    });
  });

  // ===========================================================================
  // getOptedInBalance Tests
  // ===========================================================================

  describe('getOptedInBalance', () => {
    it('should return opted-in balance', async () => {
      const expectedBalance = BigInt(1000 * 1e6);
      setMockClient(
        createMockTempoClient({ rewards: { optedInBalance: expectedBalance } })
      );
      rewardsService = new RewardsService();

      const result = await rewardsService.getOptedInBalance(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(expectedBalance);
    });
  });

  // ===========================================================================
  // getTotalClaimed Tests
  // ===========================================================================

  describe('getTotalClaimed', () => {
    it('should return total claimed amount', async () => {
      const expectedClaimed = BigInt(250 * 1e6);
      setMockClient(
        createMockTempoClient({ rewards: { totalClaimed: expectedClaimed } })
      );
      rewardsService = new RewardsService();

      const result = await rewardsService.getTotalClaimed(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(expectedClaimed);
    });
  });

  // ===========================================================================
  // getTotalOptedInSupply Tests
  // ===========================================================================

  describe('getTotalOptedInSupply', () => {
    it('should return total opted-in supply', async () => {
      const expectedSupply = BigInt(5000000 * 1e6);
      setMockClient(
        createMockTempoClient({
          rewards: { totalOptedInSupply: expectedSupply },
        })
      );
      rewardsService = new RewardsService();

      const result = await rewardsService.getTotalOptedInSupply(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(expectedSupply);
    });
  });

  // ===========================================================================
  // getTotalDistributed Tests
  // ===========================================================================

  describe('getTotalDistributed', () => {
    it('should return total distributed amount', async () => {
      const expectedDistributed = BigInt(100000 * 1e6);
      setMockClient(
        createMockTempoClient({
          rewards: { totalDistributed: expectedDistributed },
        })
      );
      rewardsService = new RewardsService();

      const result = await rewardsService.getTotalDistributed(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(expectedDistributed);
    });
  });

  // ===========================================================================
  // getRewardStatus Tests
  // ===========================================================================

  describe('getRewardStatus', () => {
    it('should return complete reward status', async () => {
      setMockClient(
        createMockTempoClient({
          balance: BigInt(1000 * 1e6),
          rewards: {
            isOptedIn: true,
            pendingRewards: BigInt(100 * 1e6),
            optedInBalance: BigInt(1000 * 1e6),
            rewardRecipient: TEST_ADDRESSES.VALID_2,
            totalClaimed: BigInt(50 * 1e6),
            totalOptedInSupply: BigInt(1000000 * 1e6),
            totalDistributed: BigInt(10000 * 1e6),
          },
        })
      );
      rewardsService = new RewardsService();

      const status = await rewardsService.getRewardStatus(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(status.isOptedIn).toBe(true);
      expect(status.pendingRewards).toBe(BigInt(100 * 1e6));
      expect(status.optedInBalance).toBe(BigInt(1000 * 1e6));
      expect(status.totalBalance).toBe(BigInt(1000 * 1e6));
      expect(status.rewardRecipient).toBe(TEST_ADDRESSES.VALID_2);
      expect(status.totalClaimed).toBe(BigInt(50 * 1e6));
      expect(status.tokenStats.totalOptedInSupply).toBe(BigInt(1000000 * 1e6));
      expect(status.tokenStats.totalDistributed).toBe(BigInt(10000 * 1e6));
    });

    it('should return status for non-opted-in user', async () => {
      setMockClient(
        createMockTempoClient({
          rewards: {
            isOptedIn: false,
            pendingRewards: BigInt(0),
          },
        })
      );
      rewardsService = new RewardsService();

      const status = await rewardsService.getRewardStatus(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(status.isOptedIn).toBe(false);
      expect(status.pendingRewards).toBe(BigInt(0));
    });
  });

  // ===========================================================================
  // optInRewards Tests
  // ===========================================================================

  describe('optInRewards', () => {
    it('should successfully opt into rewards', async () => {
      setMockClient(createMockTempoClient());
      rewardsService = new RewardsService();

      const result = await rewardsService.optInRewards(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.gasCost).toBeDefined();
    });

    it('should throw when already opted in', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'AlreadyOptedIn',
        })
      );
      rewardsService = new RewardsService();

      await expect(
        rewardsService.optInRewards(TEST_TOKENS.ALPHA_USD as `0x${string}`)
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // optOutRewards Tests
  // ===========================================================================

  describe('optOutRewards', () => {
    it('should successfully opt out of rewards', async () => {
      setMockClient(
        createMockTempoClient({
          rewards: { pendingRewards: BigInt(0) },
        })
      );
      rewardsService = new RewardsService();

      const result = await rewardsService.optOutRewards(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        false
      );

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
    });

    it('should throw when not opted in', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'NotOptedIn',
        })
      );
      rewardsService = new RewardsService();

      await expect(
        rewardsService.optOutRewards(
          TEST_TOKENS.ALPHA_USD as `0x${string}`,
          false
        )
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // claimRewards Tests
  // ===========================================================================

  describe('claimRewards', () => {
    it('should successfully claim rewards', async () => {
      const pendingAmount = BigInt(100 * 1e6);
      setMockClient(
        createMockTempoClient({
          rewards: { pendingRewards: pendingAmount },
        })
      );
      rewardsService = new RewardsService();

      const result = await rewardsService.claimRewards(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.amountClaimed).toBe(pendingAmount);
    });

    it('should throw when no pending rewards', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'NoPendingRewards',
        })
      );
      rewardsService = new RewardsService();

      await expect(
        rewardsService.claimRewards(TEST_TOKENS.ALPHA_USD as `0x${string}`)
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // setRewardRecipient Tests
  // ===========================================================================

  describe('setRewardRecipient', () => {
    it('should successfully set reward recipient', async () => {
      setMockClient(createMockTempoClient());
      rewardsService = new RewardsService();

      const result = await rewardsService.setRewardRecipient(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
    });

    it('should throw for invalid recipient', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'InvalidRecipient',
        })
      );
      rewardsService = new RewardsService();

      await expect(
        rewardsService.setRewardRecipient(
          TEST_TOKENS.ALPHA_USD as `0x${string}`,
          TEST_ADDRESSES.VALID_2 as `0x${string}`
        )
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    it('should throw InternalError when wallet not configured', async () => {
      setMockClient({
        ...createMockTempoClient(),
        walletClient: null,
      } as ReturnType<typeof createMockTempoClient>);
      rewardsService = new RewardsService();

      await expect(
        rewardsService.optInRewards(TEST_TOKENS.ALPHA_USD as `0x${string}`)
      ).rejects.toThrow();
    });

    it('should handle network errors gracefully', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'Network error',
          failOnMethod: 'readContract',
        })
      );
      rewardsService = new RewardsService();

      await expect(
        rewardsService.getPendingRewards(TEST_TOKENS.ALPHA_USD as `0x${string}`)
      ).rejects.toThrow('Network error');
    });
  });
});

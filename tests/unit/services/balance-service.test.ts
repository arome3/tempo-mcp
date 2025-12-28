/**
 * Balance Service Unit Tests
 *
 * Tests for balance queries and account information service including:
 * - Single token balance queries
 * - Multi-token balance queries
 * - Account info retrieval (type detection, tx count)
 * - Token resolution (symbol to address)
 * - Error handling for invalid tokens/addresses
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TEST_ADDRESSES,
  TEST_TOKENS,
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
  BalanceService,
  getBalanceService,
  resetBalanceService,
} from '../../../src/services/balance-service.js';

describe('BalanceService', () => {
  let balanceService: BalanceService;

  beforeEach(() => {
    resetBalanceService();
    resetMockClient();
    setMockClient(createMockTempoClient());
    balanceService = getBalanceService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockClient();
  });

  // ===========================================================================
  // Singleton Pattern Tests
  // ===========================================================================

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const service1 = getBalanceService();
      const service2 = getBalanceService();
      expect(service1).toBe(service2);
    });

    it('should return new instance after reset', () => {
      const service1 = getBalanceService();
      resetBalanceService();
      const service2 = getBalanceService();
      expect(service1).not.toBe(service2);
    });
  });

  // ===========================================================================
  // getDefaultAddress Tests
  // ===========================================================================

  describe('getDefaultAddress', () => {
    it('should return configured wallet address', () => {
      const address = balanceService.getDefaultAddress();
      expect(address).toBe(TEST_ADDRESSES.VALID);
    });
  });

  // ===========================================================================
  // hasWalletConfigured Tests
  // ===========================================================================

  describe('hasWalletConfigured', () => {
    it('should return true when wallet is configured', () => {
      expect(balanceService.hasWalletConfigured()).toBe(true);
    });

    it('should return false when getAddress throws', () => {
      const mockClient = createMockTempoClient();
      mockClient.getAddress = vi.fn().mockImplementation(() => {
        throw new Error('Wallet not configured');
      });
      setMockClient(mockClient);
      balanceService = new BalanceService();

      expect(balanceService.hasWalletConfigured()).toBe(false);
    });
  });

  // ===========================================================================
  // getBalance Tests
  // ===========================================================================

  describe('getBalance', () => {
    it('should return balance for token by symbol', async () => {
      const expectedBalance = BigInt(1000 * 1e6);
      setMockClient(createMockTempoClient({ balance: expectedBalance }));
      balanceService = new BalanceService();

      const result = await balanceService.getBalance('AlphaUSD');

      expect(result.token).toBe(TEST_TOKENS.ALPHA_USD);
      expect(result.tokenSymbol).toBe('AlphaUSD');
      expect(result.decimals).toBe(6);
      expect(result.balanceRaw).toBe(expectedBalance.toString());
    });

    it('should return balance for token by address', async () => {
      const expectedBalance = BigInt(500 * 1e6);
      setMockClient(createMockTempoClient({ balance: expectedBalance }));
      balanceService = new BalanceService();

      const result = await balanceService.getBalance(TEST_TOKENS.ALPHA_USD);

      expect(result.token).toBe(TEST_TOKENS.ALPHA_USD);
      expect(result.balanceRaw).toBe(expectedBalance.toString());
    });

    it('should format balance with correct decimals', async () => {
      // 1000.50 with 6 decimals = 1000500000
      const expectedBalance = BigInt(1000500000);
      setMockClient(createMockTempoClient({ balance: expectedBalance }));
      balanceService = new BalanceService();

      const result = await balanceService.getBalance('AlphaUSD');

      expect(result.balance).toBe('1000.5');
      expect(result.balanceRaw).toBe('1000500000');
    });

    it('should use custom address when provided', async () => {
      setMockClient(createMockTempoClient());
      balanceService = new BalanceService();

      const result = await balanceService.getBalance(
        'AlphaUSD',
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result).toBeDefined();
      expect(result.token).toBe(TEST_TOKENS.ALPHA_USD);
    });

    it('should return zero balance', async () => {
      setMockClient(createMockTempoClient({ balance: BigInt(0) }));
      balanceService = new BalanceService();

      const result = await balanceService.getBalance('AlphaUSD');

      expect(result.balance).toBe('0');
      expect(result.balanceRaw).toBe('0');
    });

    it('should throw for unknown token symbol', async () => {
      setMockClient(createMockTempoClient());
      balanceService = new BalanceService();

      await expect(
        balanceService.getBalance('UNKNOWN_TOKEN')
      ).rejects.toThrow();
    });

    it('should throw for invalid token address format', async () => {
      setMockClient(createMockTempoClient());
      balanceService = new BalanceService();

      await expect(
        balanceService.getBalance('0xinvalid')
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // getBalances Tests
  // ===========================================================================

  describe('getBalances', () => {
    it('should return balances for multiple tokens', async () => {
      setMockClient(createMockTempoClient({ balance: BigInt(1000 * 1e6) }));
      balanceService = new BalanceService();

      const result = await balanceService.getBalances(['AlphaUSD', 'PathUSD']);

      expect(result).toHaveLength(2);
      expect(result[0].tokenSymbol).toBeDefined();
      expect(result[1].tokenSymbol).toBeDefined();
    });

    it('should handle single token array', async () => {
      setMockClient(createMockTempoClient());
      balanceService = new BalanceService();

      const result = await balanceService.getBalances(['AlphaUSD']);

      expect(result).toHaveLength(1);
    });

    it('should handle empty token array', async () => {
      setMockClient(createMockTempoClient());
      balanceService = new BalanceService();

      const result = await balanceService.getBalances([]);

      expect(result).toHaveLength(0);
    });

    it('should use custom address for all queries', async () => {
      setMockClient(createMockTempoClient());
      balanceService = new BalanceService();

      const result = await balanceService.getBalances(
        ['AlphaUSD'],
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result).toHaveLength(1);
    });
  });

  // ===========================================================================
  // getAccountInfo Tests
  // ===========================================================================

  describe('getAccountInfo', () => {
    it('should return account info with type and balances', async () => {
      setMockClient(createMockTempoClient({ balance: BigInt(1000 * 1e6) }));
      balanceService = new BalanceService();

      const result = await balanceService.getAccountInfo();

      expect(result.address).toBe(TEST_ADDRESSES.VALID);
      expect(result.type).toBeDefined();
      expect(['eoa', 'contract']).toContain(result.type);
      expect(result.transactionCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.balances)).toBe(true);
    });

    it('should filter out zero balances', async () => {
      setMockClient(createMockTempoClient({ balance: BigInt(0) }));
      balanceService = new BalanceService();

      const result = await balanceService.getAccountInfo();

      // Zero balances should be filtered
      expect(result.balances.every((b) => b.balance !== '0')).toBe(true);
    });

    it('should accept custom address', async () => {
      setMockClient(createMockTempoClient());
      balanceService = new BalanceService();

      const result = await balanceService.getAccountInfo(
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result.address).toBe(TEST_ADDRESSES.VALID_2);
    });

    it('should include transaction count', async () => {
      setMockClient(createMockTempoClient());
      balanceService = new BalanceService();

      const result = await balanceService.getAccountInfo();

      expect(typeof result.transactionCount).toBe('number');
    });

    it('should include timestamps (nullable)', async () => {
      setMockClient(createMockTempoClient());
      balanceService = new BalanceService();

      const result = await balanceService.getAccountInfo();

      // These may be null when no indexer is available
      expect(result.firstSeen === null || typeof result.firstSeen === 'string').toBe(true);
      expect(result.lastActive === null || typeof result.lastActive === 'string').toBe(true);
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    it('should handle network errors in getBalance', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'Network error',
          failOnMethod: 'readContract',
        })
      );
      balanceService = new BalanceService();

      await expect(
        balanceService.getBalance('AlphaUSD')
      ).rejects.toThrow('Network error');
    });

    it('should handle RPC errors gracefully', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'RPC timeout',
          failOnMethod: 'readContract',
        })
      );
      balanceService = new BalanceService();

      await expect(
        balanceService.getBalance(TEST_TOKENS.ALPHA_USD)
      ).rejects.toThrow();
    });
  });
});

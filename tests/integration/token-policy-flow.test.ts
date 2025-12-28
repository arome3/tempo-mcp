/**
 * Token and Policy Integration Tests
 *
 * Integration tests for the token creation and policy management flows.
 * Tests the interaction between:
 * - TokenService and PolicyService
 * - Token resolution across services
 * - Error propagation between services
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TEST_ADDRESSES,
  TEST_TOKENS,
  TEST_TX_HASH,
} from '../utils/test-helpers.js';
import {
  createMockTempoClient,
  setMockClient,
  resetMockClient,
} from '../utils/mock-tempo-client.js';

// Mock the tempo client module
vi.mock('../../src/services/tempo-client.js', async () => {
  const { getMockClient } = await import('../utils/mock-tempo-client.js');
  return {
    getTempoClient: () => getMockClient(),
    resetTempoClient: vi.fn(),
    TIP20_ABI: [],
    TIP20_FACTORY_ABI: [],
    TIP20_ERROR_SIGNATURES: {},
  };
});

// Mock config module
vi.mock('../../src/config/index.js', async () => {
  const { getMockConfig } = await import('../utils/mock-config.js');
  return {
    getConfig: () => getMockConfig(),
    loadConfig: () => getMockConfig(),
    resetConfig: vi.fn(),
  };
});

// Import services after mocks
import {
  TokenService,
  getTokenService,
  resetTokenService,
  resolveTokenAddress,
} from '../../src/services/token-service.js';
import {
  BalanceService,
  getBalanceService,
  resetBalanceService,
} from '../../src/services/balance-service.js';

describe('Token and Balance Integration', () => {
  let tokenService: TokenService;
  let balanceService: BalanceService;

  beforeEach(() => {
    resetTokenService();
    resetBalanceService();
    resetMockClient();
    setMockClient(createMockTempoClient({ balance: BigInt(1000 * 1e6) }));
    tokenService = getTokenService();
    balanceService = getBalanceService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockClient();
  });

  describe('Token Resolution Consistency', () => {
    it('should resolve same token address across services', () => {
      // Both services should use the same token resolution
      const tokenAddress = resolveTokenAddress('AlphaUSD');
      expect(tokenAddress).toBe(TEST_TOKENS.ALPHA_USD);
    });

    it('should handle token address directly', async () => {
      const balance = await balanceService.getBalance(TEST_TOKENS.ALPHA_USD);
      expect(balance.token).toBe(TEST_TOKENS.ALPHA_USD);
    });

    it('should handle token symbol resolution', async () => {
      const balance = await balanceService.getBalance('AlphaUSD');
      expect(balance.token).toBe(TEST_TOKENS.ALPHA_USD);
    });
  });

  describe('Service Singleton Consistency', () => {
    it('should return same service instances', () => {
      const ts1 = getTokenService();
      const ts2 = getTokenService();
      const bs1 = getBalanceService();
      const bs2 = getBalanceService();

      expect(ts1).toBe(ts2);
      expect(bs1).toBe(bs2);
    });

    it('should reset services independently', () => {
      const ts1 = getTokenService();
      resetTokenService();
      const ts2 = getTokenService();

      const bs1 = getBalanceService();
      // Balance service not reset, should be same instance
      const bs2 = getBalanceService();

      expect(ts1).not.toBe(ts2);
      expect(bs1).toBe(bs2);
    });
  });

  describe('Error Propagation', () => {
    it('should propagate invalid token errors consistently', async () => {
      const invalidToken = 'UNKNOWN_TOKEN';

      // Both should throw for unknown token
      await expect(
        balanceService.getBalance(invalidToken)
      ).rejects.toThrow();

      expect(() => resolveTokenAddress(invalidToken)).toThrow();
    });

    it('should propagate network errors', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'Network error',
          failOnMethod: 'readContract',
        })
      );

      await expect(
        balanceService.getBalance('AlphaUSD')
      ).rejects.toThrow('Network error');
    });
  });

  describe('Balance Verification After Token Operations', () => {
    it('should query balance after mint simulation', async () => {
      // Simulate a mint by setting up the mock
      const preMintBalance = BigInt(1000 * 1e6);
      const mintAmount = BigInt(500 * 1e6);

      // Set initial balance
      setMockClient(createMockTempoClient({ balance: preMintBalance }));
      balanceService = new BalanceService();

      const beforeMint = await balanceService.getBalance('AlphaUSD');
      expect(beforeMint.balanceRaw).toBe(preMintBalance.toString());

      // "Mint" by updating mock balance
      setMockClient(createMockTempoClient({ balance: preMintBalance + mintAmount }));
      balanceService = new BalanceService();

      const afterMint = await balanceService.getBalance('AlphaUSD');
      expect(afterMint.balanceRaw).toBe((preMintBalance + mintAmount).toString());
    });
  });
});

describe('Multi-Token Balance Flows', () => {
  let balanceService: BalanceService;

  beforeEach(() => {
    resetBalanceService();
    resetMockClient();
    setMockClient(createMockTempoClient({ balance: BigInt(1000 * 1e6) }));
    balanceService = getBalanceService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockClient();
  });

  describe('Multiple Token Queries', () => {
    it('should query multiple tokens in parallel', async () => {
      const tokens = ['AlphaUSD', 'PathUSD'];
      const balances = await balanceService.getBalances(tokens);

      expect(balances).toHaveLength(2);
      expect(balances[0].tokenSymbol).toBeDefined();
      expect(balances[1].tokenSymbol).toBeDefined();
    });

    it('should handle mixed symbol and address tokens', async () => {
      const tokens = ['AlphaUSD', TEST_TOKENS.PATH_USD];
      const balances = await balanceService.getBalances(tokens);

      expect(balances).toHaveLength(2);
    });
  });

  describe('Account Info Aggregation', () => {
    it('should aggregate balances in account info', async () => {
      const accountInfo = await balanceService.getAccountInfo();

      expect(accountInfo.address).toBeDefined();
      expect(accountInfo.type).toBeDefined();
      expect(Array.isArray(accountInfo.balances)).toBe(true);
      expect(typeof accountInfo.transactionCount).toBe('number');
    });

    it('should filter zero balances in account info', async () => {
      setMockClient(createMockTempoClient({ balance: BigInt(0) }));
      balanceService = new BalanceService();

      const accountInfo = await balanceService.getAccountInfo();

      // All zero balances should be filtered out
      const hasZeroBalance = accountInfo.balances.some((b) => b.balance === '0');
      expect(hasZeroBalance).toBe(false);
    });
  });
});

describe('Token Metadata Consistency', () => {
  let tokenService: TokenService;
  let balanceService: BalanceService;

  beforeEach(() => {
    resetTokenService();
    resetBalanceService();
    resetMockClient();

    const mockClient = createMockTempoClient({ balance: BigInt(1000 * 1e6) });
    mockClient.publicClient = {
      readContract: vi.fn().mockImplementation(({ functionName }) => {
        switch (functionName) {
          case 'name':
            return Promise.resolve('Alpha USD');
          case 'symbol':
            return Promise.resolve('AlphaUSD');
          case 'decimals':
            return Promise.resolve(6);
          case 'totalSupply':
            return Promise.resolve(BigInt(1000000 * 1e6));
          case 'balanceOf':
            return Promise.resolve(BigInt(1000 * 1e6));
          default:
            return Promise.resolve(null);
        }
      }),
      getCode: vi.fn().mockResolvedValue('0x'),
      getTransactionCount: vi.fn().mockResolvedValue(0),
    } as any;
    setMockClient(mockClient);

    tokenService = getTokenService();
    balanceService = getBalanceService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockClient();
  });

  describe('Metadata Alignment', () => {
    it('should return consistent symbol from different queries', async () => {
      const tokenInfo = await tokenService.getTokenInfo(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );
      const balance = await balanceService.getBalance(TEST_TOKENS.ALPHA_USD);

      expect(tokenInfo.symbol).toBe(balance.tokenSymbol);
    });

    it('should return consistent decimals', async () => {
      const tokenInfo = await tokenService.getTokenInfo(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );
      const balance = await balanceService.getBalance(TEST_TOKENS.ALPHA_USD);

      expect(tokenInfo.decimals).toBe(balance.decimals);
      expect(tokenInfo.decimals).toBe(6); // TIP-20 always 6
    });

    it('should return consistent name', async () => {
      const tokenInfo = await tokenService.getTokenInfo(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );
      const balance = await balanceService.getBalance(TEST_TOKENS.ALPHA_USD);

      expect(tokenInfo.name).toBe(balance.tokenName);
    });
  });
});

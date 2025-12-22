/**
 * Fee AMM Service Unit Tests
 *
 * Tests for Fee AMM liquidity management service including:
 * - Pool info queries
 * - LP position queries
 * - Fee swap estimation
 * - Add liquidity operations
 * - Remove liquidity operations
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
  FeeAmmService,
  getFeeAmmService,
  resetFeeAmmService,
  FEE_AMM_ABI,
  FEE_AMM_ADDRESS,
  PATH_USD_ADDRESS,
  FEE_SWAP_RATE,
  MINIMUM_LIQUIDITY,
} from '../../../src/services/fee-amm-service.js';

describe('FeeAmmService', () => {
  let feeAmmService: FeeAmmService;

  beforeEach(() => {
    resetFeeAmmService();
    resetMockClient();
    setMockClient(createMockTempoClient());
    feeAmmService = getFeeAmmService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockClient();
  });

  // ===========================================================================
  // Constants Tests
  // ===========================================================================

  describe('Constants', () => {
    it('should define FEE_AMM_ADDRESS correctly', () => {
      expect(FEE_AMM_ADDRESS).toBe('0xfeec000000000000000000000000000000000000');
    });

    it('should define PATH_USD_ADDRESS correctly', () => {
      expect(PATH_USD_ADDRESS).toBe('0x20c0000000000000000000000000000000000000');
    });

    it('should define FEE_SWAP_RATE as 0.9985', () => {
      expect(FEE_SWAP_RATE).toBe(0.9985);
    });

    it('should define MINIMUM_LIQUIDITY as 1000n', () => {
      expect(MINIMUM_LIQUIDITY).toBe(1000n);
    });
  });

  // ===========================================================================
  // ABI Constants Tests
  // ===========================================================================

  describe('ABI Constants', () => {
    it('should define FEE_AMM_ABI with required view functions', () => {
      const functionNames = FEE_AMM_ABI
        .filter((item) => item.type === 'function')
        .map((item) => item.name);

      expect(functionNames).toContain('getPool');
      expect(functionNames).toContain('balanceOf');
      expect(functionNames).toContain('quote');
    });

    it('should define FEE_AMM_ABI with required state-changing functions', () => {
      const functionNames = FEE_AMM_ABI
        .filter((item) => item.type === 'function')
        .map((item) => item.name);

      expect(functionNames).toContain('mint');
      expect(functionNames).toContain('burn');
    });

    it('should define pool-related events', () => {
      const eventNames = FEE_AMM_ABI
        .filter((item) => item.type === 'event')
        .map((item) => item.name);

      expect(eventNames).toContain('Mint');
      expect(eventNames).toContain('Burn');
    });
  });

  // ===========================================================================
  // Singleton Pattern Tests
  // ===========================================================================

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const service1 = getFeeAmmService();
      const service2 = getFeeAmmService();
      expect(service1).toBe(service2);
    });

    it('should return new instance after reset', () => {
      const service1 = getFeeAmmService();
      resetFeeAmmService();
      const service2 = getFeeAmmService();
      expect(service1).not.toBe(service2);
    });
  });

  // ===========================================================================
  // getPoolInfo Tests
  // ===========================================================================

  describe('getPoolInfo', () => {
    it('should return pool information with reserves and LP supply', async () => {
      const reserveUser = BigInt(1000000 * 1e6);
      const reserveValidator = BigInt(1000000 * 1e6);
      const totalLpSupply = BigInt(2000000 * 1e6);

      setMockClient(
        createMockTempoClient({
          feeAmm: {
            reserveUser,
            reserveValidator,
            totalLpSupply,
          },
        })
      );
      feeAmmService = new FeeAmmService();

      const result = await feeAmmService.getPoolInfo(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result.userToken).toBe(TEST_TOKENS.ALPHA_USD);
      expect(result.validatorToken).toBe(PATH_USD_ADDRESS);
      expect(result.reserveUser).toBe(reserveUser);
      expect(result.reserveValidator).toBe(reserveValidator);
      expect(result.totalLpSupply).toBe(totalLpSupply);
      expect(result.swapRate).toBe(FEE_SWAP_RATE);
    });

    it('should use PATH_USD as default validator token', async () => {
      setMockClient(createMockTempoClient());
      feeAmmService = new FeeAmmService();

      const result = await feeAmmService.getPoolInfo(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result.validatorToken).toBe(PATH_USD_ADDRESS);
    });

    it('should accept custom validator token', async () => {
      setMockClient(createMockTempoClient());
      feeAmmService = new FeeAmmService();

      const customValidator = TEST_TOKENS.BETA_USD as `0x${string}`;
      const result = await feeAmmService.getPoolInfo(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        customValidator
      );

      expect(result.validatorToken).toBe(customValidator);
    });
  });

  // ===========================================================================
  // getLpPosition Tests
  // ===========================================================================

  describe('getLpPosition', () => {
    it('should return LP position with balance and share', async () => {
      const lpBalance = BigInt(10000 * 1e6);
      const totalLpSupply = BigInt(1000000 * 1e6);

      setMockClient(
        createMockTempoClient({
          feeAmm: {
            lpBalance,
            totalLpSupply,
            reserveUser: BigInt(500000 * 1e6),
            reserveValidator: BigInt(500000 * 1e6),
          },
        })
      );
      feeAmmService = new FeeAmmService();

      const result = await feeAmmService.getLpPosition(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result.lpBalance).toBe(lpBalance);
      expect(result.shareOfPool).toBeCloseTo(0.01, 4); // 1% share
    });

    it('should return zero share when no LP supply', async () => {
      setMockClient(
        createMockTempoClient({
          feeAmm: {
            lpBalance: BigInt(0),
            totalLpSupply: BigInt(0),
          },
        })
      );
      feeAmmService = new FeeAmmService();

      const result = await feeAmmService.getLpPosition(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result.lpBalance).toBe(BigInt(0));
      expect(result.shareOfPool).toBe(0);
    });

    it('should calculate underlying token values', async () => {
      const lpBalance = BigInt(100000 * 1e6); // 100K LP
      const totalLpSupply = BigInt(1000000 * 1e6); // 1M LP total
      const reserveUser = BigInt(500000 * 1e6); // 500K user tokens
      const reserveValidator = BigInt(500000 * 1e6); // 500K validator tokens

      setMockClient(
        createMockTempoClient({
          feeAmm: {
            lpBalance,
            totalLpSupply,
            reserveUser,
            reserveValidator,
          },
        })
      );
      feeAmmService = new FeeAmmService();

      const result = await feeAmmService.getLpPosition(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      // 10% of pool -> 50K of each token
      expect(result.underlyingUserToken).toBe(BigInt(50000 * 1e6));
      expect(result.underlyingValidatorToken).toBe(BigInt(50000 * 1e6));
    });
  });

  // ===========================================================================
  // estimateFeeSwap Tests
  // ===========================================================================

  describe('estimateFeeSwap', () => {
    it('should return estimated output amount', async () => {
      const expectedOutput = BigInt(998500); // 0.9985 rate

      setMockClient(
        createMockTempoClient({
          feeAmm: {
            quoteOutput: expectedOutput,
          },
        })
      );
      feeAmmService = new FeeAmmService();

      const result = await feeAmmService.estimateFeeSwap(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        TEST_TOKENS.PATH_USD as `0x${string}`,
        BigInt(1000000)
      );

      expect(result).toBe(expectedOutput);
    });

    it('should handle zero input amount', async () => {
      setMockClient(
        createMockTempoClient({
          feeAmm: {
            quoteOutput: BigInt(0),
          },
        })
      );
      feeAmmService = new FeeAmmService();

      const result = await feeAmmService.estimateFeeSwap(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        TEST_TOKENS.PATH_USD as `0x${string}`,
        BigInt(0)
      );

      expect(result).toBe(BigInt(0));
    });
  });

  // ===========================================================================
  // addLiquidity Tests
  // ===========================================================================

  describe('addLiquidity', () => {
    it('should successfully add liquidity', async () => {
      setMockClient(
        createMockTempoClient({
          feeAmm: {
            allowance: BigInt(1000000 * 1e6), // Pre-approved
          },
        })
      );
      feeAmmService = new FeeAmmService();

      const result = await feeAmmService.addLiquidity({
        userToken: TEST_TOKENS.ALPHA_USD as `0x${string}`,
        amountUser: BigInt(10000 * 1e6),
        amountValidator: BigInt(10000 * 1e6),
      });

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.gasCost).toBeDefined();
      expect(result.userTokenAdded).toBe(BigInt(10000 * 1e6));
      expect(result.validatorTokenAdded).toBe(BigInt(10000 * 1e6));
    });

    it('should use PATH_USD as default validator token', async () => {
      setMockClient(
        createMockTempoClient({
          feeAmm: {
            allowance: BigInt(1000000 * 1e6),
          },
        })
      );
      feeAmmService = new FeeAmmService();

      const result = await feeAmmService.addLiquidity({
        userToken: TEST_TOKENS.ALPHA_USD as `0x${string}`,
        amountUser: BigInt(10000 * 1e6),
        amountValidator: BigInt(10000 * 1e6),
      });

      expect(result.hash).toBeDefined();
    });

    it('should throw when wallet not configured', async () => {
      setMockClient({
        ...createMockTempoClient(),
        walletClient: null,
      } as ReturnType<typeof createMockTempoClient>);
      feeAmmService = new FeeAmmService();

      await expect(
        feeAmmService.addLiquidity({
          userToken: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          amountUser: BigInt(10000 * 1e6),
          amountValidator: BigInt(10000 * 1e6),
        })
      ).rejects.toThrow();
    });

    it('should throw on insufficient balance', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'InsufficientBalance',
          failOnMethod: 'writeContract',
        })
      );
      feeAmmService = new FeeAmmService();

      await expect(
        feeAmmService.addLiquidity({
          userToken: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          amountUser: BigInt(10000 * 1e6),
          amountValidator: BigInt(10000 * 1e6),
        })
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // removeLiquidity Tests
  // ===========================================================================

  describe('removeLiquidity', () => {
    it('should successfully remove liquidity', async () => {
      setMockClient(createMockTempoClient());
      feeAmmService = new FeeAmmService();

      const result = await feeAmmService.removeLiquidity({
        userToken: TEST_TOKENS.ALPHA_USD as `0x${string}`,
        lpAmount: BigInt(5000 * 1e6),
      });

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.gasCost).toBeDefined();
      expect(result.lpTokensBurned).toBe(BigInt(5000 * 1e6));
    });

    it('should throw when wallet not configured', async () => {
      setMockClient({
        ...createMockTempoClient(),
        walletClient: null,
      } as ReturnType<typeof createMockTempoClient>);
      feeAmmService = new FeeAmmService();

      await expect(
        feeAmmService.removeLiquidity({
          userToken: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          lpAmount: BigInt(5000 * 1e6),
        })
      ).rejects.toThrow();
    });

    it('should throw on insufficient LP balance', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'InsufficientLiquidity',
          failOnMethod: 'writeContract',
        })
      );
      feeAmmService = new FeeAmmService();

      await expect(
        feeAmmService.removeLiquidity({
          userToken: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          lpAmount: BigInt(5000 * 1e6),
        })
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    it('should handle network errors on pool queries', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'Network error',
          failOnMethod: 'readContract',
        })
      );
      feeAmmService = new FeeAmmService();

      await expect(
        feeAmmService.getPoolInfo(TEST_TOKENS.ALPHA_USD as `0x${string}`)
      ).rejects.toThrow('Network error');
    });

    it('should handle transaction confirmation timeout', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failMessage: 'Transaction confirmation timeout',
          failOnMethod: 'waitForTransaction',
        })
      );
      feeAmmService = new FeeAmmService();

      await expect(
        feeAmmService.addLiquidity({
          userToken: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          amountUser: BigInt(10000 * 1e6),
          amountValidator: BigInt(10000 * 1e6),
        })
      ).rejects.toThrow('Transaction confirmation timeout');
    });
  });
});

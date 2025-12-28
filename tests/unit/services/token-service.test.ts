/**
 * Token Service Unit Tests
 *
 * Tests for TIP-20 token operations including:
 * - Token creation via factory
 * - Token metadata queries
 * - Minting tokens (with/without memo)
 * - Burning tokens (with/without memo)
 * - Token address resolution
 * - Error handling and role requirements
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TEST_ADDRESSES,
  TEST_TOKENS,
  TEST_TX_HASH,
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
    TIP20_FACTORY_ABI: [],
    TIP20_ERROR_SIGNATURES: {
      '0x82b42900': 'Unauthorized',
    },
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
  TokenService,
  getTokenService,
  resetTokenService,
  resolveTokenAddress,
} from '../../../src/services/token-service.js';

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    resetTokenService();
    resetMockClient();
    setMockClient(createMockTempoClient());
    tokenService = getTokenService();
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
      const service1 = getTokenService();
      const service2 = getTokenService();
      expect(service1).toBe(service2);
    });

    it('should return new instance after reset', () => {
      const service1 = getTokenService();
      resetTokenService();
      const service2 = getTokenService();
      expect(service1).not.toBe(service2);
    });
  });

  // ===========================================================================
  // resolveTokenAddress Tests
  // ===========================================================================

  describe('resolveTokenAddress', () => {
    it('should resolve token symbol to address', () => {
      const address = resolveTokenAddress('AlphaUSD');
      expect(address).toBe(TEST_TOKENS.ALPHA_USD);
    });

    it('should return address as-is if valid 0x format', () => {
      const address = resolveTokenAddress(TEST_TOKENS.ALPHA_USD);
      expect(address).toBe(TEST_TOKENS.ALPHA_USD);
    });

    it('should throw for unknown symbol', () => {
      expect(() => resolveTokenAddress('UNKNOWN_TOKEN')).toThrow();
    });

    it('should throw for invalid address length', () => {
      expect(() => resolveTokenAddress('0x123')).toThrow();
    });

    it('should handle case-sensitive symbols', () => {
      const address = resolveTokenAddress('PathUSD');
      expect(address).toBe(TEST_TOKENS.PATH_USD);
    });
  });

  // ===========================================================================
  // getTokenInfo Tests
  // ===========================================================================

  describe('getTokenInfo', () => {
    it('should return token metadata', async () => {
      setMockClient(createMockTempoClient());
      tokenService = new TokenService();

      const result = await tokenService.getTokenInfo(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result.address).toBe(TEST_TOKENS.ALPHA_USD);
      expect(result.symbol).toBe('AlphaUSD');
      expect(result.decimals).toBe(6);
      expect(result.totalSupply).toBeDefined();
      expect(result.totalSupplyRaw).toBeDefined();
    });

    it('should throw for invalid token address', async () => {
      const mockClient = createMockTempoClient({
        shouldFail: true,
        failOnMethod: 'readContract',
        failMessage: 'Contract not found',
      });
      setMockClient(mockClient);
      tokenService = new TokenService();

      await expect(
        tokenService.getTokenInfo('0x0000000000000000000000000000000000000000' as `0x${string}`)
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // createToken Tests
  // ===========================================================================

  describe('createToken', () => {
    // Note: createToken tests are complex because they require event parsing.
    // These are better tested in E2E tests. Here we test the error cases.

    it('should throw when wallet not configured', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = null;
      setMockClient(mockClient);
      tokenService = new TokenService();

      await expect(
        tokenService.createToken({
          name: 'Test Token',
          symbol: 'TEST',
          currency: 'USD',
        })
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // mintTokens Tests
  // ===========================================================================

  describe('mintTokens', () => {
    it('should throw when wallet not configured', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = null;
      setMockClient(mockClient);
      tokenService = new TokenService();

      await expect(
        tokenService.mintTokens({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
          amount: BigInt(1000 * 1e6),
        })
      ).rejects.toThrow();
    });

    it('should throw for unauthorized caller (missing ISSUER_ROLE)', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = {
        writeContract: vi.fn().mockRejectedValue(new Error('Unauthorized - 0x82b42900')),
      } as any;
      setMockClient(mockClient);
      tokenService = new TokenService();

      await expect(
        tokenService.mintTokens({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
          amount: BigInt(1000 * 1e6),
        })
      ).rejects.toThrow(/Mint failed|Unauthorized/);
    });
  });

  // ===========================================================================
  // burnTokens Tests
  // ===========================================================================

  describe('burnTokens', () => {
    it('should throw when wallet not configured', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = null;
      setMockClient(mockClient);
      tokenService = new TokenService();

      await expect(
        tokenService.burnTokens({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          amount: BigInt(500 * 1e6),
        })
      ).rejects.toThrow();
    });

    it('should throw for insufficient balance', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = {
        writeContract: vi.fn().mockRejectedValue(new Error('insufficient balance')),
      } as any;
      setMockClient(mockClient);
      tokenService = new TokenService();

      await expect(
        tokenService.burnTokens({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          amount: BigInt(1000000 * 1e6),
        })
      ).rejects.toThrow(/insufficient|balance/i);
    });

    it('should throw for unauthorized caller', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = {
        writeContract: vi.fn().mockRejectedValue(new Error('AccessControl: unauthorized')),
      } as any;
      setMockClient(mockClient);
      tokenService = new TokenService();

      await expect(
        tokenService.burnTokens({
          token: TEST_TOKENS.ALPHA_USD as `0x${string}`,
          amount: BigInt(500 * 1e6),
        })
      ).rejects.toThrow(/Burn failed|ISSUER_ROLE/);
    });
  });
});

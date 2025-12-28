/**
 * Policy Service Unit Tests
 *
 * Tests for TIP-403 Policy Registry operations including:
 * - Transfer compliance checks
 * - Whitelist/blacklist authorization queries
 * - Policy information queries
 * - Policy creation
 * - Whitelist/blacklist management
 * - Burning blocked tokens
 * - Error handling
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
  PolicyService,
  getPolicyService,
  resetPolicyService,
  POLICY_REGISTRY_ADDRESS,
  POLICY_TYPE_VALUES,
} from '../../../src/services/policy-service.js';

describe('PolicyService', () => {
  let policyService: PolicyService;

  beforeEach(() => {
    resetPolicyService();
    resetMockClient();
    setMockClient(createMockTempoClient());
    policyService = getPolicyService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockClient();
  });

  // ===========================================================================
  // Constants Tests
  // ===========================================================================

  describe('Constants', () => {
    it('should have correct policy registry address', () => {
      expect(POLICY_REGISTRY_ADDRESS).toBe('0x403c000000000000000000000000000000000000');
    });

    it('should have correct policy type values', () => {
      expect(POLICY_TYPE_VALUES[0]).toBe('whitelist');
      expect(POLICY_TYPE_VALUES[1]).toBe('blacklist');
    });
  });

  // ===========================================================================
  // Singleton Pattern Tests
  // ===========================================================================

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const service1 = getPolicyService();
      const service2 = getPolicyService();
      expect(service1).toBe(service2);
    });

    it('should return new instance after reset', () => {
      const service1 = getPolicyService();
      resetPolicyService();
      const service2 = getPolicyService();
      expect(service1).not.toBe(service2);
    });
  });

  // ===========================================================================
  // canTransfer Tests
  // ===========================================================================

  describe('canTransfer', () => {
    it('should return true when transfer is allowed', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi.fn().mockResolvedValue(true);
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.canTransfer(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        TEST_ADDRESSES.VALID_1 as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result).toBe(true);
    });

    it('should return false when transfer is blocked', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi.fn().mockResolvedValue(false);
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.canTransfer(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        TEST_ADDRESSES.VALID_1 as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // isAuthorized Tests
  // ===========================================================================

  describe('isAuthorized', () => {
    it('should return authorization status', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi.fn().mockResolvedValue(true);
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.isAuthorized(
        2,
        TEST_ADDRESSES.VALID_1 as `0x${string}`
      );

      expect(result).toBe(true);
    });

    it('should throw for non-existent policy', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi
        .fn()
        .mockRejectedValue(new Error('0xaa4bc69a'));
      setMockClient(mockClient);
      policyService = new PolicyService();

      await expect(
        policyService.isAuthorized(999, TEST_ADDRESSES.VALID_1 as `0x${string}`)
      ).rejects.toThrow(/does not exist/);
    });
  });

  // ===========================================================================
  // isWhitelisted Tests
  // ===========================================================================

  describe('isWhitelisted', () => {
    it('should return true for whitelisted address on whitelist policy', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi
        .fn()
        .mockImplementation(({ functionName }) => {
          if (functionName === 'policyExists') return Promise.resolve(true);
          if (functionName === 'policyData')
            return Promise.resolve([0, TEST_ADDRESSES.VALID_1]); // whitelist type
          if (functionName === 'isAuthorized') return Promise.resolve(true);
          return Promise.resolve(null);
        });
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.isWhitelisted(
        2,
        TEST_ADDRESSES.VALID_1 as `0x${string}`
      );

      expect(result).toBe(true);
    });

    it('should return false for blacklist policy type', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi
        .fn()
        .mockImplementation(({ functionName }) => {
          if (functionName === 'policyExists') return Promise.resolve(true);
          if (functionName === 'policyData')
            return Promise.resolve([1, TEST_ADDRESSES.VALID_1]); // blacklist type
          return Promise.resolve(null);
        });
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.isWhitelisted(
        2,
        TEST_ADDRESSES.VALID_1 as `0x${string}`
      );

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // isBlacklisted Tests
  // ===========================================================================

  describe('isBlacklisted', () => {
    it('should return true for blacklisted address', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi
        .fn()
        .mockImplementation(({ functionName }) => {
          if (functionName === 'policyExists') return Promise.resolve(true);
          if (functionName === 'policyData')
            return Promise.resolve([1, TEST_ADDRESSES.VALID_1]); // blacklist type
          if (functionName === 'isAuthorized') return Promise.resolve(false); // not authorized = blacklisted
          return Promise.resolve(null);
        });
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.isBlacklisted(
        2,
        TEST_ADDRESSES.VALID_1 as `0x${string}`
      );

      expect(result).toBe(true);
    });

    it('should return false for whitelist policy type', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi
        .fn()
        .mockImplementation(({ functionName }) => {
          if (functionName === 'policyExists') return Promise.resolve(true);
          if (functionName === 'policyData')
            return Promise.resolve([0, TEST_ADDRESSES.VALID_1]); // whitelist type
          return Promise.resolve(null);
        });
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.isBlacklisted(
        2,
        TEST_ADDRESSES.VALID_1 as `0x${string}`
      );

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // getPolicy Tests
  // ===========================================================================

  describe('getPolicy', () => {
    it('should return policy info for existing policy', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi
        .fn()
        .mockImplementation(({ functionName }) => {
          if (functionName === 'policyExists') return Promise.resolve(true);
          if (functionName === 'policyData')
            return Promise.resolve([0, TEST_ADDRESSES.VALID_1]); // whitelist, admin
          return Promise.resolve(null);
        });
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.getPolicy(2);

      expect(result.policyId).toBe(2);
      expect(result.policyType).toBe('whitelist');
      expect(result.owner).toBe(TEST_ADDRESSES.VALID_1);
    });

    it('should return built-in policy 0 (always reject)', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi.fn().mockResolvedValue(false); // policyExists returns false
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.getPolicy(0);

      expect(result.policyId).toBe(0);
      expect(result.policyType).toBe('none');
    });

    it('should return built-in policy 1 (always allow)', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi.fn().mockResolvedValue(false);
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.getPolicy(1);

      expect(result.policyId).toBe(1);
      expect(result.policyType).toBe('none');
    });

    it('should throw for non-existent policy', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi.fn().mockResolvedValue(false);
      setMockClient(mockClient);
      policyService = new PolicyService();

      await expect(policyService.getPolicy(999)).rejects.toThrow(/does not exist/);
    });
  });

  // ===========================================================================
  // getTokenPolicyId Tests
  // ===========================================================================

  describe('getTokenPolicyId', () => {
    it('should return policy ID for token with policy', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi.fn().mockResolvedValue(BigInt(5));
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.getTokenPolicyId(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(5);
    });

    it('should return null for token without policy', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi.fn().mockResolvedValue(BigInt(0));
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.getTokenPolicyId(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi
        .fn()
        .mockRejectedValue(new Error('Contract error'));
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.getTokenPolicyId(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // createPolicy Tests
  // ===========================================================================

  describe('createPolicy', () => {
    it('should throw when wallet not configured', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = null;
      setMockClient(mockClient);
      policyService = new PolicyService();

      await expect(policyService.createPolicy('whitelist')).rejects.toThrow();
    });

    it('should throw on transaction error', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = {
        writeContract: vi.fn().mockRejectedValue(new Error('Transaction failed')),
      } as any;
      setMockClient(mockClient);
      policyService = new PolicyService();

      await expect(
        policyService.createPolicy('whitelist')
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // addToWhitelist Tests
  // ===========================================================================

  describe('addToWhitelist', () => {
    it('should throw when wallet not configured', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = null;
      setMockClient(mockClient);
      policyService = new PolicyService();

      await expect(
        policyService.addToWhitelist(2, TEST_ADDRESSES.VALID_1 as `0x${string}`)
      ).rejects.toThrow();
    });

    it('should throw on transaction error', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = {
        writeContract: vi
          .fn()
          .mockRejectedValue(new Error('Transaction failed')),
      } as any;
      setMockClient(mockClient);
      policyService = new PolicyService();

      await expect(
        policyService.addToWhitelist(2, TEST_ADDRESSES.VALID_1 as `0x${string}`)
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // removeFromWhitelist Tests
  // ===========================================================================

  describe('removeFromWhitelist', () => {
    it('should throw when wallet not configured', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = null;
      setMockClient(mockClient);
      policyService = new PolicyService();

      await expect(
        policyService.removeFromWhitelist(2, TEST_ADDRESSES.VALID_1 as `0x${string}`)
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // addToBlacklist Tests
  // ===========================================================================

  describe('addToBlacklist', () => {
    it('should throw when wallet not configured', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = null;
      setMockClient(mockClient);
      policyService = new PolicyService();

      await expect(
        policyService.addToBlacklist(2, TEST_ADDRESSES.VALID_1 as `0x${string}`)
      ).rejects.toThrow();
    });

    it('should throw on transaction error', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = {
        writeContract: vi
          .fn()
          .mockRejectedValue(new Error('Transaction failed')),
      } as any;
      setMockClient(mockClient);
      policyService = new PolicyService();

      await expect(
        policyService.addToBlacklist(2, TEST_ADDRESSES.VALID_1 as `0x${string}`)
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // removeFromBlacklist Tests
  // ===========================================================================

  describe('removeFromBlacklist', () => {
    it('should throw when wallet not configured', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = null;
      setMockClient(mockClient);
      policyService = new PolicyService();

      await expect(
        policyService.removeFromBlacklist(2, TEST_ADDRESSES.VALID_1 as `0x${string}`)
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // burnBlocked Tests
  // ===========================================================================

  describe('burnBlocked', () => {
    it('should throw when wallet not configured', async () => {
      const mockClient = createMockTempoClient();
      mockClient.walletClient = null;
      setMockClient(mockClient);
      policyService = new PolicyService();

      await expect(
        policyService.burnBlocked(
          TEST_TOKENS.ALPHA_USD as `0x${string}`,
          TEST_ADDRESSES.VALID_1 as `0x${string}`,
          BigInt(1000)
        )
      ).rejects.toThrow();
    });

    it('should throw on transaction error', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi
        .fn()
        .mockImplementation(({ functionName }) => {
          if (functionName === 'balanceOf') return Promise.resolve(BigInt(1000000000));
          if (functionName === 'decimals') return Promise.resolve(6);
          return Promise.resolve(null);
        });
      mockClient.walletClient = {
        writeContract: vi
          .fn()
          .mockRejectedValue(new Error('Transaction failed')),
      } as any;
      setMockClient(mockClient);
      policyService = new PolicyService();

      await expect(
        policyService.burnBlocked(
          TEST_TOKENS.ALPHA_USD as `0x${string}`,
          TEST_ADDRESSES.VALID_1 as `0x${string}`,
          BigInt(1000)
        )
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // getBalance Tests
  // ===========================================================================

  describe('getBalance', () => {
    it('should return token balance', async () => {
      const mockClient = createMockTempoClient();
      mockClient.publicClient.readContract = vi
        .fn()
        .mockResolvedValue(BigInt(1000000000));
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.getBalance(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        TEST_ADDRESSES.VALID_1 as `0x${string}`
      );

      expect(result).toBe(BigInt(1000000000));
    });
  });

  // ===========================================================================
  // checkTransferCompliance Tests
  // ===========================================================================

  describe('checkTransferCompliance', () => {
    it('should return allowed for token without policy', async () => {
      const mockClient = createMockTempoClient();
      // First call for getTokenPolicyId returns 0 (no policy)
      mockClient.publicClient.readContract = vi.fn().mockResolvedValue(BigInt(0));
      setMockClient(mockClient);
      policyService = new PolicyService();

      const result = await policyService.checkTransferCompliance(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        TEST_ADDRESSES.VALID_1 as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result.allowed).toBe(true);
      expect(result.policyId).toBeNull();
      expect(result.policyType).toBe('none');
    });
  });
});

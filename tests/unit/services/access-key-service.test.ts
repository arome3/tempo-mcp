/**
 * Access Key Service Unit Tests
 *
 * Tests for Tempo access key (session key) management service including:
 * - Key info queries (getKeyInfo, isKeyActive)
 * - Remaining limit queries (getRemainingLimit)
 * - Key operations (revokeAccessKey, updateSpendingLimit, authorizeKey)
 * - Helper functions (deriveAddressFromP256, parseSignatureType)
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
  AccessKeyService,
  getAccessKeyService,
  resetAccessKeyService,
  SignatureType,
  SIGNATURE_TYPE_NAMES,
  ACCOUNT_KEYCHAIN_ADDRESS,
  deriveAddressFromP256,
  parseSignatureType,
} from '../../../src/services/access-key-service.js';

// =============================================================================
// Mock Extensions for Access Key Service
// =============================================================================

/**
 * Encode key info into storage format.
 * Storage layout (right-aligned, 32 bytes total):
 * - signatureType: 1 byte (last byte)
 * - expiry: 8 bytes (u64)
 * - enforceLimits: 1 byte (bool)
 * - isRevoked: 1 byte (bool)
 */
function encodeKeyInfoStorage(keyInfo: {
  signatureType: number;
  expiry: number;
  enforceLimits: boolean;
  isRevoked: boolean;
}): `0x${string}` {
  // Build from right to left (32 bytes = 64 hex chars)
  const signatureTypeHex = keyInfo.signatureType.toString(16).padStart(2, '0');
  const expiryHex = keyInfo.expiry.toString(16).padStart(16, '0'); // 8 bytes = 16 hex chars
  const enforceLimitsHex = keyInfo.enforceLimits ? '01' : '00';
  const isRevokedHex = keyInfo.isRevoked ? '01' : '00';

  // Padding (32 - 11 = 21 bytes = 42 hex chars)
  const padding = '0'.repeat(42);

  // Layout: padding + isRevoked + enforceLimits + expiry + signatureType
  return `0x${padding}${isRevokedHex}${enforceLimitsHex}${expiryHex}${signatureTypeHex}` as `0x${string}`;
}

/**
 * Create a mock client with access key specific contract responses.
 */
function createAccessKeyMockClient(options: {
  keyInfo?: {
    signatureType: number;
    keyId: string;
    expiry: number;
    enforceLimits: boolean;
    isRevoked: boolean;
  } | null;
  remainingLimit?: bigint;
  shouldFail?: boolean;
  failMessage?: string;
  failOnMethod?: string;
} = {}) {
  const {
    keyInfo = null,
    remainingLimit = BigInt(1000000000),
    shouldFail = false,
    failMessage = 'Mock error',
    failOnMethod,
  } = options;

  const baseClient = createMockTempoClient({
    shouldFail,
    failMessage,
    failOnMethod,
  });

  // Override getStorageAt for access key storage reads
  baseClient.publicClient.getStorageAt = vi.fn().mockImplementation(() => {
    if (shouldFail && (!failOnMethod || failOnMethod === 'getStorageAt')) {
      throw new Error(failMessage);
    }

    if (!keyInfo) {
      // Return zero storage to indicate key not found
      return Promise.resolve('0x0000000000000000000000000000000000000000000000000000000000000000');
    }

    // Encode the key info into storage format
    return Promise.resolve(encodeKeyInfoStorage(keyInfo));
  });

  // Override readContract for remaining limit queries
  baseClient.publicClient.readContract = vi.fn().mockImplementation(
    ({ functionName }: { functionName: string }) => {
      if (shouldFail && (!failOnMethod || failOnMethod === 'readContract')) {
        throw new Error(failMessage);
      }

      if (functionName === 'getRemainingLimit') {
        return Promise.resolve(remainingLimit);
      }

      return Promise.resolve(undefined);
    }
  );

  return baseClient;
}

// =============================================================================
// Test Suite
// =============================================================================

describe('AccessKeyService', () => {
  let accessKeyService: AccessKeyService;

  beforeEach(() => {
    resetAccessKeyService();
    resetMockClient();
    setMockClient(createAccessKeyMockClient());
    accessKeyService = getAccessKeyService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockClient();
  });

  // ===========================================================================
  // Constants Tests
  // ===========================================================================

  describe('Constants', () => {
    it('should define Account Keychain precompile address', () => {
      expect(ACCOUNT_KEYCHAIN_ADDRESS).toBe('0xaAAAaaAA00000000000000000000000000000000');
    });

    it('should define all signature types', () => {
      expect(SignatureType.Secp256k1).toBe(0);
      expect(SignatureType.P256).toBe(1);
      expect(SignatureType.WebAuthn).toBe(2);
    });

    it('should have names for all signature types', () => {
      expect(SIGNATURE_TYPE_NAMES[SignatureType.Secp256k1]).toBe('secp256k1');
      expect(SIGNATURE_TYPE_NAMES[SignatureType.P256]).toBe('p256');
      expect(SIGNATURE_TYPE_NAMES[SignatureType.WebAuthn]).toBe('webauthn');
    });
  });

  // ===========================================================================
  // Helper Function Tests
  // ===========================================================================

  describe('parseSignatureType', () => {
    it('should parse secp256k1', () => {
      expect(parseSignatureType('secp256k1')).toBe(SignatureType.Secp256k1);
      expect(parseSignatureType('SECP256K1')).toBe(SignatureType.Secp256k1);
    });

    it('should parse p256', () => {
      expect(parseSignatureType('p256')).toBe(SignatureType.P256);
      expect(parseSignatureType('P256')).toBe(SignatureType.P256);
    });

    it('should parse webauthn', () => {
      expect(parseSignatureType('webauthn')).toBe(SignatureType.WebAuthn);
      expect(parseSignatureType('WebAuthn')).toBe(SignatureType.WebAuthn);
    });

    it('should throw on invalid signature type', () => {
      expect(() => parseSignatureType('invalid')).toThrow('Invalid signature type');
    });
  });

  describe('deriveAddressFromP256', () => {
    it('should derive deterministic address from public key coordinates', () => {
      // Example P256 public key coordinates (32 bytes each)
      const x = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;
      const y = '0x0000000000000000000000000000000000000000000000000000000000000002' as `0x${string}`;

      const address1 = deriveAddressFromP256(x, y);
      const address2 = deriveAddressFromP256(x, y);

      // Should be deterministic
      expect(address1).toBe(address2);
      // Should be valid address format
      expect(address1).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should produce different addresses for different keys', () => {
      const x1 = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;
      const y1 = '0x0000000000000000000000000000000000000000000000000000000000000002' as `0x${string}`;
      const x2 = '0x0000000000000000000000000000000000000000000000000000000000000003' as `0x${string}`;
      const y2 = '0x0000000000000000000000000000000000000000000000000000000000000004' as `0x${string}`;

      const address1 = deriveAddressFromP256(x1, y1);
      const address2 = deriveAddressFromP256(x2, y2);

      expect(address1).not.toBe(address2);
    });
  });

  // ===========================================================================
  // getKeyInfo Tests
  // ===========================================================================

  describe('getKeyInfo', () => {
    it('should return null when key is not found', async () => {
      setMockClient(createAccessKeyMockClient({ keyInfo: null }));
      accessKeyService = new AccessKeyService();

      const result = await accessKeyService.getKeyInfo(
        TEST_ADDRESSES.VALID as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result).toBeNull();
    });

    it('should return key info when key exists', async () => {
      const futureExpiry = Math.floor(Date.now() / 1000) + 86400;
      setMockClient(createAccessKeyMockClient({
        keyInfo: {
          signatureType: SignatureType.P256,
          keyId: TEST_ADDRESSES.VALID_2,
          expiry: futureExpiry,
          enforceLimits: true,
          isRevoked: false,
        },
      }));
      accessKeyService = new AccessKeyService();

      const result = await accessKeyService.getKeyInfo(
        TEST_ADDRESSES.VALID as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result).not.toBeNull();
      expect(result?.signatureType).toBe(SignatureType.P256);
      expect(result?.keyId).toBe(TEST_ADDRESSES.VALID_2);
      expect(result?.expiry).toBe(futureExpiry);
      expect(result?.enforceLimits).toBe(true);
      expect(result?.isRevoked).toBe(false);
    });

    it('should return key with isRevoked true when revoked', async () => {
      setMockClient(createAccessKeyMockClient({
        keyInfo: {
          signatureType: SignatureType.Secp256k1,
          keyId: TEST_ADDRESSES.VALID_2,
          expiry: 0,
          enforceLimits: false,
          isRevoked: true,
        },
      }));
      accessKeyService = new AccessKeyService();

      const result = await accessKeyService.getKeyInfo(
        TEST_ADDRESSES.VALID as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result?.isRevoked).toBe(true);
    });
  });

  // ===========================================================================
  // getRemainingLimit Tests
  // ===========================================================================

  describe('getRemainingLimit', () => {
    it('should return remaining limit', async () => {
      const expectedLimit = BigInt(5000000000); // 5000 with 6 decimals
      setMockClient(createAccessKeyMockClient({ remainingLimit: expectedLimit }));
      accessKeyService = new AccessKeyService();

      const result = await accessKeyService.getRemainingLimit(
        TEST_ADDRESSES.VALID as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`,
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(expectedLimit);
    });

    it('should return zero for exhausted limit', async () => {
      setMockClient(createAccessKeyMockClient({ remainingLimit: 0n }));
      accessKeyService = new AccessKeyService();

      const result = await accessKeyService.getRemainingLimit(
        TEST_ADDRESSES.VALID as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`,
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(0n);
    });
  });

  // ===========================================================================
  // isKeyActive Tests
  // ===========================================================================

  describe('isKeyActive', () => {
    it('should return false when key not found', async () => {
      setMockClient(createAccessKeyMockClient({ keyInfo: null }));
      accessKeyService = new AccessKeyService();

      const result = await accessKeyService.isKeyActive(
        TEST_ADDRESSES.VALID as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result).toBe(false);
    });

    it('should return false when key is revoked', async () => {
      setMockClient(createAccessKeyMockClient({
        keyInfo: {
          signatureType: SignatureType.P256,
          keyId: TEST_ADDRESSES.VALID_2,
          expiry: 0,
          enforceLimits: true,
          isRevoked: true,
        },
      }));
      accessKeyService = new AccessKeyService();

      const result = await accessKeyService.isKeyActive(
        TEST_ADDRESSES.VALID as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result).toBe(false);
    });

    it('should return false when key is expired', async () => {
      const pastExpiry = Math.floor(Date.now() / 1000) - 86400; // 1 day ago
      setMockClient(createAccessKeyMockClient({
        keyInfo: {
          signatureType: SignatureType.P256,
          keyId: TEST_ADDRESSES.VALID_2,
          expiry: pastExpiry,
          enforceLimits: true,
          isRevoked: false,
        },
      }));
      accessKeyService = new AccessKeyService();

      const result = await accessKeyService.isKeyActive(
        TEST_ADDRESSES.VALID as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result).toBe(false);
    });

    it('should return true when key is active and not expired', async () => {
      const futureExpiry = Math.floor(Date.now() / 1000) + 86400;
      setMockClient(createAccessKeyMockClient({
        keyInfo: {
          signatureType: SignatureType.P256,
          keyId: TEST_ADDRESSES.VALID_2,
          expiry: futureExpiry,
          enforceLimits: true,
          isRevoked: false,
        },
      }));
      accessKeyService = new AccessKeyService();

      const result = await accessKeyService.isKeyActive(
        TEST_ADDRESSES.VALID as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result).toBe(true);
    });

    it('should return true when key has no expiry (0)', async () => {
      // Note: Must use a non-zero signatureType (P256=1) because Secp256k1=0
      // with all other fields as 0/false produces all-zero storage,
      // which is indistinguishable from "key not found"
      setMockClient(createAccessKeyMockClient({
        keyInfo: {
          signatureType: SignatureType.P256,
          keyId: TEST_ADDRESSES.VALID_2,
          expiry: 0, // Never expires
          enforceLimits: false,
          isRevoked: false,
        },
      }));
      accessKeyService = new AccessKeyService();

      const result = await accessKeyService.isKeyActive(
        TEST_ADDRESSES.VALID as `0x${string}`,
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // revokeAccessKey Tests
  // ===========================================================================

  describe('revokeAccessKey', () => {
    it('should successfully revoke a key', async () => {
      const mockClient = createAccessKeyMockClient();
      setMockClient(mockClient);
      accessKeyService = new AccessKeyService();

      const result = await accessKeyService.revokeAccessKey(
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.gasCost).toBeDefined();
    });

    it('should call sendTempoTransaction with revokeKey function data', async () => {
      const mockClient = createAccessKeyMockClient();
      setMockClient(mockClient);
      accessKeyService = new AccessKeyService();

      await accessKeyService.revokeAccessKey(
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      // revokeAccessKey now uses sendTempoTransaction instead of writeContract
      expect(mockClient.sendTempoTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ACCOUNT_KEYCHAIN_ADDRESS,
        })
      );
    });

    it('should throw on sendTempoTransaction failure', async () => {
      setMockClient(createAccessKeyMockClient({
        shouldFail: true,
        failOnMethod: 'sendTempoTransaction',
        failMessage: 'Transaction failed',
      }));
      accessKeyService = new AccessKeyService();

      await expect(
        accessKeyService.revokeAccessKey(TEST_ADDRESSES.VALID_2 as `0x${string}`)
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // updateSpendingLimit Tests
  // ===========================================================================

  describe('updateSpendingLimit', () => {
    it('should successfully update spending limit', async () => {
      const mockClient = createAccessKeyMockClient();
      setMockClient(mockClient);
      accessKeyService = new AccessKeyService();

      const result = await accessKeyService.updateSpendingLimit(
        TEST_ADDRESSES.VALID_2 as `0x${string}`,
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        BigInt(10000000000) // 10000 with 6 decimals
      );

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
    });

    it('should call sendTempoTransaction with updateSpendingLimit function data', async () => {
      const mockClient = createAccessKeyMockClient();
      setMockClient(mockClient);
      accessKeyService = new AccessKeyService();

      await accessKeyService.updateSpendingLimit(
        TEST_ADDRESSES.VALID_2 as `0x${string}`,
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        BigInt(10000000000)
      );

      // updateSpendingLimit now uses sendTempoTransaction instead of writeContract
      expect(mockClient.sendTempoTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ACCOUNT_KEYCHAIN_ADDRESS,
        })
      );
    });

    it('should throw on sendTempoTransaction failure', async () => {
      setMockClient(createAccessKeyMockClient({
        shouldFail: true,
        failOnMethod: 'sendTempoTransaction',
        failMessage: 'Transaction failed',
      }));
      accessKeyService = new AccessKeyService();

      await expect(
        accessKeyService.updateSpendingLimit(
          TEST_ADDRESSES.VALID_2 as `0x${string}`,
          TEST_TOKENS.ALPHA_USD as `0x${string}`,
          BigInt(10000000000)
        )
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // authorizeKey Tests
  // ===========================================================================

  describe('authorizeKey', () => {
    it('should successfully authorize a new key', async () => {
      const mockClient = createAccessKeyMockClient();
      setMockClient(mockClient);
      accessKeyService = new AccessKeyService();

      const futureExpiry = Math.floor(Date.now() / 1000) + 86400;
      const result = await accessKeyService.authorizeKey(
        TEST_ADDRESSES.VALID_2 as `0x${string}`,
        SignatureType.P256,
        futureExpiry,
        true,
        [{ token: TEST_TOKENS.ALPHA_USD as `0x${string}`, amount: BigInt(1000000000) }]
      );

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
    });

    it('should call writeContract with authorizeKey function', async () => {
      const mockClient = createAccessKeyMockClient();
      setMockClient(mockClient);
      accessKeyService = new AccessKeyService();

      const futureExpiry = Math.floor(Date.now() / 1000) + 86400;
      await accessKeyService.authorizeKey(
        TEST_ADDRESSES.VALID_2 as `0x${string}`,
        SignatureType.P256,
        futureExpiry,
        true,
        []
      );

      expect(mockClient.walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: ACCOUNT_KEYCHAIN_ADDRESS,
          functionName: 'authorizeKey',
        })
      );
    });

    it('should accept zero expiry for never-expiring keys', async () => {
      const mockClient = createAccessKeyMockClient();
      setMockClient(mockClient);
      accessKeyService = new AccessKeyService();

      // Should not throw for expiry = 0
      const result = await accessKeyService.authorizeKey(
        TEST_ADDRESSES.VALID_2 as `0x${string}`,
        SignatureType.Secp256k1,
        0, // Never expires
        false,
        []
      );

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
    });

    it('should throw on past expiry', async () => {
      const mockClient = createAccessKeyMockClient();
      setMockClient(mockClient);
      accessKeyService = new AccessKeyService();

      const pastExpiry = Math.floor(Date.now() / 1000) - 86400;

      await expect(
        accessKeyService.authorizeKey(
          TEST_ADDRESSES.VALID_2 as `0x${string}`,
          SignatureType.P256,
          pastExpiry,
          true,
          []
        )
      ).rejects.toThrow(/Expiry must be in the future/);
    });

    it('should throw on writeContract failure', async () => {
      setMockClient(createAccessKeyMockClient({
        shouldFail: true,
        failOnMethod: 'writeContract',
        failMessage: 'Transaction failed',
      }));
      accessKeyService = new AccessKeyService();

      const futureExpiry = Math.floor(Date.now() / 1000) + 86400;

      await expect(
        accessKeyService.authorizeKey(
          TEST_ADDRESSES.VALID_2 as `0x${string}`,
          SignatureType.P256,
          futureExpiry,
          true,
          []
        )
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // Singleton Pattern Tests
  // ===========================================================================

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getAccessKeyService();
      const instance2 = getAccessKeyService();
      expect(instance1).toBe(instance2);
    });

    it('should return new instance after reset', () => {
      const instance1 = getAccessKeyService();
      resetAccessKeyService();
      const instance2 = getAccessKeyService();
      expect(instance1).not.toBe(instance2);
    });
  });
});

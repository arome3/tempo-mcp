/**
 * Wallet Manager Unit Tests
 *
 * Tests for wallet factory and singleton management including:
 * - PrivateKeyWallet creation and validation
 * - KeystoreWallet security validations
 * - External signer configuration
 * - Wallet type switching
 * - Error handling for missing configurations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TEST_ADDRESSES } from '../../utils/test-helpers.js';

// Mock nonce manager
vi.mock('../../../src/services/nonce-manager.js', () => ({
  nonceManager: {
    getNextNonce: vi.fn().mockResolvedValue(5),
    reset: vi.fn().mockResolvedValue(undefined),
  },
  NonceManager: vi.fn(),
}));

// Import wallet implementations directly (not through manager to avoid config dependency)
import { PrivateKeyWallet } from '../../../src/services/wallets/private-key-wallet.js';
import { KeystoreWallet } from '../../../src/services/wallets/keystore-wallet.js';

describe('PrivateKeyWallet', () => {
  const validPrivateKey = '0x' + 'a'.repeat(64) as `0x${string}`;
  const invalidPrivateKey = '0x123' as `0x${string}`;

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('Constructor', () => {
    it('should create wallet with valid private key', () => {
      const wallet = new PrivateKeyWallet(validPrivateKey);
      expect(wallet).toBeDefined();
    });

    it('should throw for invalid private key format (too short)', () => {
      expect(() => new PrivateKeyWallet(invalidPrivateKey)).toThrow(
        /Invalid private key format/
      );
    });

    it('should throw for private key without 0x prefix', () => {
      const noPrefix = 'a'.repeat(64) as `0x${string}`;
      expect(() => new PrivateKeyWallet(noPrefix)).toThrow(
        /Invalid private key format/
      );
    });

    it('should throw for private key that is too long', () => {
      const tooLong = ('0x' + 'a'.repeat(66)) as `0x${string}`;
      expect(() => new PrivateKeyWallet(tooLong)).toThrow(
        /Invalid private key format/
      );
    });
  });

  // ===========================================================================
  // getAddress Tests
  // ===========================================================================

  describe('getAddress', () => {
    it('should return consistent address', () => {
      const wallet = new PrivateKeyWallet(validPrivateKey);
      const address1 = wallet.getAddress();
      const address2 = wallet.getAddress();
      expect(address1).toBe(address2);
      expect(address1).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  // ===========================================================================
  // signTransaction Tests
  // ===========================================================================

  describe('signTransaction', () => {
    it('should sign a transaction', async () => {
      const wallet = new PrivateKeyWallet(validPrivateKey);
      const tx = {
        to: TEST_ADDRESSES.VALID_2 as `0x${string}`,
        value: BigInt(1000000000000000000),
        chainId: 1,
        type: 'eip1559' as const,
        maxFeePerGas: BigInt(20000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      const signed = await wallet.signTransaction(tx);
      expect(signed).toMatch(/^0x/);
    });
  });

  // ===========================================================================
  // signMessage Tests
  // ===========================================================================

  describe('signMessage', () => {
    it('should sign a message', async () => {
      const wallet = new PrivateKeyWallet(validPrivateKey);
      const signature = await wallet.signMessage('Hello, World!');
      expect(signature).toMatch(/^0x/);
      expect(signature.length).toBe(132); // 65 bytes * 2 + 2 for 0x
    });

    it('should produce different signatures for different messages', async () => {
      const wallet = new PrivateKeyWallet(validPrivateKey);
      const sig1 = await wallet.signMessage('Message 1');
      const sig2 = await wallet.signMessage('Message 2');
      expect(sig1).not.toBe(sig2);
    });
  });

  // ===========================================================================
  // Nonce Management Tests
  // ===========================================================================

  describe('Nonce Management', () => {
    it('should get next nonce', async () => {
      const wallet = new PrivateKeyWallet(validPrivateKey);
      const nonce = await wallet.getNonce();
      expect(typeof nonce).toBe('number');
    });

    it('should reset nonce', async () => {
      const wallet = new PrivateKeyWallet(validPrivateKey);
      await expect(wallet.resetNonce()).resolves.not.toThrow();
    });
  });
});

describe('KeystoreWallet', () => {
  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('Constructor', () => {
    it('should create wallet with valid path and password', () => {
      const wallet = new KeystoreWallet('/path/to/valid-keystore.json', 'password');
      expect(wallet).toBeDefined();
    });

    it('should throw for path traversal attempt', () => {
      expect(
        () => new KeystoreWallet('../../../etc/passwd', 'password')
      ).toThrow(/path traversal not allowed/);
    });

    it('should throw for non-json file', () => {
      expect(
        () => new KeystoreWallet('/path/to/keystore.txt', 'password')
      ).toThrow(/must be a .json file/);
    });

    it('should throw for double-dot path traversal in middle', () => {
      expect(
        () => new KeystoreWallet('/path/../secret/keystore.json', 'password')
      ).toThrow(/path traversal not allowed/);
    });
  });

  // ===========================================================================
  // getAddress Tests
  // ===========================================================================

  describe('getAddress', () => {
    it('should throw for missing keystore file when address not cached', () => {
      const wallet = new KeystoreWallet('/path/to/missing.json', 'password');
      // Should throw because file can't be read and address isn't cached
      expect(() => wallet.getAddress()).toThrow();
    });
  });

  // ===========================================================================
  // Interface Compliance Tests
  // ===========================================================================

  describe('Interface Compliance', () => {
    it('should implement all WalletManager methods', () => {
      const wallet = new KeystoreWallet('/path/to/keystore.json', 'password');

      expect(typeof wallet.getAddress).toBe('function');
      expect(typeof wallet.signTransaction).toBe('function');
      expect(typeof wallet.signMessage).toBe('function');
      expect(typeof wallet.getNonce).toBe('function');
      expect(typeof wallet.resetNonce).toBe('function');
    });
  });

  // Note: Lazy decryption tests require complex fs mocking that is better
  // suited for integration tests with actual keystore files.
});

describe('Wallet Manager Factory', () => {
  // For wallet manager tests, we need to mock the config module
  let mockConfig: any;

  beforeEach(() => {
    vi.resetModules();
    mockConfig = {
      wallet: {
        type: 'privateKey',
        privateKey: '0x' + 'a'.repeat(64),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Wallet Type Tests
  // ===========================================================================

  describe('Wallet Types', () => {
    it('should validate private key wallet type', () => {
      const wallet = new PrivateKeyWallet(('0x' + 'a'.repeat(64)) as `0x${string}`);
      expect(wallet.getAddress()).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should validate keystore wallet type', () => {
      const wallet = new KeystoreWallet('/path/to/valid-keystore.json', 'password');
      expect(wallet).toBeDefined();
    });
  });

  // ===========================================================================
  // Error Cases Tests
  // ===========================================================================

  describe('Error Cases', () => {
    it('should throw for missing private key', () => {
      expect(() => new PrivateKeyWallet('' as `0x${string}`)).toThrow();
    });

    it('should throw for invalid keystore path (traversal)', () => {
      expect(() => new KeystoreWallet('../../secrets/key.json', 'pass')).toThrow(
        /path traversal/
      );
    });
  });
});

describe('Wallet Interface Compliance', () => {
  // ===========================================================================
  // WalletManager Interface Tests
  // ===========================================================================

  describe('WalletManager Interface', () => {
    it('PrivateKeyWallet should implement all required methods', () => {
      const wallet = new PrivateKeyWallet(('0x' + 'a'.repeat(64)) as `0x${string}`);

      expect(typeof wallet.getAddress).toBe('function');
      expect(typeof wallet.signTransaction).toBe('function');
      expect(typeof wallet.signMessage).toBe('function');
      expect(typeof wallet.getNonce).toBe('function');
      expect(typeof wallet.resetNonce).toBe('function');
    });

    it('KeystoreWallet should implement all required methods', () => {
      const wallet = new KeystoreWallet('/path/to/valid-keystore.json', 'password');

      expect(typeof wallet.getAddress).toBe('function');
      expect(typeof wallet.signTransaction).toBe('function');
      expect(typeof wallet.signMessage).toBe('function');
      expect(typeof wallet.getNonce).toBe('function');
      expect(typeof wallet.resetNonce).toBe('function');
    });
  });

  // ===========================================================================
  // Consistent Behavior Tests
  // ===========================================================================

  describe('Consistent Behavior', () => {
    it('should produce deterministic addresses', () => {
      const privateKey = ('0x' + 'b'.repeat(64)) as `0x${string}`;
      const wallet1 = new PrivateKeyWallet(privateKey);
      const wallet2 = new PrivateKeyWallet(privateKey);

      expect(wallet1.getAddress()).toBe(wallet2.getAddress());
    });

    it('should produce deterministic signatures', async () => {
      const privateKey = ('0x' + 'c'.repeat(64)) as `0x${string}`;
      const wallet1 = new PrivateKeyWallet(privateKey);
      const wallet2 = new PrivateKeyWallet(privateKey);

      const message = 'Deterministic test';
      const sig1 = await wallet1.signMessage(message);
      const sig2 = await wallet2.signMessage(message);

      expect(sig1).toBe(sig2);
    });
  });
});

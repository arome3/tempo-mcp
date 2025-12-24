/**
 * Access Key Service
 *
 * Service layer for Tempo access key (session key) management.
 * Provides methods for creating, revoking, and querying delegated signing keys
 * with P256/WebAuthn support for enhanced security.
 *
 * Access keys enable:
 * - Delegated signing from primary account to secondary keys
 * - P256 (WebAuthn/passkey) and secp256k1 signature types
 * - Token-specific spending limits
 * - Expiration timestamps
 *
 * Based on Tempo's IAccountKeychain precompile interface.
 * @see https://docs.tempo.xyz/protocol/transactions/AccountKeychain
 *
 * ## Implementation Notes
 *
 * This service uses Tempo transaction type (0x76) for write operations to ensure
 * the precompile can correctly identify the account's keychain. The tempo.ts SDK's
 * `TransactionEnvelopeTempo` module is used to construct and sign transactions.
 *
 * **All Operations Working:**
 * - `authorizeKey`: Creates new access keys
 * - `revokeKey`: Revokes existing access keys
 * - `updateSpendingLimit`: Updates spending limits for key-token pairs
 * - `getKeyInfo`: Reads key information via direct storage reads
 * - `getRemainingLimit`: View function for remaining spending limits
 */

import { type Address, type Hash, keccak256, encodePacked, encodeFunctionData } from 'viem';
import { getTempoClient, type TempoPublicClient } from './tempo-client.js';
import { InternalError, BlockchainError } from '../utils/errors.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Account Keychain precompile address.
 * This is the protocol-level contract for managing access keys.
 * @see https://docs.tempo.xyz/protocol/transactions/AccountKeychain
 */
export const ACCOUNT_KEYCHAIN_ADDRESS =
  '0xaAAAaaAA00000000000000000000000000000000' as Address;

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Signature type enum matching IAccountKeychain.SignatureType.
 */
export enum SignatureType {
  Secp256k1 = 0,
  P256 = 1,
  WebAuthn = 2,
}

/**
 * Signature type names for display.
 */
export const SIGNATURE_TYPE_NAMES: Record<SignatureType, string> = {
  [SignatureType.Secp256k1]: 'secp256k1',
  [SignatureType.P256]: 'p256',
  [SignatureType.WebAuthn]: 'webauthn',
};

/**
 * Token spending limit structure.
 */
export interface TokenLimit {
  /** TIP-20 token address */
  token: Address;
  /** Spending limit amount in token units */
  amount: bigint;
}

/**
 * Key information from the precompile.
 * Matches IAccountKeychain.KeyInfo struct.
 */
export interface AccessKeyInfo {
  /** Signature type of the key */
  signatureType: SignatureType;
  /** Key identifier (address derived from public key) */
  keyId: Address;
  /** Unix timestamp when key expires (0 = never) */
  expiry: number;
  /** Whether spending limits are enforced for this key */
  enforceLimits: boolean;
  /** Whether this key has been revoked */
  isRevoked: boolean;
}

/**
 * Parameters for creating a new access key.
 */
export interface CreateAccessKeyParams {
  /** Signature type for the new key */
  signatureType: SignatureType;
  /** Unix timestamp when key expires (0 = never) */
  expiry?: number;
  /** Whether to enforce spending limits */
  enforceLimits?: boolean;
  /** Initial spending limits per token */
  limits?: TokenLimit[];
  /** Optional user-friendly label */
  label?: string;
}

/**
 * Result of access key creation.
 */
export interface CreateAccessKeyResult {
  /** Transaction hash */
  hash: Hash;
  /** Block number where authorized */
  blockNumber: number;
  /** Gas cost in fee token units */
  gasCost: string;
  /** The key ID (address derived from public key) */
  keyId: Address;
  /** Public key X coordinate (for P256) */
  publicKeyX?: string;
  /** Public key Y coordinate (for P256) */
  publicKeyY?: string;
}

/**
 * Result of a key operation (revoke, update limit).
 */
export interface KeyOperationResult {
  /** Transaction hash */
  hash: Hash;
  /** Block number */
  blockNumber: number;
  /** Gas cost in fee token units */
  gasCost: string;
}

// =============================================================================
// ABI Definitions
// =============================================================================

/**
 * Account Keychain ABI for key management operations.
 * Based on IAccountKeychain interface from Tempo documentation.
 */
export const ACCOUNT_KEYCHAIN_ABI = [
  // ==========================================================================
  // Management Functions (require Root Key signature)
  // ==========================================================================
  {
    name: 'authorizeKey',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'keyId', type: 'address' },
      { name: 'signatureType', type: 'uint8' },
      { name: 'expiry', type: 'uint64' },
      { name: 'enforceLimits', type: 'bool' },
      {
        name: 'limits',
        type: 'tuple[]',
        components: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: 'revokeKey',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'keyId', type: 'address' }],
    outputs: [],
  },
  {
    name: 'updateSpendingLimit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'keyId', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'newLimit', type: 'uint256' },
    ],
    outputs: [],
  },
  // ==========================================================================
  // View Functions
  // ==========================================================================
  {
    name: 'getKey',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'keyId', type: 'address' },
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'signatureType', type: 'uint8' },
          { name: 'keyId', type: 'address' },
          { name: 'expiry', type: 'uint64' },
          { name: 'enforceLimits', type: 'bool' },
          { name: 'isRevoked', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'getRemainingLimit',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'keyId', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  // ==========================================================================
  // Events
  // ==========================================================================
  {
    name: 'KeyAuthorized',
    type: 'event',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'publicKey', type: 'address', indexed: true },
      { name: 'signatureType', type: 'uint8', indexed: false },
      { name: 'expiry', type: 'uint64', indexed: false },
    ],
  },
  {
    name: 'KeyRevoked',
    type: 'event',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'publicKey', type: 'address', indexed: true },
    ],
  },
  {
    name: 'SpendingLimitUpdated',
    type: 'event',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'publicKey', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'newLimit', type: 'uint256', indexed: false },
    ],
  },
  // ==========================================================================
  // Errors
  // ==========================================================================
  {
    name: 'KeyNotFound',
    type: 'error',
    inputs: [],
  },
  {
    name: 'KeyRevoked',
    type: 'error',
    inputs: [],
  },
  {
    name: 'KeyInactive',
    type: 'error',
    inputs: [],
  },
  {
    name: 'UnauthorizedCaller',
    type: 'error',
    inputs: [],
  },
  {
    name: 'KeyAlreadyExists',
    type: 'error',
    inputs: [],
  },
] as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Derive an address from P256 public key coordinates.
 * Uses keccak256(encodePacked(x, y)) and takes last 20 bytes.
 *
 * @param publicKeyX - X coordinate as 32-byte hex string
 * @param publicKeyY - Y coordinate as 32-byte hex string
 * @returns Derived address
 */
export function deriveAddressFromP256(
  publicKeyX: `0x${string}`,
  publicKeyY: `0x${string}`
): Address {
  const hash = keccak256(encodePacked(['bytes32', 'bytes32'], [publicKeyX, publicKeyY]));
  // Take last 20 bytes (40 hex chars + 0x prefix)
  return `0x${hash.slice(-40)}` as Address;
}

/**
 * Convert signature type string to enum value.
 *
 * @param type - Signature type string
 * @returns SignatureType enum value
 */
export function parseSignatureType(type: string): SignatureType {
  switch (type.toLowerCase()) {
    case 'secp256k1':
      return SignatureType.Secp256k1;
    case 'p256':
      return SignatureType.P256;
    case 'webauthn':
      return SignatureType.WebAuthn;
    default:
      throw new Error(`Invalid signature type: ${type}`);
  }
}

// =============================================================================
// AccessKeyService Class
// =============================================================================

/**
 * Service for managing Tempo access keys (session keys).
 *
 * Provides methods for:
 * - Creating new access keys with spending limits
 * - Revoking access keys
 * - Querying key information and remaining limits
 * - Updating spending limits
 *
 * @example
 * ```typescript
 * const service = getAccessKeyService();
 *
 * // Get key info
 * const keyInfo = await service.getKeyInfo(accountAddress, keyId);
 *
 * // Check remaining limit
 * const limit = await service.getRemainingLimit(accountAddress, keyId, tokenAddress);
 *
 * // Revoke a key
 * const result = await service.revokeAccessKey(keyId);
 * ```
 */
export class AccessKeyService {
  private readonly client = getTempoClient();

  /**
   * Get the public client for read operations.
   */
  private get publicClient(): TempoPublicClient {
    return this.client['publicClient'];
  }

  /**
   * Get the fee token for transaction gas payment.
   */
  private get feeToken(): Address {
    return this.client['feeToken'];
  }

  // ===========================================================================
  // View Methods
  // ===========================================================================

  /**
   * Get information about an access key.
   *
   * Uses direct storage reads because the precompile's getKey() view function
   * has a bug that returns all zeros even for valid keys.
   *
   * Storage layout: keys[account][keyId] is a packed struct at:
   *   slot = keccak256(keyId . keccak256(account . 0))
   *
   * Packed format (right-aligned, 11 bytes):
   *   - signatureType: uint8 (1 byte)
   *   - expiry: uint64 (8 bytes)
   *   - enforceLimits: bool (1 byte)
   *   - isRevoked: bool (1 byte)
   *
   * @param account - The account that authorized the key
   * @param keyId - The key ID to query
   * @returns Key information or null if not found
   */
  async getKeyInfo(account: Address, keyId: Address): Promise<AccessKeyInfo | null> {
    try {
      // Compute storage slot: keccak256(keyId . keccak256(account . 0))
      const slot1 = keccak256(
        encodePacked(
          ['bytes32', 'bytes32'],
          [
            `0x${account.slice(2).toLowerCase().padStart(64, '0')}` as `0x${string}`,
            '0x0000000000000000000000000000000000000000000000000000000000000000',
          ]
        )
      );

      const slot2 = keccak256(
        encodePacked(
          ['bytes32', 'bytes32'],
          [
            `0x${keyId.slice(2).toLowerCase().padStart(64, '0')}` as `0x${string}`,
            slot1,
          ]
        )
      );

      // Read storage directly
      const storage = await this.publicClient.getStorageAt({
        address: ACCOUNT_KEYCHAIN_ADDRESS,
        slot: slot2,
      });

      // Check if slot is empty (key doesn't exist)
      if (!storage || storage === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return null;
      }

      // Decode packed storage (right-aligned)
      // Layout: [padding...][isRevoked:1][enforceLimits:1][expiry:8][signatureType:1]
      const storageHex = storage.slice(2);

      // Read from right to left
      const signatureType = parseInt(storageHex.slice(-2), 16);
      const expiryHex = storageHex.slice(-18, -2);
      const expiry = expiryHex ? parseInt(expiryHex, 16) : 0;
      const enforceLimits = parseInt(storageHex.slice(-20, -18), 16) === 1;
      const isRevoked = parseInt(storageHex.slice(-22, -20), 16) === 1;

      return {
        signatureType: signatureType as SignatureType,
        keyId: keyId,
        expiry,
        enforceLimits,
        isRevoked,
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (
        errorMessage.includes('KeyNotFound') ||
        errorMessage.includes('returned no data')
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get the remaining spending limit for a key-token pair.
   *
   * @param account - The account that authorized the key
   * @param keyId - The key ID
   * @param token - The TIP-20 token address
   * @returns Remaining spending limit (0 if no limit set or unlimited)
   */
  async getRemainingLimit(
    account: Address,
    keyId: Address,
    token: Address
  ): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: ACCOUNT_KEYCHAIN_ADDRESS,
      abi: ACCOUNT_KEYCHAIN_ABI,
      functionName: 'getRemainingLimit',
      args: [account, keyId, token],
    });

    return result as bigint;
  }

  // ===========================================================================
  // Write Methods
  // ===========================================================================

  /**
   * Revoke an access key.
   *
   * Revoked keys cannot be used for signing and cannot be re-authorized.
   * This operation must be signed by the Root Key.
   *
   * Uses Tempo transaction type (0x76) with proper root key signature
   * to ensure the precompile can identify the correct keychain.
   *
   * **IMPORTANT:** Keys created with `expiry: 0` (never expire) cannot be revoked.
   * The Tempo protocol requires `expiry > 0` for revocation to work.
   * Plan for key expiry when creating keys that may need to be revoked.
   *
   * @param keyId - The key ID to revoke
   * @returns Transaction result
   * @throws Error if the key has expiry=0 (KeyNotFound error)
   * @throws Error if wallet not configured or transaction fails
   */
  async revokeAccessKey(keyId: Address): Promise<KeyOperationResult> {
    try {
      // Encode the revokeKey function call
      const data = encodeFunctionData({
        abi: ACCOUNT_KEYCHAIN_ABI,
        functionName: 'revokeKey',
        args: [keyId],
      });

      // Send using Tempo transaction type (0x76) with root key signature
      const hash = await this.client.sendTempoTransaction({
        to: ACCOUNT_KEYCHAIN_ADDRESS,
        data,
        gas: 100_000n, // Conservative gas estimate for revoke operation
      });

      const receipt = await this.client.waitForTransaction(hash);

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('KeyNotFound') || errorMessage.includes('0x5f3f479c')) {
        throw BlockchainError.transactionReverted(
          `Access key not found or cannot be revoked: ${keyId}. ` +
            'Note: Keys created with expiry=0 (never expire) cannot be revoked. ' +
            'Use a non-zero expiry when creating keys that may need revocation.'
        );
      }
      if (errorMessage.includes('KeyAlreadyRevoked') || errorMessage.includes('0x469537f1')) {
        throw BlockchainError.transactionReverted(
          `Access key already revoked: ${keyId}.`
        );
      }
      if (errorMessage.includes('UnauthorizedCaller') || errorMessage.includes('0x5c427cd9')) {
        throw BlockchainError.transactionReverted(
          `Unauthorized: only the Root Key can revoke access keys.`
        );
      }
      throw error;
    }
  }

  /**
   * Update the spending limit for a key-token pair.
   *
   * This operation must be signed by the Root Key.
   *
   * Uses Tempo transaction type (0x76) with proper root key signature
   * to ensure the precompile can identify the correct keychain.
   *
   * **IMPORTANT:** Keys created with `expiry: 0` (never expire) may not support
   * spending limit updates. Use a non-zero expiry when creating keys.
   *
   * @param keyId - The key ID to update
   * @param token - The TIP-20 token address
   * @param newLimit - The new spending limit
   * @returns Transaction result
   * @throws Error if the key has expiry=0 (KeyNotFound error)
   * @throws Error if wallet not configured or transaction fails
   */
  async updateSpendingLimit(
    keyId: Address,
    token: Address,
    newLimit: bigint
  ): Promise<KeyOperationResult> {
    try {
      // Encode the updateSpendingLimit function call
      const data = encodeFunctionData({
        abi: ACCOUNT_KEYCHAIN_ABI,
        functionName: 'updateSpendingLimit',
        args: [keyId, token, newLimit],
      });

      // Send using Tempo transaction type (0x76) with root key signature
      const hash = await this.client.sendTempoTransaction({
        to: ACCOUNT_KEYCHAIN_ADDRESS,
        data,
        gas: 100_000n, // Conservative gas estimate for update operation
      });

      const receipt = await this.client.waitForTransaction(hash);

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('KeyNotFound') || errorMessage.includes('0x5f3f479c')) {
        throw BlockchainError.transactionReverted(
          `Access key not found: ${keyId}. The key may not exist or may have been revoked.`
        );
      }
      if (errorMessage.includes('KeyInactive') || errorMessage.includes('KeyRevoked')) {
        throw BlockchainError.transactionReverted(
          `Access key is inactive or revoked: ${keyId}.`
        );
      }
      if (errorMessage.includes('UnauthorizedCaller')) {
        throw BlockchainError.transactionReverted(
          `Unauthorized: only the Root Key can update spending limits.`
        );
      }
      throw error;
    }
  }

  /**
   * Authorize a new access key.
   *
   * Note: For full key authorization flow with P256 keys, use the tempo.ts SDK's
   * Account.signKeyAuthorization() method. This method provides direct access
   * to the precompile's authorizeKey function for lower-level control.
   *
   * @param keyId - The key ID (address derived from public key)
   * @param signatureType - The signature type (secp256k1, p256, webauthn)
   * @param expiry - Unix timestamp when key expires (0 = never)
   * @param enforceLimits - Whether to enforce spending limits
   * @param limits - Initial spending limits per token
   * @returns Transaction result
   * @throws Error if wallet not configured or transaction fails
   */
  async authorizeKey(
    keyId: Address,
    signatureType: SignatureType,
    expiry: number,
    enforceLimits: boolean,
    limits: TokenLimit[]
  ): Promise<KeyOperationResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    // Validate expiry
    if (expiry !== 0) {
      const now = Math.floor(Date.now() / 1000);
      if (expiry <= now) {
        throw new Error(`Expiry must be in the future or 0 (never). Got: ${expiry}`);
      }
    }

    try {
      // Convert limits to ABI format
      const abiLimits = limits.map((l) => ({
        token: l.token,
        amount: l.amount,
      }));

      const hash = await walletClient.writeContract({
        address: ACCOUNT_KEYCHAIN_ADDRESS,
        abi: ACCOUNT_KEYCHAIN_ABI,
        functionName: 'authorizeKey',
        args: [keyId, signatureType, BigInt(expiry), enforceLimits, abiLimits],
        feeToken: this.feeToken,
      } as Parameters<typeof walletClient.writeContract>[0]);

      const receipt = await this.client.waitForTransaction(hash);

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('KeyAlreadyExists')) {
        throw BlockchainError.transactionReverted(
          `Access key already exists: ${keyId}. ${errorMessage}`
        );
      }
      if (errorMessage.includes('InvalidSignatureType')) {
        throw BlockchainError.transactionReverted(
          `Invalid signature type: ${signatureType}. ${errorMessage}`
        );
      }
      if (errorMessage.includes('ZeroPublicKey')) {
        throw BlockchainError.transactionReverted(
          `Cannot authorize zero address as key. ${errorMessage}`
        );
      }
      if (errorMessage.includes('UnauthorizedCaller')) {
        throw BlockchainError.transactionReverted(
          `Unauthorized: only the Root Key can authorize new access keys. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  /**
   * Check if a key is active (exists, not revoked, not expired).
   *
   * @param account - The account that authorized the key
   * @param keyId - The key ID to check
   * @returns True if key is active
   */
  async isKeyActive(account: Address, keyId: Address): Promise<boolean> {
    const keyInfo = await this.getKeyInfo(account, keyId);

    if (!keyInfo) {
      return false;
    }

    if (keyInfo.isRevoked) {
      return false;
    }

    if (keyInfo.expiry !== 0) {
      const now = Math.floor(Date.now() / 1000);
      if (keyInfo.expiry <= now) {
        return false;
      }
    }

    return true;
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance cache */
let serviceInstance: AccessKeyService | null = null;

/**
 * Get or create the singleton AccessKeyService instance.
 *
 * @returns The shared AccessKeyService instance
 */
export function getAccessKeyService(): AccessKeyService {
  if (!serviceInstance) {
    serviceInstance = new AccessKeyService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton service instance.
 *
 * Primarily useful for testing scenarios.
 */
export function resetAccessKeyService(): void {
  serviceInstance = null;
}

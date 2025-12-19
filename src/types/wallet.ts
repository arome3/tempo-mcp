/**
 * Wallet Types
 *
 * Type definitions for the wallet management system.
 * Provides a unified interface for different key management strategies:
 * - Private key (development)
 * - Encrypted keystore (production)
 * - External signers like Turnkey (enterprise)
 */

import type { Address, TransactionSerializable } from 'viem';

// =============================================================================
// Wallet Manager Interface
// =============================================================================

/**
 * Unified interface for wallet operations.
 *
 * All wallet implementations (PrivateKeyWallet, KeystoreWallet, TurnkeyWallet)
 * must implement this interface, allowing the rest of the codebase to work
 * with any wallet type interchangeably.
 *
 * @example
 * ```typescript
 * const wallet = getWalletManager();
 *
 * // Get address
 * const address = wallet.getAddress();
 *
 * // Sign a transaction
 * const signedTx = await wallet.signTransaction(tx);
 *
 * // Get next nonce (auto-increments)
 * const nonce = await wallet.getNonce();
 * ```
 */
export interface WalletManager {
  /**
   * Get the wallet's address.
   *
   * @returns The wallet's Ethereum address
   */
  getAddress(): Address;

  /**
   * Sign a transaction.
   *
   * @param tx - The transaction to sign
   * @returns The signed transaction as a hex string
   */
  signTransaction(tx: TransactionSerializable): Promise<`0x${string}`>;

  /**
   * Sign a message.
   *
   * Uses EIP-191 personal_sign format.
   *
   * @param message - The message to sign
   * @returns The signature as a hex string
   */
  signMessage(message: string): Promise<`0x${string}`>;

  /**
   * Get the next nonce for this wallet.
   *
   * Nonces are managed internally to prevent conflicts.
   * Each call returns the current nonce and increments the internal counter.
   *
   * @returns The next available nonce
   */
  getNonce(): Promise<number>;

  /**
   * Reset the nonce to the on-chain value.
   *
   * Use this if transactions failed and nonces need to be resynchronized.
   */
  resetNonce(): Promise<void>;
}

// =============================================================================
// Wallet Creation Options
// =============================================================================

/**
 * Options for creating a private key wallet.
 */
export interface PrivateKeyWalletOptions {
  /** Private key as 0x-prefixed 64-character hex string */
  privateKey: `0x${string}`;
}

/**
 * Options for creating a keystore wallet.
 */
export interface KeystoreWalletOptions {
  /** Path to the encrypted keystore JSON file */
  keystorePath: string;
  /** Password to decrypt the keystore */
  password: string;
}

/**
 * Options for creating a Turnkey wallet.
 */
export interface TurnkeyWalletOptions {
  /** Turnkey organization ID */
  organizationId: string;
  /** Turnkey private key ID (not the actual private key) */
  privateKeyId: string;
  /** Turnkey API public key */
  apiPublicKey: string;
  /** Turnkey API private key */
  apiPrivateKey: string;
}

// =============================================================================
// Wallet Type Guards
// =============================================================================

/**
 * Check if a value is a valid private key format.
 *
 * @param value - The value to check
 * @returns True if the value is a valid 0x-prefixed 64-character hex string
 */
export function isValidPrivateKey(value: unknown): value is `0x${string}` {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('0x')) return false;
  if (value.length !== 66) return false; // 0x + 64 hex chars
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * Check if a value is a valid Ethereum address.
 *
 * @param value - The value to check
 * @returns True if the value is a valid 0x-prefixed 40-character hex string
 */
export function isValidAddress(value: unknown): value is Address {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('0x')) return false;
  if (value.length !== 42) return false; // 0x + 40 hex chars
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

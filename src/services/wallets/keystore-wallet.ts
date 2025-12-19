/**
 * Keystore Wallet
 *
 * Wallet implementation using an encrypted keystore file.
 * Recommended for production single-server deployments.
 *
 * Features:
 * - Key encrypted at rest using standard Ethereum keystore format
 * - Lazy decryption (only when first operation is performed)
 * - Delegates to PrivateKeyWallet after decryption
 */

import { readFileSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { decryptKeystoreSync, getJsonWalletAddress } from '@ethersproject/json-wallets';
import type { Address, TransactionSerializable } from 'viem';
import type { WalletManager } from '../../types/wallet.js';
import {
  SecurityError,
  SecurityErrorCodes,
  ValidationError,
  InternalError,
} from '../../utils/errors.js';
import { PrivateKeyWallet } from './private-key-wallet.js';

// =============================================================================
// Security Utilities
// =============================================================================

/**
 * Validate keystore path to prevent path traversal attacks.
 *
 * @param keystorePath - The path to validate
 * @returns The resolved absolute path
 * @throws Error if path is suspicious
 */
function validateKeystorePath(keystorePath: string): string {
  // Resolve to absolute path
  const resolvedPath = isAbsolute(keystorePath)
    ? keystorePath
    : resolve(process.cwd(), keystorePath);

  // Check for path traversal attempts (security violation)
  if (keystorePath.includes('..')) {
    throw new SecurityError(
      SecurityErrorCodes.UNAUTHORIZED,
      'Invalid keystore path: path traversal not allowed',
      {
        details: {
          field: 'keystorePath',
          suggestion: 'Use an absolute path or a relative path without ".." components',
        },
      }
    );
  }

  // Ensure it ends with .json
  if (!resolvedPath.endsWith('.json')) {
    throw ValidationError.custom(
      'keystorePath',
      'Keystore path must be a .json file',
      resolvedPath
    );
  }

  return resolvedPath;
}

// =============================================================================
// Keystore Wallet Implementation
// =============================================================================

/**
 * Wallet implementation using an encrypted keystore file.
 *
 * The keystore is decrypted on first use, and subsequent operations
 * are delegated to an internal PrivateKeyWallet instance.
 *
 * This provides better security than raw private keys:
 * - Key is encrypted at rest
 * - Password can be stored separately (env var, secrets manager)
 * - Standard Ethereum keystore format (compatible with geth, etc.)
 *
 * @example
 * ```typescript
 * const wallet = new KeystoreWallet('./keystore.json', 'password');
 *
 * // First operation triggers decryption
 * const address = await wallet.getAddress();
 * ```
 */
export class KeystoreWallet implements WalletManager {
  /** Path to the keystore file (validated) */
  private readonly keystorePath: string;

  /** Password to decrypt the keystore (cleared after use) */
  private password: string | null;

  /** Inner wallet (created after decryption) */
  private innerWallet: PrivateKeyWallet | null = null;

  /** Cached address (available after decryption) */
  private cachedAddress: Address | null = null;

  /** Whether decryption has been attempted */
  private decryptionAttempted = false;

  /**
   * Create a new keystore wallet.
   *
   * Note: Decryption is lazy - it happens on first operation.
   *
   * @param keystorePath - Path to the encrypted keystore JSON file
   * @param password - Password to decrypt the keystore
   * @throws Error if keystore path is invalid (path traversal attempt)
   */
  constructor(keystorePath: string, password: string) {
    // Validate path to prevent path traversal attacks
    this.keystorePath = validateKeystorePath(keystorePath);
    this.password = password;
  }

  /**
   * Ensure the keystore is decrypted and inner wallet is ready.
   *
   * This is called lazily on first operation.
   * Password is cleared from memory after successful decryption.
   *
   * @returns The decrypted PrivateKeyWallet
   * @throws Error if decryption fails
   */
  private async ensureUnlocked(): Promise<PrivateKeyWallet> {
    if (this.innerWallet) {
      return this.innerWallet;
    }

    // Prevent retry after failed attempt (rate limiting protection)
    if (this.decryptionAttempted && !this.innerWallet) {
      throw InternalError.unexpected(
        'Keystore decryption previously failed. Create a new wallet instance to retry.'
      );
    }

    // Check if password was already cleared
    if (this.password === null) {
      throw InternalError.unexpected(
        'Keystore already decrypted or password cleared.'
      );
    }

    this.decryptionAttempted = true;

    // Read keystore file
    let keystoreJson: string;
    try {
      keystoreJson = readFileSync(this.keystorePath, 'utf-8');
    } catch (error) {
      // Sanitize error message - don't expose full path
      throw InternalError.configurationError(
        'Failed to read keystore file. Check file exists and is readable.'
      );
    }

    // Decrypt keystore (using sync version since we're in async context anyway)
    let account: { privateKey: string; address: string };
    try {
      account = decryptKeystoreSync(keystoreJson, this.password);
    } catch (error) {
      // Don't clear password on failure - allow instance to be discarded
      throw InternalError.configurationError(
        'Failed to decrypt keystore. Check password and file format.'
      );
    }

    // SECURITY: Clear password from memory after successful decryption
    this.password = null;

    // Create inner wallet with decrypted private key
    const privateKey = account.privateKey as `0x${string}`;
    this.innerWallet = new PrivateKeyWallet(privateKey);
    this.cachedAddress = this.innerWallet.getAddress();

    return this.innerWallet;
  }

  /**
   * Get the wallet's address.
   *
   * Attempts to extract address from keystore without decryption.
   * If not possible, throws an error suggesting to call an async method.
   *
   * @returns The wallet's Ethereum address
   * @throws Error if address cannot be determined without decryption
   */
  getAddress(): Address {
    // If already decrypted, return cached address
    if (this.cachedAddress) {
      return this.cachedAddress;
    }

    // Try to extract address from keystore without full decryption
    try {
      const keystoreJson = readFileSync(this.keystorePath, 'utf-8');
      const address = getJsonWalletAddress(keystoreJson);
      if (address) {
        this.cachedAddress = address as Address;
        return this.cachedAddress;
      }
    } catch {
      // Fall through - will need full decryption
      // Don't expose file read errors
    }

    throw InternalError.unexpected(
      'Keystore address not available. Call an async method first to trigger decryption.'
    );
  }

  /**
   * Sign a transaction.
   *
   * @param tx - The transaction to sign
   * @returns The signed transaction as a hex string
   */
  async signTransaction(tx: TransactionSerializable): Promise<`0x${string}`> {
    const wallet = await this.ensureUnlocked();
    return wallet.signTransaction(tx);
  }

  /**
   * Sign a message using EIP-191 personal_sign.
   *
   * @param message - The message to sign
   * @returns The signature as a hex string
   */
  async signMessage(message: string): Promise<`0x${string}`> {
    const wallet = await this.ensureUnlocked();
    return wallet.signMessage(message);
  }

  /**
   * Get the next nonce for this wallet.
   *
   * @returns The next available nonce
   */
  async getNonce(): Promise<number> {
    const wallet = await this.ensureUnlocked();
    return wallet.getNonce();
  }

  /**
   * Reset the nonce to the on-chain value.
   */
  async resetNonce(): Promise<void> {
    const wallet = await this.ensureUnlocked();
    await wallet.resetNonce();
  }
}

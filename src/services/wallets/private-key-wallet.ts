/**
 * Private Key Wallet
 *
 * Simple wallet implementation using a private key directly.
 * Suitable for development and testing environments.
 *
 * Security Note:
 * - Private key is held in memory
 * - Use keystore or external signer for production
 */

import {
  privateKeyToAccount,
  type PrivateKeyAccount,
} from 'viem/accounts';
import type { Address, TransactionSerializable } from 'viem';
import type { WalletManager } from '../../types/wallet.js';
import { ValidationError } from '../../utils/errors.js';
import { nonceManager } from '../nonce-manager.js';

// =============================================================================
// Private Key Wallet Implementation
// =============================================================================

/**
 * Wallet implementation using a raw private key.
 *
 * This is the simplest wallet type, holding the private key directly in memory.
 * Best suited for development, testing, or single-server deployments.
 *
 * For production environments, consider using:
 * - KeystoreWallet for encrypted key storage
 * - TurnkeyWallet for external key management
 *
 * @example
 * ```typescript
 * const wallet = new PrivateKeyWallet('0x...');
 *
 * // Get address
 * const address = wallet.getAddress();
 *
 * // Sign transaction
 * const signedTx = await wallet.signTransaction(tx);
 * ```
 */
export class PrivateKeyWallet implements WalletManager {
  /** The viem account derived from the private key */
  private readonly account: PrivateKeyAccount;

  /**
   * Create a new private key wallet.
   *
   * @param privateKey - The private key as a 0x-prefixed hex string
   * @throws Error if private key format is invalid
   */
  constructor(privateKey: `0x${string}`) {
    // Validate private key format
    if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
      throw ValidationError.custom(
        'privateKey',
        'Invalid private key format. Must be 0x-prefixed 64-character hex string.',
        `${privateKey.slice(0, 6)}...`
      );
    }

    this.account = privateKeyToAccount(privateKey);
  }

  /**
   * Get the wallet's address.
   *
   * @returns The wallet's Ethereum address
   */
  getAddress(): Address {
    return this.account.address;
  }

  /**
   * Sign a transaction.
   *
   * @param tx - The transaction to sign
   * @returns The signed transaction as a hex string
   */
  async signTransaction(tx: TransactionSerializable): Promise<`0x${string}`> {
    return this.account.signTransaction(tx);
  }

  /**
   * Sign a message using EIP-191 personal_sign.
   *
   * @param message - The message to sign
   * @returns The signature as a hex string
   */
  async signMessage(message: string): Promise<`0x${string}`> {
    return this.account.signMessage({ message });
  }

  /**
   * Get the next nonce for this wallet.
   *
   * Uses the NonceManager to track and increment nonces.
   *
   * @returns The next available nonce
   */
  async getNonce(): Promise<number> {
    return nonceManager.getNextNonce(this.account.address);
  }

  /**
   * Reset the nonce to the on-chain value.
   *
   * Call this if transactions failed and nonces need resynchronization.
   */
  async resetNonce(): Promise<void> {
    await nonceManager.reset(this.account.address);
  }
}

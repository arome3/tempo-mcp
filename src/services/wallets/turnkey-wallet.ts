/**
 * Turnkey Wallet
 *
 * Wallet implementation using Turnkey external signing service.
 * Recommended for enterprise deployments requiring maximum security.
 *
 * Features:
 * - Private key never leaves Turnkey's secure enclave
 * - Built-in audit trail and policy enforcement
 * - Multi-sig and approval workflows supported
 * - Hardware security module (HSM) backing
 * @see https://docs.turnkey.com for Turnkey documentation
 */

import { Turnkey } from '@turnkey/sdk-server';
import { createAccount } from '@turnkey/viem';
import type { Address, TransactionSerializable, LocalAccount } from 'viem';
import type { WalletManager } from '../../types/wallet.js';
import { InternalError } from '../../utils/errors.js';
import { nonceManager } from '../nonce-manager.js';

// =============================================================================
// Turnkey Wallet Implementation
// =============================================================================

/**
 * Wallet implementation using Turnkey's external signing service.
 *
 * Turnkey provides enterprise-grade key management where the private key
 * never leaves their secure infrastructure. Operations are signed within
 * Turnkey's secure enclave.
 *
 * This is the recommended approach for:
 * - Enterprise deployments
 * - Multi-signature requirements
 * - Compliance and audit requirements
 * - High-value transactions
 *
 * @example
 * ```typescript
 * const wallet = new TurnkeyWallet({
 *   organizationId: 'your-org-id',
 *   privateKeyId: 'your-key-id',
 *   apiPublicKey: 'your-api-public-key',
 *   apiPrivateKey: 'your-api-private-key',
 * });
 *
 * // First operation initializes connection
 * const address = await wallet.getAddress();
 * ```
 */
export class TurnkeyWallet implements WalletManager {
  /** Turnkey SDK client */
  private readonly turnkey: Turnkey;

  /** Turnkey organization ID */
  private readonly organizationId: string;

  /** Turnkey private key ID (not the actual private key) */
  private readonly privateKeyId: string;

  /** Cached viem account (created lazily) */
  private account: LocalAccount | null = null;

  /** Cached address */
  private cachedAddress: Address | null = null;

  /**
   * Create a new Turnkey wallet.
   *
   * @param options - Turnkey configuration options
   */
  constructor(options: {
    organizationId: string;
    privateKeyId: string;
    apiPublicKey: string;
    apiPrivateKey: string;
    apiBaseUrl?: string;
  }) {
    this.organizationId = options.organizationId;
    this.privateKeyId = options.privateKeyId;

    this.turnkey = new Turnkey({
      apiBaseUrl: options.apiBaseUrl ?? 'https://api.turnkey.com',
      apiPublicKey: options.apiPublicKey,
      apiPrivateKey: options.apiPrivateKey,
      defaultOrganizationId: options.organizationId,
    });
  }

  /**
   * Ensure the Turnkey account is initialized.
   *
   * Creates a viem-compatible account using Turnkey's signing infrastructure.
   *
   * @returns The initialized viem account
   */
  private async ensureAccount(): Promise<LocalAccount> {
    if (this.account) {
      return this.account;
    }

    // Create viem account using Turnkey
    this.account = await createAccount({
      client: this.turnkey.apiClient(),
      organizationId: this.organizationId,
      signWith: this.privateKeyId,
    });

    this.cachedAddress = this.account.address;
    return this.account;
  }

  /**
   * Get the wallet's address.
   *
   * Note: First call may be async as it initializes the Turnkey connection.
   * Subsequent calls return the cached address.
   *
   * @returns The wallet's Ethereum address
   * @throws Error if not yet initialized (call an async method first)
   */
  getAddress(): Address {
    if (this.cachedAddress) {
      return this.cachedAddress;
    }

    throw InternalError.unexpected(
      'Turnkey wallet not initialized. Call an async method first.'
    );
  }

  /**
   * Get the wallet address asynchronously.
   *
   * This initializes the Turnkey connection if needed.
   *
   * @returns The wallet's Ethereum address
   */
  async getAddressAsync(): Promise<Address> {
    const account = await this.ensureAccount();
    return account.address;
  }

  /**
   * Sign a transaction.
   *
   * The transaction is signed within Turnkey's secure enclave.
   * The private key never leaves Turnkey's infrastructure.
   *
   * @param tx - The transaction to sign
   * @returns The signed transaction as a hex string
   */
  async signTransaction(tx: TransactionSerializable): Promise<`0x${string}`> {
    const account = await this.ensureAccount();
    return account.signTransaction(tx);
  }

  /**
   * Sign a message using EIP-191 personal_sign.
   *
   * @param message - The message to sign
   * @returns The signature as a hex string
   */
  async signMessage(message: string): Promise<`0x${string}`> {
    const account = await this.ensureAccount();
    return account.signMessage({ message });
  }

  /**
   * Get the next nonce for this wallet.
   *
   * Uses the NonceManager for tracking.
   *
   * @returns The next available nonce
   */
  async getNonce(): Promise<number> {
    const address = await this.getAddressAsync();
    return nonceManager.getNextNonce(address);
  }

  /**
   * Reset the nonce to the on-chain value.
   */
  async resetNonce(): Promise<void> {
    const address = await this.getAddressAsync();
    await nonceManager.reset(address);
  }
}

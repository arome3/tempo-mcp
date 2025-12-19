/**
 * Wallet Manager
 *
 * Factory and singleton management for wallet instances.
 * Creates the appropriate wallet type based on configuration.
 *
 * Supported wallet types:
 * - privateKey: Simple wallet using raw private key (development)
 * - keystore: Encrypted keystore file (production)
 * - external: External signing service like Turnkey (enterprise)
 */

import type { WalletManager } from '../types/wallet.js';
import { getConfig } from '../config/index.js';
import { InternalError, ValidationError } from '../utils/errors.js';
import { PrivateKeyWallet } from './wallets/private-key-wallet.js';
import { KeystoreWallet } from './wallets/keystore-wallet.js';
import { TurnkeyWallet } from './wallets/turnkey-wallet.js';

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton wallet instance */
let walletInstance: WalletManager | null = null;

/**
 * Get or create the singleton WalletManager instance.
 *
 * Creates the appropriate wallet type based on configuration:
 * - `privateKey`: Uses TEMPO_PRIVATE_KEY environment variable
 * - `keystore`: Uses TEMPO_KEYSTORE_PATH and TEMPO_KEYSTORE_PASSWORD
 * - `external`: Uses external signer configuration (Turnkey, etc.)
 *
 * The wallet is lazily initialized on first call and cached for
 * subsequent calls. Use resetWalletManager() to force re-initialization.
 *
 * @returns The shared WalletManager instance
 * @throws Error if wallet configuration is invalid or missing
 *
 * @example
 * ```typescript
 * // Get the wallet (creates based on config)
 * const wallet = getWalletManager();
 *
 * // Use it
 * const address = wallet.getAddress();
 * const signedTx = await wallet.signTransaction(tx);
 * ```
 */
export function getWalletManager(): WalletManager {
  if (walletInstance) {
    return walletInstance;
  }

  const config = getConfig();
  const walletConfig = config.wallet;

  switch (walletConfig.type) {
    case 'privateKey':
      walletInstance = createPrivateKeyWallet(walletConfig.privateKey);
      break;

    case 'keystore':
      walletInstance = createKeystoreWallet(
        walletConfig.keystorePath,
        walletConfig.keystorePassword
      );
      break;

    case 'external':
      walletInstance = createExternalWallet(walletConfig.externalSigner);
      break;

    default:
      throw InternalError.configurationError(
        `Unknown wallet type: ${walletConfig.type}. ` +
          'Valid types are: privateKey, keystore, external'
      );
  }

  return walletInstance;
}

/**
 * Reset the singleton wallet instance.
 *
 * Primarily useful for testing scenarios where you need to
 * reinitialize the wallet with different configuration.
 */
export function resetWalletManager(): void {
  walletInstance = null;
}

// =============================================================================
// Wallet Factory Functions
// =============================================================================

/**
 * Create a PrivateKeyWallet from configuration.
 */
function createPrivateKeyWallet(privateKey: string | undefined): WalletManager {
  if (!privateKey) {
    throw InternalError.walletNotConfigured();
  }

  // Validate format
  if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
    throw ValidationError.custom(
      'privateKey',
      'Invalid private key format. Must be 0x-prefixed 64-character hex string.',
      `${privateKey.slice(0, 6)}...`
    );
  }

  return new PrivateKeyWallet(privateKey as `0x${string}`);
}

/**
 * Create a KeystoreWallet from configuration.
 */
function createKeystoreWallet(
  keystorePath: string | undefined,
  keystorePassword: string | undefined
): WalletManager {
  if (!keystorePath) {
    throw InternalError.configurationError(
      'Keystore path not configured. Set TEMPO_KEYSTORE_PATH environment variable.'
    );
  }

  if (!keystorePassword) {
    throw InternalError.configurationError(
      'Keystore password not configured. Set TEMPO_KEYSTORE_PASSWORD environment variable.'
    );
  }

  return new KeystoreWallet(keystorePath, keystorePassword);
}

/**
 * Create an external signer wallet from configuration.
 */
function createExternalWallet(
  externalSigner: { type: 'turnkey' | 'fireblocks'; config: Record<string, unknown> } | undefined
): WalletManager {
  if (!externalSigner) {
    throw InternalError.configurationError(
      'External signer not configured. Check your configuration file or environment variables.'
    );
  }

  switch (externalSigner.type) {
    case 'turnkey':
      return createTurnkeyWallet(externalSigner.config);

    case 'fireblocks':
      throw InternalError.unexpected(
        'Fireblocks signer not yet implemented. Use Turnkey or contribute an implementation!'
      );

    default:
      throw InternalError.configurationError(
        `Unknown external signer type: ${externalSigner.type}. ` +
          'Valid types are: turnkey, fireblocks'
      );
  }
}

/**
 * Create a TurnkeyWallet from configuration.
 */
function createTurnkeyWallet(config: Record<string, unknown>): WalletManager {
  const organizationId = config.organizationId as string | undefined;
  const privateKeyId = config.privateKeyId as string | undefined;
  const apiPublicKey = config.apiPublicKey as string | undefined;
  const apiPrivateKey = config.apiPrivateKey as string | undefined;
  const apiBaseUrl = config.apiBaseUrl as string | undefined;

  if (!organizationId) {
    throw InternalError.configurationError(
      'Turnkey organizationId not configured. Set it in external signer config.'
    );
  }

  if (!privateKeyId) {
    throw InternalError.configurationError(
      'Turnkey privateKeyId not configured. Set it in external signer config.'
    );
  }

  if (!apiPublicKey) {
    throw InternalError.configurationError(
      'Turnkey apiPublicKey not configured. Set it in external signer config.'
    );
  }

  if (!apiPrivateKey) {
    throw InternalError.configurationError(
      'Turnkey apiPrivateKey not configured. Set it in external signer config.'
    );
  }

  return new TurnkeyWallet({
    organizationId,
    privateKeyId,
    apiPublicKey,
    apiPrivateKey,
    apiBaseUrl,
  });
}

// =============================================================================
// Re-exports
// =============================================================================

// Export types
export type { WalletManager } from '../types/wallet.js';

// Export wallet implementations for direct use
export { PrivateKeyWallet } from './wallets/private-key-wallet.js';
export { KeystoreWallet } from './wallets/keystore-wallet.js';
export { TurnkeyWallet } from './wallets/turnkey-wallet.js';

// Export nonce manager
export { nonceManager, NonceManager } from './nonce-manager.js';

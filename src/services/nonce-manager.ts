/**
 * Nonce Manager
 *
 * Manages transaction nonces to prevent conflicts and ensure correct ordering.
 * Nonces are tracked per address and auto-incremented when requested.
 *
 * Features:
 * - In-memory nonce tracking per address
 * - Automatic chain synchronization on first use
 * - Pending transaction tracking for conflict detection
 * - Support for nonce reset when transactions fail
 */

import {
  createClient,
  http,
  publicActions,
  type Address,
  type Client,
  type Transport,
  type PublicActions,
} from 'viem';
import { tempo } from 'tempo.ts/chains';
import { getConfig } from '../config/index.js';
import { InternalError } from '../utils/errors.js';

// =============================================================================
// Types
// =============================================================================

/** Type for the tempo chain configuration */
type TempoChain = ReturnType<typeof tempo>;

/** Type for public client with public actions */
type TempoPublicClient = Client<Transport, TempoChain> &
  PublicActions<Transport, TempoChain>;

// =============================================================================
// Nonce Manager Class
// =============================================================================

/**
 * Manages transaction nonces for blockchain operations.
 *
 * Keeps track of nonces in memory and synchronizes with the chain
 * when needed. Ensures that transactions are submitted with correct
 * sequential nonces.
 *
 * @example
 * ```typescript
 * // Get next nonce for an address
 * const nonce = await nonceManager.getNextNonce(address);
 *
 * // Mark as pending while transaction is in-flight
 * nonceManager.markPending(address, nonce);
 *
 * // After confirmation
 * nonceManager.markConfirmed(address, nonce);
 * ```
 */
export class NonceManager {
  /** Tracked nonces per address (next nonce to use) */
  private nonces: Map<Address, number> = new Map();

  /** Pending (in-flight) transactions per address */
  private pending: Map<Address, Set<number>> = new Map();

  /** Cached public client for chain queries */
  private publicClient: TempoPublicClient | null = null;

  /**
   * Get or create a public client for chain queries.
   *
   * Lazily creates a lightweight viem client for nonce queries.
   * Uses the same RPC configuration as the main TempoClient.
   */
  private getPublicClient(): TempoPublicClient {
    if (this.publicClient) {
      return this.publicClient;
    }

    const config = getConfig();

    // Resolve fee token for tempo chain configuration
    const feeTokenAddress = config.tokens.aliases[config.tokens.default];
    if (!feeTokenAddress) {
      throw InternalError.configurationError(
        `Fee token '${config.tokens.default}' not found in token aliases. ` +
          'Add it to tokens.aliases in your configuration.'
      );
    }

    const chain = tempo({
      feeToken: feeTokenAddress as Address,
    });

    this.publicClient = createClient({
      chain,
      transport: http(config.network.rpcUrl),
    }).extend(publicActions) as TempoPublicClient;

    return this.publicClient;
  }

  /**
   * Get the next nonce for an address.
   *
   * If no nonce is tracked for this address, fetches from chain.
   * Each call returns the current nonce and increments the internal counter.
   *
   * @param address - The wallet address
   * @returns The next available nonce
   */
  async getNextNonce(address: Address): Promise<number> {
    // If we have a tracked nonce, use it
    if (this.nonces.has(address)) {
      const nonce = this.nonces.get(address)!;
      this.nonces.set(address, nonce + 1);
      return nonce;
    }

    // Otherwise, fetch from chain
    const client = this.getPublicClient();
    const chainNonce = await client.getTransactionCount({
      address,
      blockTag: 'pending', // Include pending transactions
    });

    // Store next nonce
    this.nonces.set(address, chainNonce + 1);
    return chainNonce;
  }

  /**
   * Mark a nonce as pending (in-flight).
   *
   * Use this after submitting a transaction to track it.
   *
   * @param address - The wallet address
   * @param nonce - The nonce that was used
   */
  markPending(address: Address, nonce: number): void {
    if (!this.pending.has(address)) {
      this.pending.set(address, new Set());
    }
    this.pending.get(address)!.add(nonce);
  }

  /**
   * Mark a nonce as confirmed.
   *
   * Call this after a transaction has been confirmed.
   *
   * @param address - The wallet address
   * @param nonce - The nonce that was confirmed
   */
  markConfirmed(address: Address, nonce: number): void {
    this.pending.get(address)?.delete(nonce);
  }

  /**
   * Check if there are pending transactions for an address.
   *
   * @param address - The wallet address
   * @returns True if there are pending transactions
   */
  hasPending(address: Address): boolean {
    const pendingSet = this.pending.get(address);
    return pendingSet !== undefined && pendingSet.size > 0;
  }

  /**
   * Get pending nonces for an address.
   *
   * @param address - The wallet address
   * @returns Array of pending nonces
   */
  getPendingNonces(address: Address): number[] {
    const pendingSet = this.pending.get(address);
    return pendingSet ? Array.from(pendingSet) : [];
  }

  /**
   * Reset nonce tracking for an address.
   *
   * Call this if transactions failed and you need to resynchronize
   * with the chain state.
   *
   * @param address - The wallet address to reset
   */
  async reset(address: Address): Promise<void> {
    this.nonces.delete(address);
    this.pending.delete(address);
  }

  /**
   * Reset all nonce tracking.
   *
   * Clears all tracked nonces and pending transactions.
   * Useful for testing or when switching networks.
   */
  resetAll(): void {
    this.nonces.clear();
    this.pending.clear();
    this.publicClient = null;
  }

  /**
   * Force synchronization with the chain.
   *
   * Fetches the current nonce from the chain and updates tracking.
   *
   * @param address - The wallet address to sync
   * @returns The current chain nonce
   */
  async syncWithChain(address: Address): Promise<number> {
    const client = this.getPublicClient();
    const chainNonce = await client.getTransactionCount({
      address,
      blockTag: 'pending',
    });

    this.nonces.set(address, chainNonce);
    return chainNonce;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Singleton nonce manager instance.
 *
 * Use this instance for all nonce management operations.
 *
 * @example
 * ```typescript
 * import { nonceManager } from './nonce-manager.js';
 *
 * const nonce = await nonceManager.getNextNonce(address);
 * ```
 */
export const nonceManager = new NonceManager();

/**
 * Concurrent Transaction Service
 *
 * Handles parallel transaction execution using Tempo's nonceKey feature.
 * Each nonceKey (0-255) maintains an independent nonce sequence, allowing
 * up to 256 transactions to execute simultaneously without sequential
 * confirmation waiting.
 *
 * Key features:
 * - Query nonce for specific nonceKey via Tempo RPC extension
 * - Send multiple payments in parallel using different nonceKeys
 * - Auto-chunking for large batches to avoid RPC rate limits
 * - Graceful handling of partial failures
 */

import {
  type Address,
  type Hash,
  type Hex,
  encodeFunctionData,
  createClient,
  http,
  publicActions,
  type Client,
  type Transport,
  type PublicActions,
} from 'viem';
import { tempo } from 'tempo.ts/chains';
import { Actions } from 'tempo.ts/viem';
import {
  getTempoClient,
  TIP20_ABI,
  type TempoClient,
} from './tempo-client.js';
import { getConfig } from '../config/index.js';
import { InternalError, ValidationError } from '../utils/errors.js';

// =============================================================================
// Types
// =============================================================================

/** Type for the tempo chain configuration */
type TempoChain = ReturnType<typeof tempo>;

/** Type for public client with public actions */
type TempoPublicClient = Client<Transport, TempoChain> &
  PublicActions<Transport, TempoChain>;

/**
 * Single payment in a concurrent batch.
 */
export interface ConcurrentPayment {
  /** TIP-20 token address */
  token: Address;
  /** Recipient address */
  to: Address;
  /** Amount in wei */
  amount: bigint;
  /** Optional 32-byte memo for reconciliation */
  memo?: Hex;
  /** Token symbol (for display) */
  tokenSymbol?: string;
}

/**
 * Result of a single concurrent transaction.
 */
export interface ConcurrentTransactionResult {
  /** NonceKey used for this transaction */
  nonceKey: number;
  /** Transaction hash (null if failed before submission) */
  hash: Hash | null;
  /** Transaction status */
  status: 'confirmed' | 'pending' | 'failed';
  /** Error message if failed */
  error?: string;
}

/**
 * Result of the full concurrent payment operation.
 */
export interface ConcurrentPaymentsResult {
  /** Overall success (true if no failures) */
  success: boolean;
  /** Total number of payments attempted */
  totalPayments: number;
  /** Number of confirmed payments */
  confirmedPayments: number;
  /** Number of failed payments */
  failedPayments: number;
  /** Number of pending payments (if not waiting) */
  pendingPayments: number;
  /** Individual transaction results */
  results: ConcurrentTransactionResult[];
  /** Total duration in milliseconds */
  durationMs: number;
  /** Number of chunks processed (for large batches) */
  chunksProcessed: number;
}

/**
 * Active nonce key information.
 */
export interface NonceKeyInfo {
  /** The nonce key (0-255) */
  key: number;
  /** Current nonce value for this key */
  nonce: bigint;
}

// =============================================================================
// Concurrent Service Class
// =============================================================================

/**
 * Service for executing concurrent transactions.
 *
 * Uses Tempo's nonceKey parameter to enable parallel transaction execution.
 * Each nonceKey maintains an independent nonce sequence, eliminating the
 * sequential confirmation bottleneck of standard EVM transactions.
 *
 * @example
 * ```typescript
 * const service = getConcurrentService();
 *
 * // Send 10 payments in parallel
 * const result = await service.sendConcurrentPayments([
 *   { token: tokenAddress, to: recipient1, amount: 100n },
 *   { token: tokenAddress, to: recipient2, amount: 200n },
 *   // ... 8 more
 * ], 1, true);
 *
 * // All 10 confirm in ~3 seconds instead of ~30 seconds!
 * ```
 */
export class ConcurrentService {
  private client: TempoClient;
  private publicClient: TempoPublicClient | null = null;

  constructor() {
    this.client = getTempoClient();
  }

  /**
   * Get or create a public client for nonce queries.
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

  // ===========================================================================
  // Nonce Query Methods
  // ===========================================================================

  /**
   * Get the current nonce for a specific nonceKey.
   *
   * Uses Tempo's nonce precompile to query the nonce for a specific key.
   * NonceKey 0 is reserved for protocol nonces (standard sequential transactions).
   * NonceKeys 1-255 are available for parallel transaction execution.
   *
   * @param nonceKey - The nonce key to query (0-255)
   * @param address - Optional address to query (defaults to wallet)
   * @returns The current nonce for that key
   */
  async getNonceForKey(nonceKey: number, address?: Address): Promise<bigint> {
    // Validate nonceKey range
    if (nonceKey < 0 || nonceKey > 255) {
      throw ValidationError.custom(
        'nonceKey',
        'Nonce key must be between 0 and 255',
        String(nonceKey)
      );
    }

    const targetAddress = address ?? this.client.getAddress();
    const publicClient = this.getPublicClient();

    // NonceKey 0 uses standard eth_getTransactionCount (protocol nonce)
    if (nonceKey === 0) {
      const nonce = await publicClient.getTransactionCount({
        address: targetAddress,
        blockTag: 'pending',
      });
      return BigInt(nonce);
    }

    // NonceKeys 1-255 use Tempo's nonce precompile
    const nonce = await Actions.nonce.getNonce(publicClient, {
      account: targetAddress,
      nonceKey: BigInt(nonceKey),
    });

    return nonce;
  }

  /**
   * List all active nonce keys (keys with nonce > 0).
   *
   * Scans all 256 possible keys in parallel and returns those
   * that have been used (nonce > 0).
   *
   * @param address - Optional address to query (defaults to wallet)
   * @returns Array of active nonce keys with their current nonces
   */
  async listActiveNonceKeys(address?: Address): Promise<NonceKeyInfo[]> {
    const targetAddress = address ?? this.client.getAddress();
    const activeKeys: NonceKeyInfo[] = [];

    // Query all 256 keys in parallel batches to avoid overwhelming RPC
    const BATCH_SIZE = 32;
    const batches: number[][] = [];

    for (let i = 0; i < 256; i += BATCH_SIZE) {
      batches.push(
        Array.from({ length: Math.min(BATCH_SIZE, 256 - i) }, (_, j) => i + j)
      );
    }

    for (const batch of batches) {
      const promises = batch.map(async (key) => {
        const nonce = await this.getNonceForKey(key, targetAddress);
        return { key, nonce };
      });

      const results = await Promise.all(promises);
      activeKeys.push(...results.filter(({ nonce }) => nonce > 0n));
    }

    return activeKeys;
  }

  // ===========================================================================
  // Concurrent Payment Methods
  // ===========================================================================

  /**
   * Send multiple payments concurrently using different nonce keys.
   *
   * Each payment is assigned a unique nonceKey starting from startNonceKey,
   * allowing all payments to execute in parallel without waiting for
   * sequential confirmation.
   *
   * For large batches (> chunkSize), payments are processed in chunks
   * with a delay between chunks to avoid RPC rate limits.
   *
   * @param payments - Array of payments to send
   * @param startNonceKey - Starting nonce key (default: 1, reserving 0 for sequential)
   * @param waitForConfirmation - Wait for all confirmations (default: true)
   * @returns Combined result of all payments
   */
  async sendConcurrentPayments(
    payments: ConcurrentPayment[],
    startNonceKey: number = 1,
    waitForConfirmation: boolean = true
  ): Promise<ConcurrentPaymentsResult> {
    const config = getConfig();
    const startTime = Date.now();

    // Validate inputs
    if (payments.length === 0) {
      throw ValidationError.missingField('payments');
    }

    // Validate startNonceKey range first (before checking payment count)
    if (startNonceKey < 0 || startNonceKey > 255) {
      throw ValidationError.custom(
        'startNonceKey',
        'Start nonce key must be between 0 and 255',
        String(startNonceKey)
      );
    }

    if (payments.length > 256 - startNonceKey) {
      throw ValidationError.custom(
        'payments',
        `Cannot send ${payments.length} payments starting at key ${startNonceKey}. ` +
          `Max ${256 - startNonceKey} payments available with this start key.`,
        `${payments.length} payments, startKey=${startNonceKey}`
      );
    }

    // Get chunk configuration
    const chunkSize = config.advanced.concurrentChunkSize ?? 50;
    const chunkDelayMs = config.advanced.concurrentChunkDelay ?? 500;

    // Process in chunks if needed
    if (payments.length > chunkSize) {
      return this.sendLargeBatch(
        payments,
        startNonceKey,
        waitForConfirmation,
        chunkSize,
        chunkDelayMs,
        startTime
      );
    }

    // Process single chunk
    const results = await this.sendChunk(
      payments,
      startNonceKey,
      waitForConfirmation
    );

    const confirmedPayments = results.filter(
      (r) => r.status === 'confirmed'
    ).length;
    const failedPayments = results.filter((r) => r.status === 'failed').length;
    const pendingPayments = results.filter(
      (r) => r.status === 'pending'
    ).length;

    return {
      success: failedPayments === 0,
      totalPayments: payments.length,
      confirmedPayments,
      failedPayments,
      pendingPayments,
      results,
      durationMs: Date.now() - startTime,
      chunksProcessed: 1,
    };
  }

  /**
   * Send a large batch of payments in chunks.
   *
   * @private
   */
  private async sendLargeBatch(
    payments: ConcurrentPayment[],
    startNonceKey: number,
    waitForConfirmation: boolean,
    chunkSize: number,
    chunkDelayMs: number,
    startTime: number
  ): Promise<ConcurrentPaymentsResult> {
    const allResults: ConcurrentTransactionResult[] = [];
    let chunksProcessed = 0;

    // Split into chunks
    for (let i = 0; i < payments.length; i += chunkSize) {
      const chunk = payments.slice(i, i + chunkSize);
      const chunkStartKey = startNonceKey + i;

      const results = await this.sendChunk(
        chunk,
        chunkStartKey,
        waitForConfirmation
      );
      allResults.push(...results);
      chunksProcessed++;

      // Delay between chunks to avoid RPC rate limits
      if (i + chunkSize < payments.length) {
        await new Promise((resolve) => setTimeout(resolve, chunkDelayMs));
      }
    }

    const confirmedPayments = allResults.filter(
      (r) => r.status === 'confirmed'
    ).length;
    const failedPayments = allResults.filter(
      (r) => r.status === 'failed'
    ).length;
    const pendingPayments = allResults.filter(
      (r) => r.status === 'pending'
    ).length;

    return {
      success: failedPayments === 0,
      totalPayments: payments.length,
      confirmedPayments,
      failedPayments,
      pendingPayments,
      results: allResults,
      durationMs: Date.now() - startTime,
      chunksProcessed,
    };
  }

  /**
   * Send a single chunk of concurrent payments.
   *
   * Each payment is assigned a unique nonceKey. We query the current nonce
   * for each key from Tempo's nonce precompile, then send transactions
   * in parallel with explicit nonces.
   *
   * @private
   */
  private async sendChunk(
    payments: ConcurrentPayment[],
    startNonceKey: number,
    waitForConfirmation: boolean
  ): Promise<ConcurrentTransactionResult[]> {
    // Fetch current nonces for all keys in parallel using the nonce precompile
    // This is required because the SDK doesn't auto-query nonces for nonceKeys
    const noncePromises = payments.map((_, index) =>
      this.getNonceForKey(startNonceKey + index)
    );
    const nonces = await Promise.all(noncePromises);

    // Build and submit all transactions in parallel
    const txPromises = payments.map(async (payment, index) => {
      const nonceKey = startNonceKey + index;
      const nonce = nonces[index];

      try {
        // Build transfer data
        const data = payment.memo
          ? encodeFunctionData({
              abi: TIP20_ABI,
              functionName: 'transferWithMemo',
              args: [payment.to, payment.amount, payment.memo],
            })
          : encodeFunctionData({
              abi: TIP20_ABI,
              functionName: 'transfer',
              args: [payment.to, payment.amount],
            });

        // Send with specific nonceKey and queried nonce
        const hash = await this.client.sendConcurrentTransaction({
          to: payment.token,
          data,
          value: 0n,
          nonceKey,
          nonce: Number(nonce),
        });

        return { nonceKey, hash, status: 'pending' as const };
      } catch (error) {
        return {
          nonceKey,
          hash: null,
          status: 'failed' as const,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    // Submit all transactions in parallel
    const submissions = await Promise.all(txPromises);

    // Optionally wait for confirmations
    if (waitForConfirmation) {
      const confirmPromises = submissions.map(async (result) => {
        if (result.status === 'failed' || !result.hash) {
          return result;
        }

        try {
          await this.client.waitForTransaction(result.hash);
          return { ...result, status: 'confirmed' as const };
        } catch (error) {
          return {
            ...result,
            status: 'failed' as const,
            error:
              error instanceof Error ? error.message : 'Confirmation timeout',
          };
        }
      });

      return Promise.all(confirmPromises);
    }

    return submissions;
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance cache */
let serviceInstance: ConcurrentService | null = null;

/**
 * Get or create the singleton ConcurrentService instance.
 *
 * @returns The shared ConcurrentService instance
 */
export function getConcurrentService(): ConcurrentService {
  if (!serviceInstance) {
    serviceInstance = new ConcurrentService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton service instance.
 *
 * Primarily useful for testing scenarios.
 */
export function resetConcurrentService(): void {
  serviceInstance = null;
}

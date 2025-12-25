/**
 * Tempo Client Service
 *
 * Core blockchain client for Tempo network interactions.
 * Combines viem EVM client with tempo.ts chain configuration.
 *
 * Features:
 * - Public client for read-only operations (always available)
 * - Wallet client for transactions (requires private key)
 * - Fee token payments (no native token needed)
 * - Batch transaction support
 */

import {
  createClient,
  http,
  publicActions,
  walletActions,
  type Address,
  type Hash,
  type TransactionReceipt,
  type PublicActions,
  type WalletActions,
  type Client,
  type Transport,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { tempo } from 'tempo.ts/chains';
import { tempoActions } from 'tempo.ts/viem';
import {
  TransactionEnvelopeTempo,
  SignatureEnvelope,
} from 'tempo.ts/ox';
import * as Secp256k1 from 'ox/Secp256k1';
import * as Value from 'ox/Value';
import { getConfig } from '../config/index.js';
import { InternalError, ValidationError } from '../utils/errors.js';

// =============================================================================
// TIP-20 ABI (Minimal)
// =============================================================================

/**
 * Minimal TIP-20 ABI for token interactions.
 * Includes standard ERC-20 methods plus Tempo's transferWithMemo.
 */
export const TIP20_ABI = [
  // =========================================================================
  //                      ERC-20 Standard Functions
  // =========================================================================
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'transferWithMemo',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'memo', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // =========================================================================
  //                      TIP-20 Mint/Burn Functions (requires ISSUER_ROLE)
  // =========================================================================
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'mintWithMemo',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'memo', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'burn',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'burnWithMemo',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'memo', type: 'bytes32' },
    ],
    outputs: [],
  },
  // =========================================================================
  //                      TIP-20 Errors
  // =========================================================================
  {
    name: 'Unauthorized',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InsufficientBalance',
    type: 'error',
    inputs: [
      { name: 'available', type: 'uint256' },
      { name: 'required', type: 'uint256' },
      { name: 'token', type: 'address' },
    ],
  },
  {
    name: 'ContractPaused',
    type: 'error',
    inputs: [],
  },
  {
    name: 'SupplyCapExceeded',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InvalidRecipient',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InvalidAmount',
    type: 'error',
    inputs: [],
  },
  {
    name: 'PolicyForbids',
    type: 'error',
    inputs: [],
  },
] as const;

/**
 * Known TIP-20 error signatures for better error messages.
 * keccak256 of error signature, first 4 bytes.
 */
export const TIP20_ERROR_SIGNATURES: Record<string, string> = {
  '0x82b42900': 'Unauthorized - caller does not have the required role (e.g., ISSUER_ROLE for minting)',
  '0x': 'InsufficientBalance',
  // Add more as discovered
} as const;

// =============================================================================
// TIP-20 Factory ABI
// =============================================================================

/**
 * TIP-20 Factory ABI for creating new TIP-20 tokens.
 * Factory address: 0x20fc000000000000000000000000000000000000
 */
export const TIP20_FACTORY_ABI = [
  {
    name: 'createToken',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'currency', type: 'string' },
      { name: 'quoteToken', type: 'address' },
      { name: 'admin', type: 'address' },
    ],
    outputs: [{ name: 'token', type: 'address' }],
  },
  {
    name: 'isTIP20',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'tokenIdCounter',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // TokenCreated event for parsing logs
  {
    name: 'TokenCreated',
    type: 'event',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
      { name: 'currency', type: 'string', indexed: false },
      { name: 'quoteToken', type: 'address', indexed: true },
      { name: 'admin', type: 'address', indexed: false },
    ],
  },
] as const;

// =============================================================================
// Type Definitions
// =============================================================================

/** Type for the tempo chain configuration */
type TempoChain = ReturnType<typeof tempo>;

/** Type for public client with public actions */
export type TempoPublicClient = Client<Transport, TempoChain> &
  PublicActions<Transport, TempoChain>;

/** Type for wallet client with wallet actions */
export type TempoWalletClient = Client<
  Transport,
  TempoChain,
  PrivateKeyAccount
> &
  WalletActions<TempoChain, PrivateKeyAccount>;

/** Batch call structure for atomic transactions */
export interface BatchCall {
  /** Target contract address */
  to: Address;
  /** Encoded function call data */
  data: `0x${string}`;
  /** Optional value to send (usually 0 for TIP-20) */
  value?: bigint;
}

/** Gas estimation parameters */
export interface EstimateGasParams {
  /** Target address */
  to: Address;
  /** Optional call data */
  data?: `0x${string}`;
  /** Optional value */
  value?: bigint;
}

/** Scheduled transaction parameters */
export interface ScheduledTransactionParams {
  /** Target contract address */
  to: Address;
  /** Encoded function call data */
  data: `0x${string}`;
  /** Unix timestamp for execution (seconds since epoch) */
  scheduledAt: number;
  /** Optional earliest execution time (Unix timestamp) */
  validFrom?: number;
  /** Optional expiration time (Unix timestamp) */
  validUntil?: number;
  /** Optional value to send (usually 0 for TIP-20) */
  value?: bigint;
}

/** Concurrent transaction parameters for parallel execution */
export interface ConcurrentTransactionParams {
  /** Target contract address */
  to: Address;
  /** Encoded function call data */
  data: `0x${string}`;
  /** Optional value to send (usually 0 for TIP-20) */
  value?: bigint;
  /** Parallel execution channel (0-255) */
  nonceKey: number;
  /** Nonce for this nonceKey (queried from nonce precompile) */
  nonce: number;
}

// =============================================================================
// TempoClient Class
// =============================================================================

/**
 * Main client for interacting with the Tempo blockchain.
 *
 * Provides both read-only operations (via publicClient) and
 * transaction signing/sending (via walletClient).
 *
 * @example
 * ```typescript
 * const client = getTempoClient();
 *
 * // Read balance
 * const balance = await client.getBalance(tokenAddress);
 *
 * // Send payment
 * const hash = await client.sendTransfer(tokenAddress, recipient, amount);
 * const receipt = await client.waitForTransaction(hash);
 * ```
 */
export class TempoClient {
  private readonly publicClient: TempoPublicClient;
  private readonly walletClient: TempoWalletClient | null = null;
  private readonly chain: TempoChain;
  private readonly account: PrivateKeyAccount | null = null;
  private readonly feeToken: Address;

  constructor() {
    const config = getConfig();

    // Resolve fee token address from config
    const feeTokenAddress = config.tokens.aliases[config.tokens.default];
    if (!feeTokenAddress) {
      throw InternalError.configurationError(
        `Fee token '${config.tokens.default}' not found in token aliases. ` +
          'Add it to tokens.aliases in your configuration.'
      );
    }
    this.feeToken = feeTokenAddress as Address;

    // Create tempo chain with fee token configuration
    this.chain = tempo({
      feeToken: this.feeToken,
    });

    // Create public client (always available for read operations)
    this.publicClient = createClient({
      chain: this.chain,
      transport: http(config.network.rpcUrl),
    }).extend(publicActions) as TempoPublicClient;

    // Create wallet client only if private key is configured
    if (config.wallet.privateKey) {
      const privateKey = config.wallet.privateKey;

      // Validate private key format
      if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
        throw ValidationError.custom(
          'privateKey',
          'Invalid private key format. Must be 0x-prefixed 64-character hex string.',
          `${privateKey.slice(0, 6)}...`
        );
      }

      this.account = privateKeyToAccount(privateKey as `0x${string}`);

      this.walletClient = createClient({
        account: this.account,
        chain: this.chain,
        transport: http(config.network.rpcUrl),
      })
        .extend(walletActions)
        .extend(tempoActions()) as TempoWalletClient;
    }
  }

  // ===========================================================================
  // Read Methods
  // ===========================================================================

  /**
   * Get the configured wallet address.
   *
   * @returns The wallet address
   * @throws Error if wallet is not configured
   */
  getAddress(): Address {
    if (!this.account) {
      throw InternalError.walletNotConfigured();
    }
    return this.account.address;
  }

  /**
   * Get the balance of a TIP-20 token.
   *
   * @param tokenAddress - The TIP-20 token contract address
   * @param ownerAddress - Optional address to check (defaults to wallet address)
   * @returns The token balance in wei
   */
  async getBalance(
    tokenAddress: Address,
    ownerAddress?: Address
  ): Promise<bigint> {
    const address = ownerAddress ?? this.getAddress();

    const balance = await this.publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_ABI,
      functionName: 'balanceOf',
      args: [address],
    });

    return balance;
  }

  /**
   * Get transaction details by hash.
   *
   * @param hash - The transaction hash
   * @returns Transaction details
   */
  async getTransaction(hash: Hash): Promise<{
    hash: Hash;
    blockHash: Hash | null;
    blockNumber: bigint | null;
    from: Address;
    to: Address | null;
    value: bigint;
    gas: bigint;
    input: `0x${string}`;
    nonce: number;
    transactionIndex: number | null;
    type: string;
    [key: string]: unknown;
  }> {
    const tx = await this.publicClient.getTransaction({ hash });
    return tx as {
      hash: Hash;
      blockHash: Hash | null;
      blockNumber: bigint | null;
      from: Address;
      to: Address | null;
      value: bigint;
      gas: bigint;
      input: `0x${string}`;
      nonce: number;
      transactionIndex: number | null;
      type: string;
      [key: string]: unknown;
    };
  }

  /**
   * Get the current block number.
   *
   * @returns The current block number
   */
  async getBlockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  /**
   * Estimate gas for a transaction.
   *
   * Applies the gas multiplier from config for a safety margin.
   *
   * @param params - Transaction parameters to estimate
   * @returns Estimated gas with multiplier applied
   */
  async estimateGas(params: EstimateGasParams): Promise<bigint> {
    const config = getConfig();

    // Tempo requires feeToken to be specified for gas estimation
    const estimate = await this.publicClient.estimateGas({
      account: this.account ?? undefined,
      to: params.to,
      data: params.data,
      value: params.value,
      feeToken: this.feeToken,
    } as Parameters<typeof this.publicClient.estimateGas>[0]);

    // Apply gas multiplier from config for safety margin
    const multiplied = BigInt(
      Math.ceil(Number(estimate) * config.advanced.gasMultiplier)
    );

    return multiplied;
  }

  // ===========================================================================
  // Write Methods
  // ===========================================================================

  /**
   * Send a TIP-20 token transfer.
   *
   * @param tokenAddress - The TIP-20 token contract address
   * @param to - Recipient address
   * @param amount - Amount to send in wei
   * @returns Transaction hash
   * @throws Error if wallet is not configured
   */
  async sendTransfer(
    tokenAddress: Address,
    to: Address,
    amount: bigint
  ): Promise<Hash> {
    if (!this.walletClient) {
      throw InternalError.walletNotConfigured();
    }

    // Tempo requires feeToken to be specified for transactions
    const hash = await this.walletClient.writeContract({
      address: tokenAddress,
      abi: TIP20_ABI,
      functionName: 'transfer',
      args: [to, amount],
      feeToken: this.feeToken,
    } as Parameters<typeof this.walletClient.writeContract>[0]);

    return hash;
  }

  /**
   * Send a TIP-20 token transfer with a 32-byte memo.
   *
   * Memos are useful for invoice reconciliation and payment tracking.
   *
   * @param tokenAddress - The TIP-20 token contract address
   * @param to - Recipient address
   * @param amount - Amount to send in wei
   * @param memo - 32-byte hex string (66 chars including 0x prefix)
   * @returns Transaction hash
   * @throws Error if wallet is not configured or memo is invalid
   */
  async sendTransferWithMemo(
    tokenAddress: Address,
    to: Address,
    amount: bigint,
    memo: `0x${string}`
  ): Promise<Hash> {
    if (!this.walletClient) {
      throw InternalError.walletNotConfigured();
    }

    // Validate memo is exactly 32 bytes (64 hex chars + 0x prefix)
    if (memo.length !== 66) {
      throw ValidationError.invalidMemo(
        memo.slice(0, 20) + '...',
        (memo.length - 2) / 2 // Convert hex chars to bytes
      );
    }

    // Tempo requires feeToken to be specified for transactions
    const hash = await this.walletClient.writeContract({
      address: tokenAddress,
      abi: TIP20_ABI,
      functionName: 'transferWithMemo',
      args: [to, amount, memo],
      feeToken: this.feeToken,
    } as Parameters<typeof this.walletClient.writeContract>[0]);

    return hash;
  }

  /**
   * Send a batch of calls in a single atomic transaction.
   *
   * All calls succeed or all fail together. Uses tempo.ts batch transaction support.
   *
   * @param calls - Array of calls to execute
   * @returns Transaction hash
   * @throws Error if wallet is not configured or calls array is empty
   */
  async sendBatch(calls: BatchCall[]): Promise<Hash> {
    if (!this.walletClient) {
      throw InternalError.walletNotConfigured();
    }

    if (calls.length === 0) {
      throw ValidationError.missingField('calls');
    }

    // tempo.ts extends viem with batch transaction support
    // The 'calls' property is a tempo.ts extension for TempoTransaction (0x76)
    const hash = await this.walletClient.sendTransaction({
      calls,
      feeToken: this.feeToken,
    } as Parameters<typeof this.walletClient.sendTransaction>[0]);

    return hash;
  }

  /**
   * Send a scheduled transaction that executes at a future time.
   *
   * Uses Tempo's native TempoTransaction (type 0x76) scheduling support.
   * The transaction is submitted to the network and will be executed by
   * validators at the scheduled time without requiring external triggers.
   *
   * @param params - Scheduled transaction parameters
   * @returns Transaction hash
   * @throws Error if wallet is not configured or scheduledAt is in the past
   */
  async sendScheduledTransaction(
    params: ScheduledTransactionParams
  ): Promise<Hash> {
    if (!this.walletClient) {
      throw InternalError.walletNotConfigured();
    }

    const now = Math.floor(Date.now() / 1000);
    if (params.scheduledAt <= now) {
      throw ValidationError.custom(
        'scheduledAt',
        'Scheduled execution time must be in the future',
        new Date(params.scheduledAt * 1000).toISOString()
      );
    }

    // Validate validFrom/validUntil if provided
    if (params.validFrom && params.validFrom > params.scheduledAt) {
      throw ValidationError.custom(
        'validFrom',
        'validFrom cannot be after scheduledAt',
        `validFrom: ${new Date(params.validFrom * 1000).toISOString()}, scheduledAt: ${new Date(params.scheduledAt * 1000).toISOString()}`
      );
    }

    if (params.validUntil && params.validUntil < params.scheduledAt) {
      throw ValidationError.custom(
        'validUntil',
        'validUntil cannot be before scheduledAt',
        `validUntil: ${new Date(params.validUntil * 1000).toISOString()}, scheduledAt: ${new Date(params.scheduledAt * 1000).toISOString()}`
      );
    }

    // tempo.ts extends viem with scheduled transaction support
    // These fields are TempoTransaction (0x76) extensions
    const hash = await this.walletClient.sendTransaction({
      to: params.to,
      data: params.data,
      value: params.value ?? BigInt(0),
      // Tempo-specific scheduling fields
      scheduledAt: params.scheduledAt,
      validFrom: params.validFrom,
      validUntil: params.validUntil,
      feeToken: this.feeToken,
    } as Parameters<typeof this.walletClient.sendTransaction>[0]);

    return hash;
  }

  /**
   * Send a concurrent transaction using a specific nonce key.
   *
   * Tempo's nonceKey parameter enables parallel transaction execution by
   * maintaining up to 256 independent nonce sequences. This allows multiple
   * transactions from the same account to be submitted and confirmed
   * simultaneously without waiting for sequential confirmation.
   *
   * @param params - Concurrent transaction parameters including nonceKey
   * @returns Transaction hash
   * @throws Error if wallet is not configured or nonceKey is out of range
   *
   * @example
   * ```typescript
   * // Send transactions on different nonce keys in parallel
   * const hash1 = await client.sendConcurrentTransaction({
   *   to: tokenAddress,
   *   data: transferData1,
   *   nonce: 0n,
   *   nonceKey: 1,  // First parallel channel
   * });
   * const hash2 = await client.sendConcurrentTransaction({
   *   to: tokenAddress,
   *   data: transferData2,
   *   nonce: 0n,
   *   nonceKey: 2,  // Second parallel channel
   * });
   * // Both transactions execute in parallel!
   * ```
   */
  async sendConcurrentTransaction(
    params: ConcurrentTransactionParams
  ): Promise<Hash> {
    if (!this.walletClient) {
      throw InternalError.walletNotConfigured();
    }

    // Validate nonceKey range (0-255)
    if (params.nonceKey < 0 || params.nonceKey > 255) {
      throw ValidationError.custom(
        'nonceKey',
        'Nonce key must be between 0 and 255',
        String(params.nonceKey)
      );
    }

    // tempo.ts extends viem with nonceKey support for TempoTransaction (0x76)
    // We must pass explicit nonce because the SDK doesn't auto-query nonces for nonceKeys
    const hash = await this.walletClient.sendTransaction({
      to: params.to,
      data: params.data,
      value: params.value ?? BigInt(0),
      nonce: params.nonce,
      nonceKey: BigInt(params.nonceKey), // Tempo-specific: parallel execution channel
      feeToken: this.feeToken,
    } as Parameters<typeof this.walletClient.sendTransaction>[0]);

    return hash;
  }

  /**
   * Send a raw Tempo transaction (type 0x76).
   *
   * This method constructs and signs a proper Tempo transaction envelope,
   * which is required for operations on the Account Keychain precompile
   * (revokeKey, updateSpendingLimit) that need the root key context.
   *
   * @param params - Transaction parameters
   * @returns Transaction hash
   * @throws Error if wallet is not configured
   */
  async sendTempoTransaction(params: {
    to: Address;
    data: `0x${string}`;
    value?: bigint;
    gas?: bigint;
  }): Promise<Hash> {
    if (!this.walletClient || !this.account) {
      throw InternalError.walletNotConfigured();
    }

    const config = getConfig();

    // Get current nonce
    const nonce = await this.publicClient.getTransactionCount({
      address: this.account.address,
      blockTag: 'pending',
    });

    // Get current gas prices
    const gasPrice = await this.publicClient.getGasPrice();
    const maxFeePerGas = params.gas
      ? Value.fromGwei('50')
      : gasPrice * 2n;
    const maxPriorityFeePerGas = Value.fromGwei('10');

    // Estimate gas if not provided
    const gas = params.gas ?? await this.estimateGas({
      to: params.to,
      data: params.data,
      value: params.value,
    });

    // Get chain ID
    const chainId = this.chain.id;

    // Create Tempo transaction envelope
    const transaction = TransactionEnvelopeTempo.from({
      calls: [
        {
          to: params.to,
          data: params.data,
          value: params.value ?? 0n,
        },
      ],
      chainId,
      feeToken: this.feeToken,
      nonce: BigInt(nonce),
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    // Get the sign payload and sign with the root key
    const signPayload = TransactionEnvelopeTempo.getSignPayload(transaction);
    const signature = Secp256k1.sign({
      payload: signPayload,
      privateKey: config.wallet.privateKey as `0x${string}`,
    });

    // Serialize with secp256k1 signature (root key signing)
    const serialized = TransactionEnvelopeTempo.serialize(transaction, {
      signature: SignatureEnvelope.from(signature),
    });

    // Send raw transaction
    const hash = await this.publicClient.request({
      method: 'eth_sendRawTransaction' as 'eth_sendRawTransaction',
      params: [serialized],
    }) as Hash;

    return hash;
  }

  /**
   * Wait for a transaction to be confirmed.
   *
   * Uses confirmations and timeout settings from config.
   *
   * @param hash - Transaction hash to wait for
   * @returns Transaction receipt
   */
  async waitForTransaction(hash: Hash): Promise<TransactionReceipt> {
    const config = getConfig();

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: config.advanced.confirmations,
      timeout: config.advanced.timeout,
    });

    return receipt;
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance cache */
let clientInstance: TempoClient | null = null;

/**
 * Get or create the singleton TempoClient instance.
 *
 * The client is lazily initialized on first call and cached for
 * subsequent calls. Use resetTempoClient() to force re-initialization.
 *
 * @returns The shared TempoClient instance
 * @throws Error if configuration is invalid
 */
export function getTempoClient(): TempoClient {
  if (!clientInstance) {
    clientInstance = new TempoClient();
  }
  return clientInstance;
}

/**
 * Reset the singleton client instance.
 *
 * Primarily useful for testing scenarios where you need to
 * reinitialize the client with different configuration.
 */
export function resetTempoClient(): void {
  clientInstance = null;
}

/**
 * Transaction Service
 *
 * Service for querying transaction details and estimating gas on Tempo blockchain.
 * Provides read-only operations that don't require a wallet private key.
 *
 * Features:
 * - Transaction lookup by hash with detailed info
 * - TIP-20 transfer detection and parsing
 * - Memo decoding for reconciliation
 * - Gas estimation with fee token cost
 */

import { formatUnits, type Address, type Hash, type Hex } from 'viem';
import { getTempoClient, TIP20_ABI } from './tempo-client.js';
import { getConfig } from '../config/index.js';
import { ValidationError } from '../utils/errors.js';
import {
  buildExplorerTxUrl,
  bytes32ToString,
  formatRawAmount,
} from '../utils/formatting.js';
import type {
  GetTransactionOutput,
  GetGasEstimateOutput,
  TokenTransferInfo,
} from '../tools/account/transaction-schemas.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Function selectors for TIP-20 operations.
 * These are the first 4 bytes of keccak256 of the function signature.
 */
const FUNCTION_SELECTORS = {
  /** transfer(address,uint256) */
  TRANSFER: '0xa9059cbb',
  /** transferWithMemo(address,uint256,bytes32) */
  TRANSFER_WITH_MEMO: '0x42966c68',
} as const;

// =============================================================================
// Types
// =============================================================================

/**
 * Parameters for gas estimation.
 */
export interface EstimateGasParams {
  /** Destination address */
  to: Address;
  /** Transaction data (hex encoded) */
  data?: Hex;
  /** Value to send in wei */
  value?: bigint;
}

/**
 * Decoded TIP-20 transfer call data.
 */
interface DecodedTransferCall {
  /** Recipient address */
  to: Address;
  /** Transfer amount in wei */
  amount: bigint;
  /** Optional memo (32 bytes) */
  memo?: Hex;
}

// =============================================================================
// Transaction Service Class
// =============================================================================

/**
 * Service for querying transaction details and gas estimation.
 *
 * Provides read-only operations using the public client.
 * Does not require a wallet private key.
 *
 * @example
 * ```typescript
 * const service = getTransactionService();
 *
 * // Get transaction details
 * const tx = await service.getTransaction('0xabc123...');
 *
 * // Estimate gas
 * const gas = await service.estimateGas({ to: '0x...', data: '0x...' });
 * ```
 */
export class TransactionService {
  /**
   * Get detailed transaction information by hash.
   *
   * Fetches transaction data, receipt (if confirmed), and block info.
   * Parses TIP-20 transfer data if detected.
   *
   * @param hash - Transaction hash (66 characters with 0x prefix)
   * @returns Detailed transaction information
   * @throws ValidationError if transaction not found
   */
  async getTransaction(hash: Hash): Promise<GetTransactionOutput> {
    const client = getTempoClient();
    const config = getConfig();
    const publicClient = client['publicClient'];

    // Fetch transaction data
    let tx: any;
    try {
      tx = await publicClient.getTransaction({ hash });
    } catch (error) {
      // Transaction not found
      throw ValidationError.transactionNotFound(hash);
    }

    if (!tx) {
      throw ValidationError.transactionNotFound(hash);
    }

    // For Tempo-native transactions (type 0x76/'tempo'), extract 'to' from calls array
    // Tempo transactions use: { calls: [{ to, input, value }] } instead of top-level to/input/value
    let effectiveTo: Address | null = tx.to ?? null;
    if (!effectiveTo && tx.calls && Array.isArray(tx.calls) && tx.calls.length > 0) {
      effectiveTo = tx.calls[0].to ?? null;
    }

    // Fetch receipt (may not exist if pending)
    let receipt = null;
    try {
      receipt = await publicClient.getTransactionReceipt({ hash });
    } catch {
      // Transaction pending - no receipt yet
    }

    // Fetch block for timestamp (if confirmed)
    let timestamp: string | null = null;
    if (tx.blockHash) {
      try {
        const block = await publicClient.getBlock({ blockHash: tx.blockHash });
        timestamp = new Date(Number(block.timestamp) * 1000).toISOString();
      } catch {
        // Block info not available
      }
    }

    // Calculate confirmations
    let confirmations = 0;
    if (receipt && receipt.blockNumber) {
      const currentBlock = await publicClient.getBlockNumber();
      confirmations = Number(currentBlock - receipt.blockNumber);
    }

    // Determine transaction status
    let status: 'success' | 'reverted' | 'pending' = 'pending';
    if (receipt) {
      status = receipt.status === 'success' ? 'success' : 'reverted';
    }

    // Parse TIP-20 transfer data if present
    // For Tempo transactions, input data is in calls[0].input (or calls[0].data)
    let token: TokenTransferInfo | null = null;
    let memo: string | null = null;
    let memoDecoded: string | null = null;

    const effectiveInput = tx.input ?? (tx.calls?.[0]?.input || tx.calls?.[0]?.data);

    if (effectiveTo && effectiveInput && effectiveInput.length >= 10) {
      const parsed = await this.parseTransferData(effectiveInput, effectiveTo);
      if (parsed) {
        token = parsed.token;
        memo = parsed.memo;
        memoDecoded = parsed.memoDecoded;
      }
    }

    // Calculate gas cost
    const gasUsed = receipt ? receipt.gasUsed : BigInt(0);
    const gasPrice = tx.gasPrice ?? BigInt(0);
    const gasCost = formatRawAmount(gasUsed * gasPrice, 6);

    // For Tempo transactions, value is in calls[0].value
    const effectiveValue = tx.value ?? tx.calls?.[0]?.value ?? BigInt(0);

    return {
      hash: tx.hash,
      blockNumber: tx.blockNumber ? Number(tx.blockNumber) : null,
      blockHash: tx.blockHash ?? null,
      from: tx.from,
      to: effectiveTo,
      value: (typeof effectiveValue === 'bigint' ? effectiveValue : BigInt(effectiveValue || 0)).toString(),
      status,
      type: tx.type ?? 'legacy',
      token,
      memo,
      memoDecoded,
      gasUsed: gasUsed.toString(),
      gasPrice: gasPrice.toString(),
      gasCost,
      timestamp,
      confirmations,
      explorerUrl: buildExplorerTxUrl(config.network.explorerUrl, hash),
    };
  }

  /**
   * Estimate gas cost for a transaction.
   *
   * Returns gas limit, gas price, and estimated cost in fee token.
   *
   * @param params - Transaction parameters for estimation
   * @returns Gas estimation with cost in fee token
   */
  async estimateGas(params: EstimateGasParams): Promise<GetGasEstimateOutput> {
    const client = getTempoClient();
    const config = getConfig();
    const publicClient = client['publicClient'];

    // Get fee token info
    const feeTokenAddress = config.tokens.aliases[
      config.tokens.default
    ] as Address;
    const feeTokenSymbol = config.tokens.default;

    // Estimate gas limit using TempoClient (includes gas multiplier)
    const gasLimit = await client.estimateGas({
      to: params.to,
      data: params.data,
      value: params.value,
    });

    // Get current gas price
    let gasPrice: bigint;
    try {
      gasPrice = await publicClient.getGasPrice();
    } catch {
      // Fallback to a reasonable default
      gasPrice = BigInt(15000000); // 0.015 in 6 decimals
    }

    // Calculate estimated cost
    const estimatedCost = gasLimit * gasPrice;
    const estimatedCostFormatted = formatRawAmount(estimatedCost, 6);

    // Try to get EIP-1559 gas prices if available
    let maxFeePerGas: string | null = null;
    let maxPriorityFeePerGas: string | null = null;

    try {
      const feeData = await publicClient.estimateFeesPerGas();
      if (feeData.maxFeePerGas) {
        maxFeePerGas = feeData.maxFeePerGas.toString();
      }
      if (feeData.maxPriorityFeePerGas) {
        maxPriorityFeePerGas = feeData.maxPriorityFeePerGas.toString();
      }
    } catch {
      // EIP-1559 not supported or error fetching
    }

    return {
      gasLimit: gasLimit.toString(),
      gasPrice: gasPrice.toString(),
      maxFeePerGas,
      maxPriorityFeePerGas,
      estimatedCost: estimatedCost.toString(),
      estimatedCostFormatted,
      feeToken: feeTokenAddress,
      feeTokenSymbol,
    };
  }

  /**
   * Parse TIP-20 transfer data from transaction input.
   *
   * Detects transfer() and transferWithMemo() calls and extracts:
   * - Token contract info (address, symbol, name, decimals)
   * - Transfer amount
   * - Memo (if present)
   *
   * @param input - Transaction input data (hex)
   * @param tokenAddress - Contract address being called
   * @returns Parsed transfer info or null if not a transfer
   */
  private async parseTransferData(
    input: Hex,
    tokenAddress: Address
  ): Promise<{
    token: TokenTransferInfo;
    memo: string | null;
    memoDecoded: string | null;
  } | null> {
    const selector = input.slice(0, 10).toLowerCase();

    // Check if this is a TIP-20 transfer
    let decoded: DecodedTransferCall | null = null;

    if (selector === FUNCTION_SELECTORS.TRANSFER) {
      decoded = this.decodeTransferCall(input, false);
    } else if (selector === FUNCTION_SELECTORS.TRANSFER_WITH_MEMO) {
      decoded = this.decodeTransferCall(input, true);
    }

    if (!decoded) {
      return null;
    }

    // Fetch token metadata
    const client = getTempoClient();
    const publicClient = client['publicClient'];

    let tokenSymbol = 'UNKNOWN';
    let tokenName = 'Unknown Token';
    let decimals = 6;

    try {
      const [symbol, name, dec] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: TIP20_ABI,
          functionName: 'symbol',
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: TIP20_ABI,
          functionName: 'name',
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: TIP20_ABI,
          functionName: 'decimals',
        }),
      ]);

      tokenSymbol = symbol as string;
      tokenName = name as string;
      decimals = dec as number;
    } catch {
      // Token metadata not available - use defaults
    }

    // Format amount
    const amount = formatUnits(decoded.amount, decimals);

    // Decode memo if present
    let memo: string | null = null;
    let memoDecoded: string | null = null;

    if (decoded.memo) {
      memo = decoded.memo;
      try {
        memoDecoded = bytes32ToString(decoded.memo);
      } catch {
        // Memo is not valid UTF-8 string - keep as hex
      }
    }

    return {
      token: {
        address: tokenAddress,
        symbol: tokenSymbol,
        name: tokenName,
        amount,
        amountRaw: decoded.amount.toString(),
        decimals,
      },
      memo,
      memoDecoded,
    };
  }

  /**
   * Decode transfer/transferWithMemo function call data.
   *
   * @param input - Full transaction input data
   * @param hasMemo - Whether the call includes a memo parameter
   * @returns Decoded parameters or null if invalid
   */
  private decodeTransferCall(
    input: Hex,
    hasMemo: boolean
  ): DecodedTransferCall | null {
    try {
      // Remove 0x prefix and selector (10 chars total)
      const data = input.slice(10);

      // Each parameter is 32 bytes (64 hex chars)
      const expectedLength = hasMemo ? 192 : 128; // 3 or 2 params * 64

      if (data.length < expectedLength) {
        return null;
      }

      // Parse address (last 20 bytes of first 32-byte word)
      const toHex = data.slice(24, 64); // Skip first 12 bytes of padding
      const to = `0x${toHex}` as Address;

      // Parse amount (second 32-byte word)
      const amountHex = data.slice(64, 128);
      const amount = BigInt(`0x${amountHex}`);

      // Parse memo if present (third 32-byte word)
      let memo: Hex | undefined;
      if (hasMemo && data.length >= 192) {
        memo = `0x${data.slice(128, 192)}` as Hex;
      }

      return { to, amount, memo };
    } catch {
      return null;
    }
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance cache */
let serviceInstance: TransactionService | null = null;

/**
 * Get or create the singleton TransactionService instance.
 *
 * @returns The shared TransactionService instance
 */
export function getTransactionService(): TransactionService {
  if (!serviceInstance) {
    serviceInstance = new TransactionService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton service instance.
 *
 * Primarily useful for testing scenarios.
 */
export function resetTransactionService(): void {
  serviceInstance = null;
}

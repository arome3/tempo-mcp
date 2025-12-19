/**
 * Exchange Service
 *
 * Handles stablecoin swap operations via Tempo's native DEX.
 * Provides quote retrieval and swap execution with slippage protection.
 *
 * @see https://docs.tempo.xyz/guide/stablecoin-exchange/executing-swaps
 */

import { formatUnits, parseUnits, type Address, type Hash } from 'viem';
import { Actions, Addresses } from 'tempo.ts/viem';
import { getTempoClient, TIP20_ABI } from './tempo-client.js';
import { getConfig } from '../config/index.js';
import { ValidationError, BlockchainError } from '../utils/errors.js';

// =============================================================================
// Constants
// =============================================================================

/** TIP-20 tokens always have 6 decimals */
const TIP20_DECIMALS = 6;

// =============================================================================
// Types
// =============================================================================

export interface QuoteParams {
  fromToken: string;
  toToken: string;
  amount: string;
  direction: 'exactIn' | 'exactOut';
}

export interface QuoteResult {
  fromToken: Address;
  fromTokenSymbol: string;
  toToken: Address;
  toTokenSymbol: string;
  amountIn: string;
  amountInRaw: bigint;
  amountOut: string;
  amountOutRaw: bigint;
  rate: string;
  inverseRate: string;
  direction: 'exactIn' | 'exactOut';
}

export interface SwapParams {
  fromToken: string;
  toToken: string;
  amount: string;
  slippageTolerance: number;
  direction: 'exactIn' | 'exactOut';
}

export interface SwapResult {
  transactionHash: Hash;
  blockNumber: number;
  fromToken: Address;
  fromTokenSymbol: string;
  toToken: Address;
  toTokenSymbol: string;
  amountIn: string;
  amountOut: string;
  effectiveRate: string;
  slippage: string;
  gasCost: string;
}

// =============================================================================
// ExchangeService Class
// =============================================================================

/**
 * Service for stablecoin swap operations via Tempo DEX.
 *
 * @example
 * ```typescript
 * const service = getExchangeService();
 *
 * // Get a quote
 * const quote = await service.getQuote({
 *   fromToken: 'AlphaUSD',
 *   toToken: 'BetaUSD',
 *   amount: '100',
 *   direction: 'exactIn',
 * });
 *
 * // Execute swap
 * const result = await service.executeSwap({
 *   fromToken: 'AlphaUSD',
 *   toToken: 'BetaUSD',
 *   amount: '100',
 *   slippageTolerance: 0.5,
 *   direction: 'exactIn',
 * });
 * ```
 */
export class ExchangeService {
  // ===========================================================================
  // Quote Methods
  // ===========================================================================

  /**
   * Get a swap quote from the DEX.
   *
   * @param params - Quote parameters
   * @returns Quote result with amounts and rate
   * @throws ValidationError if tokens are invalid
   * @throws BlockchainError if DEX query fails
   */
  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    const client = getTempoClient();
    const publicClient = client['publicClient'];

    // Resolve token addresses
    const fromAddress = this.resolveToken(params.fromToken);
    const toAddress = this.resolveToken(params.toToken);

    // Validate tokens are different
    if (fromAddress.toLowerCase() === toAddress.toLowerCase()) {
      throw new ValidationError(
        1010,
        'Cannot swap a token for itself',
        {
          recoverable: false,
          details: {
            field: 'tokens',
            suggestion: 'Specify different tokens for fromToken and toToken',
          },
        }
      );
    }

    // Get token metadata
    const [fromMeta, toMeta] = await Promise.all([
      this.getTokenMetadata(fromAddress),
      this.getTokenMetadata(toAddress),
    ]);

    let amountInRaw: bigint;
    let amountOutRaw: bigint;

    try {
      if (params.direction === 'exactIn') {
        // User specifies how much to sell, get how much they'll receive
        amountInRaw = parseUnits(params.amount, fromMeta.decimals);
        amountOutRaw = await Actions.dex.getSellQuote(publicClient, {
          tokenIn: fromAddress,
          tokenOut: toAddress,
          amountIn: amountInRaw,
        });
      } else {
        // User specifies how much to buy, get how much it'll cost
        amountOutRaw = parseUnits(params.amount, toMeta.decimals);
        amountInRaw = await Actions.dex.getBuyQuote(publicClient, {
          tokenIn: fromAddress,
          tokenOut: toAddress,
          amountOut: amountOutRaw,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('InsufficientLiquidity')) {
        throw new BlockchainError(
          3010,
          'Insufficient liquidity in the orderbook for this swap',
          {
            recoverable: true,
            retryAfter: 60,
            details: {
              suggestion: 'Try a smaller amount or wait for more liquidity',
            },
          }
        );
      }

      throw new BlockchainError(
        3010,
        `Failed to get swap quote: ${errorMessage}`,
        { recoverable: true }
      );
    }

    // Format amounts
    const amountIn = formatUnits(amountInRaw, fromMeta.decimals);
    const amountOut = formatUnits(amountOutRaw, toMeta.decimals);

    // Calculate rates
    const amountInNum = Number(amountIn);
    const amountOutNum = Number(amountOut);
    const rate = amountInNum > 0 ? (amountOutNum / amountInNum).toFixed(6) : '0';
    const inverseRate = amountOutNum > 0 ? (amountInNum / amountOutNum).toFixed(6) : '0';

    return {
      fromToken: fromAddress,
      fromTokenSymbol: fromMeta.symbol,
      toToken: toAddress,
      toTokenSymbol: toMeta.symbol,
      amountIn,
      amountInRaw,
      amountOut,
      amountOutRaw,
      rate,
      inverseRate,
      direction: params.direction,
    };
  }

  // ===========================================================================
  // Swap Methods
  // ===========================================================================

  /**
   * Execute a stablecoin swap on the DEX.
   *
   * Flow:
   * 1. Get fresh quote
   * 2. Calculate slippage bounds
   * 3. Approve DEX to spend tokens
   * 4. Execute swap
   * 5. Wait for confirmation
   *
   * @param params - Swap parameters
   * @returns Swap result with transaction details
   * @throws ValidationError if parameters are invalid
   * @throws BlockchainError if swap fails
   */
  async executeSwap(params: SwapParams): Promise<SwapResult> {
    const client = getTempoClient();

    // Ensure wallet is configured
    if (!client['walletClient']) {
      throw new BlockchainError(
        3005,
        'Wallet not configured. Set TEMPO_PRIVATE_KEY environment variable.',
        { recoverable: false }
      );
    }

    // Validate slippage
    if (params.slippageTolerance < 0.1 || params.slippageTolerance > 5) {
      throw new ValidationError(
        1011,
        `Slippage tolerance must be between 0.1% and 5%, got ${params.slippageTolerance}%`,
        {
          recoverable: false,
          details: {
            field: 'slippageTolerance',
            expected: '0.1-5',
            received: String(params.slippageTolerance),
          },
        }
      );
    }

    // Get fresh quote
    const quote = await this.getQuote({
      fromToken: params.fromToken,
      toToken: params.toToken,
      amount: params.amount,
      direction: params.direction,
    });

    // Resolve token metadata for decimals
    const fromMeta = await this.getTokenMetadata(quote.fromToken);
    const toMeta = await this.getTokenMetadata(quote.toToken);

    let transactionHash: Hash;
    let actualAmountIn: bigint = quote.amountInRaw;
    let actualAmountOut: bigint = quote.amountOutRaw;

    try {
      if (params.direction === 'exactIn') {
        // Calculate minimum output with slippage protection
        const slippageMultiplier = BigInt(Math.floor((1 - params.slippageTolerance / 100) * 10000));
        const minAmountOut = (quote.amountOutRaw * slippageMultiplier) / BigInt(10000);

        // Approve DEX to spend input tokens
        await this.approveToken(quote.fromToken, quote.amountInRaw);

        // Execute sell (exact input)
        // Note: sellSync returns { receipt } - actual amounts come from the quote
        // since stablecoin swaps are deterministic within slippage tolerance
        const result = await Actions.dex.sellSync(client['walletClient']!, {
          tokenIn: quote.fromToken,
          tokenOut: quote.toToken,
          amountIn: quote.amountInRaw,
          minAmountOut,
          feeToken: client['feeToken'],
        } as Parameters<typeof Actions.dex.sellSync>[1]);

        transactionHash = result.receipt.transactionHash;
        // Use quoted amount as actual (swap succeeded within slippage)
        actualAmountOut = quote.amountOutRaw;
      } else {
        // Calculate maximum input with slippage protection
        const slippageMultiplier = BigInt(Math.floor((1 + params.slippageTolerance / 100) * 10000));
        const maxAmountIn = (quote.amountInRaw * slippageMultiplier) / BigInt(10000);

        // Approve DEX to spend max input (with slippage buffer)
        await this.approveToken(quote.fromToken, maxAmountIn);

        // Execute buy (exact output)
        // Note: buySync returns { receipt } - actual amounts come from the quote
        const result = await Actions.dex.buySync(client['walletClient']!, {
          tokenIn: quote.fromToken,
          tokenOut: quote.toToken,
          amountOut: quote.amountOutRaw,
          maxAmountIn,
          feeToken: client['feeToken'],
        } as Parameters<typeof Actions.dex.buySync>[1]);

        transactionHash = result.receipt.transactionHash;
        // Use quoted amount as actual (swap succeeded within slippage)
        actualAmountIn = quote.amountInRaw;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('InsufficientLiquidity')) {
        throw new BlockchainError(
          3010,
          'Insufficient liquidity to complete swap within slippage tolerance',
          {
            recoverable: true,
            retryAfter: 60,
            details: {
              suggestion: 'Try increasing slippage tolerance or reducing amount',
            },
          }
        );
      }

      if (errorMessage.includes('slippage') || errorMessage.includes('amount')) {
        throw new BlockchainError(
          3011,
          'Swap failed due to price movement exceeding slippage tolerance',
          {
            recoverable: true,
            retryAfter: 10,
            details: {
              suggestion: 'Price moved during execution. Try again or increase slippage tolerance.',
            },
          }
        );
      }

      throw new BlockchainError(
        3010,
        `Swap transaction failed: ${errorMessage}`,
        { recoverable: false }
      );
    }

    // Wait for confirmation and get receipt
    const receipt = await client.waitForTransaction(transactionHash);

    // Calculate gas cost
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice ?? BigInt(0);
    const gasCost = formatUnits(gasUsed * gasPrice, TIP20_DECIMALS);

    // Format final amounts
    const finalAmountIn = formatUnits(actualAmountIn, fromMeta.decimals);
    const finalAmountOut = formatUnits(actualAmountOut, toMeta.decimals);

    // Calculate effective rate and slippage
    const effectiveRate = Number(actualAmountIn) > 0
      ? (Number(actualAmountOut) / Number(actualAmountIn) * Math.pow(10, fromMeta.decimals - toMeta.decimals)).toFixed(6)
      : '0';

    // Calculate actual slippage (negative means better than quoted)
    const quotedRate = Number(quote.rate);
    const actualRate = Number(effectiveRate);
    const slippagePercent = quotedRate > 0
      ? (((quotedRate - actualRate) / quotedRate) * 100).toFixed(4)
      : '0';

    return {
      transactionHash,
      blockNumber: Number(receipt.blockNumber),
      fromToken: quote.fromToken,
      fromTokenSymbol: quote.fromTokenSymbol,
      toToken: quote.toToken,
      toTokenSymbol: quote.toTokenSymbol,
      amountIn: finalAmountIn,
      amountOut: finalAmountOut,
      effectiveRate,
      slippage: slippagePercent,
      gasCost,
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Resolve a token input (address or symbol) to a token address.
   *
   * @param tokenInput - Token address (0x...) or symbol (e.g., "AlphaUSD")
   * @returns Resolved token address
   * @throws ValidationError if the token cannot be resolved
   */
  private resolveToken(tokenInput: string): Address {
    // If already an address, validate and return
    if (tokenInput.startsWith('0x')) {
      if (tokenInput.length !== 42) {
        throw ValidationError.invalidToken(tokenInput);
      }
      return tokenInput as Address;
    }

    // Look up in config aliases
    const config = getConfig();
    const address = config.tokens.aliases[tokenInput];

    if (!address) {
      throw ValidationError.invalidToken(tokenInput);
    }

    return address as Address;
  }

  /**
   * Get token metadata (symbol and decimals).
   *
   * @param tokenAddress - Token contract address
   * @returns Token metadata
   */
  private async getTokenMetadata(
    tokenAddress: Address
  ): Promise<{ symbol: string; decimals: number }> {
    const client = getTempoClient();
    const publicClient = client['publicClient'];

    const [symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: TIP20_ABI,
        functionName: 'symbol',
      }) as Promise<string>,
      publicClient.readContract({
        address: tokenAddress,
        abi: TIP20_ABI,
        functionName: 'decimals',
      }) as Promise<number>,
    ]);

    return { symbol, decimals };
  }

  /**
   * Approve the DEX contract to spend tokens.
   *
   * @param token - Token address to approve
   * @param amount - Amount to approve
   */
  private async approveToken(token: Address, amount: bigint): Promise<void> {
    const client = getTempoClient();
    const walletClient = client['walletClient'];

    if (!walletClient) {
      throw new BlockchainError(
        3005,
        'Wallet not configured for token approval',
        { recoverable: false }
      );
    }

    // Approve stablecoinExchange to spend tokens
    const hash = await walletClient.writeContract({
      address: token,
      abi: [
        {
          name: 'approve',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ],
      functionName: 'approve',
      args: [Addresses.stablecoinExchange, amount],
      feeToken: client['feeToken'],
    } as Parameters<typeof walletClient.writeContract>[0]);

    // Wait for approval confirmation
    await client.waitForTransaction(hash);
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

let serviceInstance: ExchangeService | null = null;

/**
 * Get or create the singleton ExchangeService instance.
 */
export function getExchangeService(): ExchangeService {
  if (!serviceInstance) {
    serviceInstance = new ExchangeService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetExchangeService(): void {
  serviceInstance = null;
}

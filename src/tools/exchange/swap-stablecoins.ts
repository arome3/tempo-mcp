/**
 * Swap Stablecoins Tool
 *
 * MCP tool for executing stablecoin swaps on Tempo's native DEX.
 * This is a high-risk operation with full security validation and audit logging.
 */

import { type Address } from 'viem';

import { server } from '../../server.js';
import { getExchangeService } from '../../services/exchange-service.js';
import { getConfig } from '../../config/index.js';
import { getSecurityLayer } from '../../security/index.js';
import {
  buildExplorerTxUrl,
  isTempoMcpError,
  normalizeError,
} from '../../utils/index.js';
import { createRequestContext } from '../../types/index.js';
import {
  swapStablecoinsInputSchema,
  createSwapSuccessResponse,
  createExchangeErrorResponse,
  type SwapStablecoinsInput,
} from './schemas.js';

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * Register the swap_stablecoins tool with the MCP server.
 *
 * This tool allows AI agents to execute stablecoin swaps on Tempo DEX.
 * Includes full security validation (spending limits, rate limiting) and audit logging.
 */
export function registerSwapStablecoinsTool(): void {
  server.registerTool(
    'swap_stablecoins',
    {
      title: 'Swap Stablecoins',
      description:
        'Execute a stablecoin swap on Tempo DEX. ' +
        'Swaps between different stablecoins with slippage protection. ' +
        'Use "exactIn" to specify sell amount, "exactOut" to specify buy amount.',
      inputSchema: swapStablecoinsInputSchema,
    },
    async (args: SwapStablecoinsInput) => {
      // Create request context for tracing
      const ctx = createRequestContext('swap_stablecoins');
      const security = getSecurityLayer();
      const config = getConfig();

      // Create sanitized args for logging
      const logArgs = {
        fromToken: args.fromToken,
        toToken: args.toToken,
        amount: args.amount,
        slippageTolerance: args.slippageTolerance,
        direction: args.direction,
      };

      try {
        // =====================================================================
        // 1. Get Quote First (for security validation)
        // =====================================================================
        const service = getExchangeService();
        const quote = await service.getQuote({
          fromToken: args.fromToken,
          toToken: args.toToken,
          amount: args.amount,
          direction: args.direction,
        });

        // =====================================================================
        // 2. Security Validation
        // =====================================================================
        // Treat swap as a payment for spending limit purposes
        // The "payment" amount is the input amount being spent
        await security.validatePayment({
          token: quote.fromTokenSymbol,
          to: quote.toToken as Address, // DEX contract is the recipient
          amount: quote.amountIn,
        });

        // =====================================================================
        // 3. Execute Swap
        // =====================================================================
        const result = await service.executeSwap({
          fromToken: args.fromToken,
          toToken: args.toToken,
          amount: args.amount,
          slippageTolerance: args.slippageTolerance,
          direction: args.direction,
        });

        // =====================================================================
        // 4. Record Payment and Log Success
        // =====================================================================
        // Record the swap as a payment for spending tracking
        security.recordPayment({
          token: result.fromTokenSymbol,
          to: result.toToken as Address,
          amount: result.amountIn,
        });

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'swap_stablecoins',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.transactionHash,
          gasCost: result.gasCost,
        });

        // =====================================================================
        // 5. Format Response
        // =====================================================================
        const output = createSwapSuccessResponse({
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          fromToken: result.fromToken,
          fromTokenSymbol: result.fromTokenSymbol,
          toToken: result.toToken,
          toTokenSymbol: result.toTokenSymbol,
          amountIn: result.amountIn,
          amountOut: result.amountOut,
          effectiveRate: result.effectiveRate,
          slippage: result.slippage,
          gasCost: result.gasCost,
          explorerUrl: buildExplorerTxUrl(
            config.network.explorerUrl,
            result.transactionHash
          ),
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(output, null, 2),
            },
          ],
        };
      } catch (error) {
        // =====================================================================
        // Error Handling
        // =====================================================================
        const normalizedError = normalizeError(error);
        const durationMs = Date.now() - ctx.startTime;

        // Log the error appropriately
        if (isTempoMcpError(error) && error.name === 'SecurityError') {
          await security.logRejected({
            requestId: ctx.requestId,
            tool: 'swap_stablecoins',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'swap_stablecoins',
            arguments: logArgs,
            durationMs,
            errorMessage: normalizedError.message,
            errorCode: normalizedError.code,
          });
        }

        // Create error response
        const errorOutput = createExchangeErrorResponse({
          code: normalizedError.code,
          message: normalizedError.message,
          details: normalizedError.details,
          recoverable: normalizedError.recoverable,
          retryAfter: normalizedError.retryAfter,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(errorOutput, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Get Swap Quote Tool
 *
 * MCP tool for getting stablecoin swap quotes from Tempo's native DEX.
 * This is a read-only operation that queries current exchange rates.
 */

import { server } from '../../server.js';
import { getExchangeService } from '../../services/exchange-service.js';
import { normalizeError } from '../../utils/index.js';
import {
  getSwapQuoteInputSchema,
  createQuoteResponse,
  createExchangeErrorResponse,
  type GetSwapQuoteInput,
} from './schemas.js';

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * Register the get_swap_quote tool with the MCP server.
 *
 * This tool allows AI agents to get price quotes for stablecoin swaps
 * without executing transactions. Useful for:
 * - Checking exchange rates
 * - Estimating swap outcomes
 * - Comparing before executing
 */
export function registerGetSwapQuoteTool(): void {
  server.registerTool(
    'get_swap_quote',
    {
      title: 'Get Swap Quote',
      description:
        'Get a price quote for swapping stablecoins on Tempo DEX. ' +
        'Returns the expected input/output amounts and exchange rate. ' +
        'Use "exactIn" direction to specify sell amount, "exactOut" to specify buy amount.',
      inputSchema: getSwapQuoteInputSchema,
    },
    async (args: GetSwapQuoteInput) => {
      try {
        // Get quote from exchange service
        const service = getExchangeService();
        const quote = await service.getQuote({
          fromToken: args.fromToken,
          toToken: args.toToken,
          amount: args.amount,
          direction: args.direction,
        });

        // Format response
        const output = createQuoteResponse({
          fromToken: quote.fromToken,
          fromTokenSymbol: quote.fromTokenSymbol,
          toToken: quote.toToken,
          toTokenSymbol: quote.toTokenSymbol,
          amountIn: quote.amountIn,
          amountOut: quote.amountOut,
          rate: quote.rate,
          inverseRate: quote.inverseRate,
          direction: quote.direction,
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
        // Normalize and return error
        const normalizedError = normalizeError(error);

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

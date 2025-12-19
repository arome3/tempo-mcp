/**
 * Exchange Tools
 *
 * Tools for stablecoin swaps via Tempo's native DEX.
 *
 * Tools in this category:
 * - get_swap_quote: Get price quote for stablecoin swap (low risk)
 * - swap_stablecoins: Execute stablecoin-to-stablecoin swap (high risk)
 */

import { registerGetSwapQuoteTool } from './get-swap-quote.js';
import { registerSwapStablecoinsTool } from './swap-stablecoins.js';

// Re-export schemas and types for external use
export {
  // Input schemas
  getSwapQuoteInputSchema,
  swapStablecoinsInputSchema,
  // Output schemas
  getSwapQuoteOutputSchema,
  swapStablecoinsOutputSchema,
  exchangeErrorSchema,
  // Types
  type GetSwapQuoteInput,
  type SwapStablecoinsInput,
  type GetSwapQuoteOutput,
  type SwapStablecoinsOutput,
  type ExchangeError,
  type GetSwapQuoteResult,
  type SwapStablecoinsResult,
  // Helper functions
  createQuoteResponse,
  createSwapSuccessResponse,
  createExchangeErrorResponse,
} from './schemas.js';

/**
 * Register all exchange tools with the MCP server.
 *
 * Registers:
 * - get_swap_quote: Read-only quote retrieval
 * - swap_stablecoins: Swap execution with security validation
 */
export function registerExchangeTools(): void {
  // Quote tool (read-only, low risk)
  registerGetSwapQuoteTool();

  // Swap tool (high risk, full security)
  registerSwapStablecoinsTool();
}

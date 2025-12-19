/**
 * Transaction Tools
 *
 * Tools for querying transaction details and estimating gas on Tempo blockchain.
 * These are LOW RISK read-only tools that don't modify blockchain state.
 *
 * Tools in this category:
 * - get_transaction: Get detailed transaction info by hash
 * - get_gas_estimate: Estimate gas cost for a transaction
 */

import { type Address, type Hash, type Hex } from 'viem';
import { server } from '../../server.js';
import { getTransactionService } from '../../services/transaction-service.js';
import { normalizeError } from '../../utils/errors.js';
import {
  getTransactionInputSchema,
  getGasEstimateInputSchema,
  type GetTransactionInput,
  type GetGasEstimateInput,
} from './transaction-schemas.js';

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * Register all transaction-related tools with the MCP server.
 */
export function registerTransactionTools(): void {
  registerGetTransactionTool();
  registerGetGasEstimateTool();
}

// =============================================================================
// get_transaction Tool
// =============================================================================

/**
 * Register the get_transaction tool.
 *
 * Returns detailed information about a transaction including:
 * - Block and confirmation info
 * - Status (success, reverted, pending)
 * - TIP-20 transfer details if applicable
 * - Decoded memo for reconciliation
 * - Gas costs in fee token
 */
function registerGetTransactionTool(): void {
  server.registerTool(
    'get_transaction',
    {
      title: 'Get Transaction',
      description:
        'Get detailed information about a transaction by hash. ' +
        'Returns status, gas costs, and TIP-20 transfer details including decoded memos.',
      inputSchema: getTransactionInputSchema,
    },
    async (args: GetTransactionInput) => {
      try {
        const service = getTransactionService();
        const result = await service.getTransaction(args.hash as Hash);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const normalized = normalizeError(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: {
                    code: normalized.code,
                    message: normalized.message,
                    details: normalized.details,
                    recoverable: normalized.recoverable,
                  },
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

// =============================================================================
// get_gas_estimate Tool
// =============================================================================

/**
 * Register the get_gas_estimate tool.
 *
 * Estimates the gas cost for a transaction including:
 * - Gas limit (with safety multiplier applied)
 * - Current gas price
 * - Estimated total cost in fee token
 */
function registerGetGasEstimateTool(): void {
  server.registerTool(
    'get_gas_estimate',
    {
      title: 'Get Gas Estimate',
      description:
        'Estimate the gas cost for a transaction on Tempo blockchain. ' +
        'Returns gas limit, price, and estimated cost in fee token (stablecoin).',
      inputSchema: getGasEstimateInputSchema,
    },
    async (args: GetGasEstimateInput) => {
      try {
        const service = getTransactionService();

        // Parse value to bigint if provided
        const value = args.value ? BigInt(args.value) : undefined;

        const result = await service.estimateGas({
          to: args.to as Address,
          data: args.data as Hex | undefined,
          value,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const normalized = normalizeError(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: {
                    code: normalized.code,
                    message: normalized.message,
                    details: normalized.details,
                    recoverable: normalized.recoverable,
                  },
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

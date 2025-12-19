/**
 * Account Tools
 *
 * Tools for querying account information, balances, and transaction details.
 * These are LOW RISK read-only tools that don't modify blockchain state.
 *
 * Balance tools:
 * - get_balance: Get single token balance for an address
 * - get_balances: Get multiple token balances
 * - get_account_info: Get comprehensive account details
 *
 * Transaction tools:
 * - get_transaction: Get transaction details by hash
 * - get_gas_estimate: Estimate gas cost for a transaction
 */

import { type Address } from 'viem';
import { server } from '../../server.js';
import { getBalanceService } from '../../services/balance-service.js';
import { normalizeError } from '../../utils/errors.js';
import {
  getBalanceInputSchema,
  getBalancesInputSchema,
  getAccountInfoInputSchema,
  type GetBalanceInput,
  type GetBalancesInput,
  type GetAccountInfoInput,
} from './schemas.js';
import { registerTransactionTools } from './transaction-tools.js';

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * Register all account-related tools with the MCP server.
 */
export function registerAccountTools(): void {
  // Balance tools
  registerGetBalanceTool();
  registerGetBalancesTool();
  registerGetAccountInfoTool();

  // Transaction tools
  registerTransactionTools();
}

// =============================================================================
// get_balance Tool
// =============================================================================

/**
 * Register the get_balance tool.
 *
 * Returns the balance of a specific TIP-20 token for an address.
 */
function registerGetBalanceTool(): void {
  server.registerTool(
    'get_balance',
    {
      title: 'Get Balance',
      description:
        'Get the TIP-20 token balance for an address on Tempo blockchain. ' +
        'Returns the balance in both human-readable and raw formats.',
      inputSchema: getBalanceInputSchema,
    },
    async (args: GetBalanceInput) => {
      try {
        const service = getBalanceService();
        const address = (args.address as Address | undefined) ?? service.getDefaultAddress();
        const result = await service.getBalance(args.token, address);

        // Include the address in the response (consistent with get_balances)
        const response = {
          address,
          ...result,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response, null, 2),
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
// get_balances Tool
// =============================================================================

/**
 * Register the get_balances tool.
 *
 * Returns balances for multiple tokens at once.
 */
function registerGetBalancesTool(): void {
  server.registerTool(
    'get_balances',
    {
      title: 'Get Balances',
      description:
        'Get balances for multiple TIP-20 tokens at once. ' +
        'If no tokens specified, returns balances for all configured tokens.',
      inputSchema: getBalancesInputSchema,
    },
    async (args: GetBalancesInput) => {
      try {
        const service = getBalanceService();

        // Default to configured tokens if none specified
        const tokens = args.tokens ?? ['AlphaUSD'];
        const address = args.address as Address | undefined;

        const balances = await service.getBalances(tokens, address);

        // Get the actual address used (for response)
        const resolvedAddress = address ?? service.getDefaultAddress();

        const result = {
          address: resolvedAddress,
          balances: balances.map((b) => ({
            token: b.token,
            tokenSymbol: b.tokenSymbol,
            tokenName: b.tokenName,
            balance: b.balance,
            balanceRaw: b.balanceRaw,
            decimals: b.decimals,
          })),
        };

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
// get_account_info Tool
// =============================================================================

/**
 * Register the get_account_info tool.
 *
 * Returns comprehensive account information including type, balances,
 * and transaction count.
 */
function registerGetAccountInfoTool(): void {
  server.registerTool(
    'get_account_info',
    {
      title: 'Get Account Info',
      description:
        'Get comprehensive account information including type (EOA or contract), ' +
        'all non-zero token balances, and transaction count.',
      inputSchema: getAccountInfoInputSchema,
    },
    async (args: GetAccountInfoInput) => {
      try {
        const service = getBalanceService();
        const info = await service.getAccountInfo(args.address as Address | undefined);

        const result = {
          address: info.address,
          type: info.type,
          balances: info.balances,
          transactionCount: info.transactionCount,
          firstSeen: info.firstSeen,
          lastActive: info.lastActive,
        };

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

/**
 * Concurrent Transaction Tools
 *
 * Tools for parallel transaction execution using Tempo's nonceKey feature.
 *
 * Tools in this category:
 * - send_concurrent_payments: Send multiple payments in parallel (High risk)
 * - get_nonce_for_key: Get nonce for specific key (Low risk)
 * - list_active_nonce_keys: List all used nonce keys (Low risk)
 *
 * Concurrent transactions enable massive parallelization by using
 * different nonceKey values (0-255) for each transaction, eliminating
 * the sequential confirmation bottleneck.
 */

import type { Address, Hex } from 'viem';
import { parseUnits, pad, stringToHex, formatUnits } from 'viem';
import { server } from '../../server.js';
import { getConfig } from '../../config/index.js';
import {
  getConcurrentService,
  type ConcurrentPayment,
} from '../../services/concurrent-service.js';
import { resolveTokenAddress, getTokenMetadata } from '../../services/token-service.js';
import { getSecurityLayer } from '../../security/index.js';
import { buildExplorerTxUrl } from '../../utils/formatting.js';
import { normalizeError, isTempoMcpError } from '../../utils/errors.js';
import { createRequestContext } from '../../types/index.js';
import {
  // Input schemas
  sendConcurrentPaymentsInputSchema,
  getNonceForKeyInputSchema,
  listActiveNonceKeysInputSchema,
  // Response helpers
  createConcurrentPaymentsResponse,
  createGetNonceForKeyResponse,
  createListActiveNonceKeysResponse,
  createConcurrentErrorResponse,
  // Types
  type SendConcurrentPaymentsInput,
  type GetNonceForKeyInput,
  type ListActiveNonceKeysInput,
  type ConcurrentTransactionResult,
} from './schemas.js';

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * Register all concurrent transaction tools with the MCP server.
 */
export function registerConcurrentTools(): void {
  registerSendConcurrentPaymentsTool();
  registerGetNonceForKeyTool();
  registerListActiveNonceKeysTool();
}

// =============================================================================
// send_concurrent_payments Tool
// =============================================================================

function registerSendConcurrentPaymentsTool(): void {
  server.registerTool(
    'send_concurrent_payments',
    {
      title: 'Send Concurrent Payments',
      description:
        'Send multiple TIP-20 payments in parallel using different nonce keys. ' +
        'Each payment executes on a separate nonce channel, enabling 10-100x faster ' +
        'batch processing compared to sequential transactions. ' +
        'Ideal for payroll, airdrops, and multi-vendor settlements. ' +
        'Large batches are automatically chunked to avoid rate limits.',
      inputSchema: sendConcurrentPaymentsInputSchema,
    },
    async (args: SendConcurrentPaymentsInput) => {
      const ctx = createRequestContext('send_concurrent_payments');
      const config = getConfig();
      const concurrentService = getConcurrentService();
      const security = getSecurityLayer();

      const logArgs = {
        paymentCount: args.payments.length,
        startNonceKey: args.startNonceKey ?? 1,
        waitForConfirmation: args.waitForConfirmation ?? true,
      };

      try {
        // Build payment params, resolving tokens and parsing amounts
        const payments: ConcurrentPayment[] = await Promise.all(
          args.payments.map(async (p) => {
            const tokenAddress = resolveTokenAddress(p.token);

            // Get token metadata for decimals
            let decimals = 6; // Default for USD stablecoins
            try {
              const metadata = await getTokenMetadata(tokenAddress);
              decimals = metadata.decimals;
            } catch {
              // Use default decimals if metadata fetch fails
            }

            const amountWei = parseUnits(p.amount, decimals);

            // Convert memo to bytes32 if provided
            let memoBytes: Hex | undefined;
            if (p.memo) {
              memoBytes = pad(stringToHex(p.memo), { size: 32 });
            }

            return {
              token: tokenAddress,
              to: p.to as Address,
              amount: amountWei,
              memo: memoBytes,
              tokenSymbol: p.token,
            };
          })
        );

        // Calculate total amount for logging (assuming same token)
        const totalAmount = payments.reduce(
          (sum, p) => sum + p.amount,
          BigInt(0)
        );
        const totalAmountFormatted = formatUnits(totalAmount, 6);

        // Send concurrent payments
        const result = await concurrentService.sendConcurrentPayments(
          payments,
          args.startNonceKey ?? 1,
          args.waitForConfirmation ?? true
        );

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'send_concurrent_payments',
          arguments: {
            ...logArgs,
            totalAmount: totalAmountFormatted,
            confirmedPayments: result.confirmedPayments,
            failedPayments: result.failedPayments,
          },
          durationMs: Date.now() - ctx.startTime,
        });

        // Build detailed transaction results for response
        const transactions: ConcurrentTransactionResult[] = result.results.map(
          (r, index) => ({
            nonceKey: r.nonceKey,
            transactionHash: r.hash,
            to: args.payments[index].to,
            amount: args.payments[index].amount,
            token: payments[index].token,
            tokenSymbol: args.payments[index].token,
            memo: args.payments[index].memo ?? null,
            status: r.status,
            error: r.error,
            explorerUrl: r.hash
              ? buildExplorerTxUrl(config.network.explorerUrl, r.hash)
              : undefined,
          })
        );

        // Build response
        const output = createConcurrentPaymentsResponse({
          success: result.success,
          totalPayments: result.totalPayments,
          confirmedPayments: result.confirmedPayments,
          failedPayments: result.failedPayments,
          pendingPayments: result.pendingPayments,
          transactions,
          totalAmount: totalAmountFormatted,
          totalDuration: `${result.durationMs}ms`,
          chunksProcessed: result.chunksProcessed,
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
        const normalized = normalizeError(error);
        const durationMs = Date.now() - ctx.startTime;

        if (isTempoMcpError(error) && error.name === 'SecurityError') {
          await security.logRejected({
            requestId: ctx.requestId,
            tool: 'send_concurrent_payments',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'send_concurrent_payments',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createConcurrentErrorResponse({
          code: normalized.code,
          message: normalized.message,
          details: normalized.details,
          recoverable: normalized.recoverable,
          retryAfter: normalized.retryAfter,
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

// =============================================================================
// get_nonce_for_key Tool
// =============================================================================

function registerGetNonceForKeyTool(): void {
  server.registerTool(
    'get_nonce_for_key',
    {
      title: 'Get Nonce for Key',
      description:
        'Get the current transaction nonce for a specific nonce key (0-255). ' +
        'Each nonce key maintains an independent sequence, enabling parallel ' +
        'transaction execution. Use this to check how many transactions have ' +
        'been sent on a particular nonce channel.',
      inputSchema: getNonceForKeyInputSchema,
    },
    async (args: GetNonceForKeyInput) => {
      try {
        const concurrentService = getConcurrentService();

        // Get nonce for the specified key
        const nonce = await concurrentService.getNonceForKey(
          args.nonceKey,
          args.address as Address | undefined
        );

        // Determine the address used
        let address = args.address;
        if (!address) {
          // Use the service's internal client to get wallet address
          address = concurrentService['client'].getAddress();
        }

        // Build response
        const output = createGetNonceForKeyResponse({
          nonceKey: args.nonceKey,
          nonce: nonce.toString(),
          address: address as string,
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
        const normalized = normalizeError(error);

        const errorOutput = createConcurrentErrorResponse({
          code: normalized.code,
          message: normalized.message,
          details: normalized.details,
          recoverable: normalized.recoverable,
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

// =============================================================================
// list_active_nonce_keys Tool
// =============================================================================

function registerListActiveNonceKeysTool(): void {
  server.registerTool(
    'list_active_nonce_keys',
    {
      title: 'List Active Nonce Keys',
      description:
        'List all nonce keys that have been used (have nonce > 0) for an address. ' +
        'This helps identify which parallel execution channels have been utilized ' +
        'and how many transactions each has processed.',
      inputSchema: listActiveNonceKeysInputSchema,
    },
    async (args: ListActiveNonceKeysInput) => {
      try {
        const concurrentService = getConcurrentService();

        // List active nonce keys
        const activeKeys = await concurrentService.listActiveNonceKeys(
          args.address as Address | undefined
        );

        // Determine the address used
        let address = args.address;
        if (!address) {
          address = concurrentService['client'].getAddress();
        }

        // Build response
        const output = createListActiveNonceKeysResponse({
          address: address as string,
          activeKeys: activeKeys.map((k) => ({
            nonceKey: k.key,
            currentNonce: k.nonce.toString(),
            transactionsExecuted: k.nonce.toString(),
          })),
          totalActiveKeys: activeKeys.length,
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
        const normalized = normalizeError(error);

        const errorOutput = createConcurrentErrorResponse({
          code: normalized.code,
          message: normalized.message,
          details: normalized.details,
          recoverable: normalized.recoverable,
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

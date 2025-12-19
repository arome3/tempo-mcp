/**
 * Batch Payments Tool
 *
 * MCP tool for sending atomic multi-recipient TIP-20 payments on Tempo blockchain.
 * All payments in a batch succeed or fail together, making it ideal for
 * payroll processing, vendor payouts, and dividend distributions.
 *
 * Features:
 * - Atomic execution (all succeed or all fail)
 * - Gas efficiency (single transaction for multiple transfers)
 * - Per-payment memos for reconciliation
 * - Human-readable labels for recipients
 */

import {
  parseUnits,
  formatUnits,
  encodeFunctionData,
  type Address,
} from 'viem';

import { server } from '../../server.js';
import {
  getTempoClient,
  TIP20_ABI,
  type BatchCall,
} from '../../services/tempo-client.js';
import { getConfig } from '../../config/index.js';
import { getSecurityLayer } from '../../security/index.js';
import {
  stringToBytes32,
  buildExplorerTxUrl,
  isTempoMcpError,
  normalizeError,
  ValidationError,
} from '../../utils/index.js';
import { createRequestContext } from '../../types/index.js';
import {
  batchPaymentsInputSchema,
  calculateBatchTotal,
  createBatchSuccessResponse,
  createBatchErrorResponse,
  type BatchPaymentsInput,
} from './batch-schemas.js';

// =============================================================================
// Token Resolution
// =============================================================================

/**
 * Resolve token identifier to address.
 *
 * Accepts either a token address (0x...) or a symbol (AlphaUSD).
 * Looks up symbols in the configured token aliases.
 *
 * @param tokenInput - Token address or symbol
 * @returns Resolved token address
 * @throws ValidationError if token not found
 */
function resolveTokenAddress(tokenInput: string): Address {
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
 * Get token metadata from the contract.
 *
 * @param tokenAddress - Token contract address
 * @returns Token decimals and symbol
 */
async function getTokenMetadata(
  tokenAddress: Address
): Promise<{ decimals: number; symbol: string }> {
  const client = getTempoClient();

  // Read decimals and symbol in parallel
  const [decimals, symbol] = await Promise.all([
    client['publicClient'].readContract({
      address: tokenAddress,
      abi: TIP20_ABI,
      functionName: 'decimals',
    }) as Promise<number>,
    client['publicClient'].readContract({
      address: tokenAddress,
      abi: TIP20_ABI,
      functionName: 'symbol',
    }) as Promise<string>,
  ]);

  return { decimals, symbol };
}

// =============================================================================
// Batch Call Encoding
// =============================================================================

/**
 * Encode a single transfer call for the batch.
 *
 * @param tokenAddress - Token contract address
 * @param to - Recipient address
 * @param amount - Amount in wei
 * @param memo - Optional memo (already converted to bytes32)
 * @returns BatchCall object for sendBatch
 */
function encodeTransferCall(
  tokenAddress: Address,
  to: Address,
  amount: bigint,
  memo?: `0x${string}`
): BatchCall {
  if (memo) {
    return {
      to: tokenAddress,
      data: encodeFunctionData({
        abi: TIP20_ABI,
        functionName: 'transferWithMemo',
        args: [to, amount, memo],
      }),
    };
  }

  return {
    to: tokenAddress,
    data: encodeFunctionData({
      abi: TIP20_ABI,
      functionName: 'transfer',
      args: [to, amount],
    }),
  };
}

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * Register the batch_payments tool with the MCP server.
 *
 * This tool allows AI agents to send multiple TIP-20 payments
 * in a single atomic transaction on the Tempo blockchain.
 */
export function registerBatchPaymentsTool(): void {
  server.registerTool(
    'batch_payments',
    {
      title: 'Batch Payments',
      description:
        'Send multiple TIP-20 stablecoin payments in a single atomic transaction. ' +
        'All payments succeed or all fail together. ' +
        'Ideal for payroll, vendor payouts, and mass transfers. ' +
        'More gas-efficient than individual payments.',
      inputSchema: batchPaymentsInputSchema,
    },
    async (args: BatchPaymentsInput) => {
      // Create request context for tracing
      const ctx = createRequestContext('batch_payments');
      const security = getSecurityLayer();
      const config = getConfig();

      // Create sanitized args for logging
      const logArgs = {
        token: args.token,
        recipientCount: args.payments.length,
        // Don't log individual payment details for privacy
      };

      try {
        // =====================================================================
        // 1. Validate Batch Size
        // =====================================================================
        const maxBatchSize = config.security.spendingLimits.maxBatchSize;
        if (args.payments.length > maxBatchSize) {
          throw new ValidationError(
            1005,
            `Batch size ${args.payments.length} exceeds maximum of ${maxBatchSize}`,
            {
              details: {
                received: `${args.payments.length} payments`,
                expected: `Maximum ${maxBatchSize} payments`,
                suggestion: 'Split into multiple smaller batches',
              },
              recoverable: true,
            }
          );
        }

        // =====================================================================
        // 2. Resolve Token
        // =====================================================================
        const tokenAddress = resolveTokenAddress(args.token);
        const { decimals, symbol: tokenSymbol } =
          await getTokenMetadata(tokenAddress);

        // =====================================================================
        // 3. Calculate Total Amount
        // =====================================================================
        const totalAmount = calculateBatchTotal(args.payments);

        // =====================================================================
        // 4. Security Validation
        // =====================================================================
        // SECURITY FIX: Validate batch using total amount (not first payment amount)
        // This ensures batch limits are properly enforced
        await security.validatePayment({
          token: tokenSymbol,
          to: args.payments[0].to as Address,
          amount: totalAmount, // Use batch total, not individual payment
          isBatch: true,
          batchTotal: totalAmount,
          recipientCount: args.payments.length,
        });

        // Validate each recipient against allowlist (if enabled)
        // SECURITY FIX: Only check allowlist, not spending limits (already validated above)
        // Previous code double-counted by validating each payment individually
        const allowlistManager = security.getAddressAllowlist();
        for (const payment of args.payments) {
          allowlistManager.validate(payment.to as Address);
        }

        // =====================================================================
        // 5. Encode Batch Calls
        // =====================================================================
        const calls: BatchCall[] = args.payments.map((payment) => {
          const amountWei = parseUnits(payment.amount, decimals);
          const memoBytes = payment.memo
            ? stringToBytes32(payment.memo)
            : undefined;

          return encodeTransferCall(
            tokenAddress,
            payment.to as Address,
            amountWei,
            memoBytes
          );
        });

        // =====================================================================
        // 6. Execute Batch Transaction
        // =====================================================================
        const client = getTempoClient();
        const transactionHash = await client.sendBatch(calls);

        // =====================================================================
        // 7. Wait for Confirmation
        // =====================================================================
        const receipt = await client.waitForTransaction(transactionHash);

        // Check transaction status
        if (receipt.status !== 'success') {
          throw new Error(
            `Batch transaction reverted. Hash: ${transactionHash}`
          );
        }

        // =====================================================================
        // 8. Record Payments
        // =====================================================================
        for (const payment of args.payments) {
          security.recordPayment({
            token: tokenSymbol,
            to: payment.to as Address,
            amount: payment.amount,
          });
        }

        // =====================================================================
        // 9. Calculate Gas Metrics
        // =====================================================================
        const gasCost = formatUnits(receipt.gasUsed, decimals);
        const gasPerPayment = formatUnits(
          receipt.gasUsed / BigInt(args.payments.length),
          decimals
        );

        // =====================================================================
        // 10. Log Success
        // =====================================================================
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'batch_payments',
          arguments: {
            ...logArgs,
            totalAmount,
          },
          durationMs: Date.now() - ctx.startTime,
          transactionHash,
          gasCost,
        });

        // =====================================================================
        // 11. Format Response
        // =====================================================================
        const output = createBatchSuccessResponse({
          transactionHash,
          blockNumber: Number(receipt.blockNumber),
          token: tokenAddress,
          tokenSymbol,
          totalAmount,
          recipientCount: args.payments.length,
          payments: args.payments.map((p) => ({
            to: p.to,
            amount: p.amount,
            memo: p.memo ?? null,
            label: p.label ?? null,
            status: 'success' as const,
          })),
          gasCost,
          gasPerPayment,
          explorerUrl: buildExplorerTxUrl(
            config.network.explorerUrl,
            transactionHash
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

        // Log the error
        if (isTempoMcpError(error) && error.name === 'SecurityError') {
          await security.logRejected({
            requestId: ctx.requestId,
            tool: 'batch_payments',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'batch_payments',
            arguments: logArgs,
            durationMs,
            errorMessage: normalizedError.message,
            errorCode: normalizedError.code,
          });
        }

        // Create error response
        const errorOutput = createBatchErrorResponse({
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

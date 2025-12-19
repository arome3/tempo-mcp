/**
 * Send Payment Tool
 *
 * MCP tool for sending TIP-20 stablecoin payments on Tempo blockchain.
 * Supports optional memo for invoice reconciliation.
 *
 * Features:
 * - Token resolution (symbol or address)
 * - Security validation (spending limits, allowlist, rate limiting)
 * - Memo support for reconciliation
 * - Audit logging
 */

import { parseUnits, formatUnits, type Address } from 'viem';

import { server } from '../../server.js';
import { getTempoClient, TIP20_ABI } from '../../services/tempo-client.js';
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
  sendPaymentInputSchema,
  createSuccessResponse,
  createErrorResponse,
  type SendPaymentInput,
} from './schemas.js';

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
// Tool Registration
// =============================================================================

/**
 * Register the send_payment tool with the MCP server.
 *
 * This tool allows AI agents to send TIP-20 stablecoin payments
 * on the Tempo blockchain with optional memo support.
 */
export function registerSendPaymentTool(): void {
  server.registerTool(
    'send_payment',
    {
      title: 'Send Payment',
      description:
        'Send a TIP-20 stablecoin payment on Tempo blockchain. ' +
        'Supports optional memo for invoice reconciliation. ' +
        'Returns transaction hash and explorer link on success.',
      inputSchema: sendPaymentInputSchema,
    },
    async (args: SendPaymentInput) => {
      // Create request context for tracing
      const ctx = createRequestContext('send_payment');
      const security = getSecurityLayer();
      const config = getConfig();

      // Create sanitized args for logging (same as input for payments)
      const logArgs = {
        token: args.token,
        to: args.to,
        amount: args.amount,
        memo: args.memo ?? null,
      };

      try {
        // =====================================================================
        // 1. Resolve Token
        // =====================================================================
        const tokenAddress = resolveTokenAddress(args.token);
        const { decimals, symbol: tokenSymbol } =
          await getTokenMetadata(tokenAddress);

        // =====================================================================
        // 2. Security Validation
        // =====================================================================
        await security.validatePayment({
          token: tokenSymbol,
          to: args.to as Address,
          amount: args.amount,
        });

        // =====================================================================
        // 3. Execute Payment
        // =====================================================================
        const client = getTempoClient();
        const amountWei = parseUnits(args.amount, decimals);

        let transactionHash: `0x${string}`;

        if (args.memo) {
          // Use transferWithMemo for payments with memo
          const memoBytes = stringToBytes32(args.memo);
          transactionHash = await client.sendTransferWithMemo(
            tokenAddress,
            args.to as Address,
            amountWei,
            memoBytes
          );
        } else {
          // Use standard transfer
          transactionHash = await client.sendTransfer(
            tokenAddress,
            args.to as Address,
            amountWei
          );
        }

        // =====================================================================
        // 4. Wait for Confirmation
        // =====================================================================
        const receipt = await client.waitForTransaction(transactionHash);

        // =====================================================================
        // 5. Record Payment and Log Success
        // =====================================================================
        security.recordPayment({
          token: tokenSymbol,
          to: args.to as Address,
          amount: args.amount,
        });

        const gasCost = formatUnits(receipt.gasUsed, decimals);

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'send_payment',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash,
          gasCost,
        });

        // =====================================================================
        // 6. Format Response
        // =====================================================================
        const output = createSuccessResponse({
          transactionHash,
          blockNumber: Number(receipt.blockNumber),
          from: client.getAddress(),
          to: args.to,
          amount: args.amount,
          amountRaw: amountWei.toString(),
          token: tokenAddress,
          tokenSymbol,
          memo: args.memo ?? null,
          gasCost,
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
            tool: 'send_payment',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'send_payment',
            arguments: logArgs,
            durationMs,
            errorMessage: normalizedError.message,
            errorCode: normalizedError.code,
          });
        }

        // Create error response
        const errorOutput = createErrorResponse({
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

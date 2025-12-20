/**
 * Sponsorship Tools
 *
 * Tools for fee-sponsored (gasless) transactions on Tempo blockchain.
 *
 * Tools in this category:
 * - send_sponsored_payment: Send payment with fee payer covering gas (High risk)
 * - estimate_sponsored_gas: Estimate gas cost for sponsored tx (Low risk)
 * - get_sponsor_balance: Check fee payer account balance (Low risk)
 *
 * Fee sponsorship enables gasless UX where a third party (sponsor) pays
 * gas fees on behalf of the transaction sender.
 */

import type { Address, Hex } from 'viem';
import { parseUnits, pad, stringToHex } from 'viem';
import { server } from '../../server.js';
import { getConfig } from '../../config/index.js';
import {
  getSponsorshipService,
  type SponsoredPaymentParams,
} from '../../services/sponsorship-service.js';
import { resolveTokenAddress } from '../../services/token-service.js';
import { getSecurityLayer } from '../../security/index.js';
import { buildExplorerTxUrl } from '../../utils/formatting.js';
import { normalizeError, isTempoMcpError } from '../../utils/errors.js';
import { createRequestContext } from '../../types/index.js';
import {
  // Input schemas
  sendSponsoredPaymentInputSchema,
  estimateSponsoredGasInputSchema,
  getSponsorBalanceInputSchema,
  // Response helpers
  createSponsoredPaymentResponse,
  createEstimateSponsoredGasResponse,
  createSponsorBalanceResponse,
  createSponsorshipErrorResponse,
  // Types
  type SendSponsoredPaymentInput,
  type EstimateSponsoredGasInput,
  type GetSponsorBalanceInput,
} from './schemas.js';

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * Register all sponsorship tools with the MCP server.
 */
export function registerSponsorshipTools(): void {
  registerSendSponsoredPaymentTool();
  registerEstimateSponsoredGasTool();
  registerGetSponsorBalanceTool();
}

// =============================================================================
// send_sponsored_payment Tool
// =============================================================================

function registerSendSponsoredPaymentTool(): void {
  server.registerTool(
    'send_sponsored_payment',
    {
      title: 'Send Sponsored Payment',
      description:
        'Send a TIP-20 payment with gas fees paid by a sponsor (gasless transaction). ' +
        'The fee payer can be a configured local account or the Tempo testnet relay service. ' +
        'Use useRelay=true to use the Tempo testnet sponsor relay. ' +
        'Optionally include a memo for payment reconciliation.',
      inputSchema: sendSponsoredPaymentInputSchema,
    },
    async (args: SendSponsoredPaymentInput) => {
      const ctx = createRequestContext('send_sponsored_payment');
      const config = getConfig();
      const sponsorshipService = getSponsorshipService();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
        to: args.to,
        amount: args.amount,
        memo: args.memo ?? null,
        useRelay: args.useRelay ?? false,
      };

      try {
        // Check if fee sponsorship is enabled
        if (!config.feeSponsorship.enabled) {
          throw new Error(
            'Fee sponsorship is not enabled. Set TEMPO_FEE_SPONSORSHIP_ENABLED=true in your environment.'
          );
        }

        // Resolve token address
        const tokenAddress = resolveTokenAddress(args.token);

        // Parse amount to wei (assuming 6 decimals for USD stablecoins)
        const amountWei = parseUnits(args.amount, 6);

        // Convert memo to bytes32 if provided
        let memoBytes: Hex | undefined;
        if (args.memo) {
          memoBytes = pad(stringToHex(args.memo), { size: 32 });
        }

        // Build payment params
        const paymentParams: SponsoredPaymentParams = {
          token: tokenAddress,
          to: args.to as Address,
          amount: amountWei,
          memo: memoBytes,
          feePayer: args.feePayer as Address | undefined,
          useRelay: args.useRelay,
        };

        // Send sponsored payment
        const result = await sponsorshipService.sendSponsoredPayment(paymentParams);

        // Get sender address for response
        const senderAddress = sponsorshipService['client'].getAddress();

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'send_sponsored_payment',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        // Build response
        const output = createSponsoredPaymentResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          from: senderAddress,
          to: args.to,
          amount: args.amount,
          token: tokenAddress,
          tokenSymbol: args.token,
          memo: args.memo ?? null,
          feePayer: result.feePayer,
          feeAmount: result.gasCost,
          feeToken: result.feeToken,
          explorerUrl: buildExplorerTxUrl(config.network.explorerUrl, result.hash),
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
            tool: 'send_sponsored_payment',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'send_sponsored_payment',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createSponsorshipErrorResponse({
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
// estimate_sponsored_gas Tool
// =============================================================================

function registerEstimateSponsoredGasTool(): void {
  server.registerTool(
    'estimate_sponsored_gas',
    {
      title: 'Estimate Sponsored Gas',
      description:
        'Estimate the gas cost that a sponsor would pay for a TIP-20 transfer. ' +
        'Use this to check fees before sending a sponsored payment. ' +
        'Returns gas limit and estimated fee in the fee token.',
      inputSchema: estimateSponsoredGasInputSchema,
    },
    async (args: EstimateSponsoredGasInput) => {
      try {
        const config = getConfig();
        const sponsorshipService = getSponsorshipService();

        // Resolve token addresses
        const tokenAddress = resolveTokenAddress(args.token);
        const feeTokenAddress = args.feeToken
          ? resolveTokenAddress(args.feeToken)
          : tokenAddress;

        // Parse amount to wei
        const amountWei = parseUnits(args.amount, 6);

        // Estimate gas
        const estimate = await sponsorshipService.estimateSponsoredGas({
          token: tokenAddress,
          to: args.to as Address,
          amount: amountWei,
          feeToken: feeTokenAddress,
        });

        // Build response
        const output = createEstimateSponsoredGasResponse({
          gasLimit: estimate.gasLimit.toString(),
          estimatedFee: estimate.estimatedFee,
          feeToken: estimate.feeToken,
          feeTokenSymbol: config.tokens.default,
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

        const errorOutput = createSponsorshipErrorResponse({
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
// get_sponsor_balance Tool
// =============================================================================

function registerGetSponsorBalanceTool(): void {
  server.registerTool(
    'get_sponsor_balance',
    {
      title: 'Get Sponsor Balance',
      description:
        'Get the token balance of a fee sponsor account. ' +
        "Use this to check if the sponsor has sufficient funds to cover gas fees. " +
        'Defaults to the configured fee payer address if not specified.',
      inputSchema: getSponsorBalanceInputSchema,
    },
    async (args: GetSponsorBalanceInput) => {
      try {
        const sponsorshipService = getSponsorshipService();

        // Resolve token address if provided
        const tokenAddress = args.token
          ? resolveTokenAddress(args.token)
          : undefined;

        // Get sponsor balance
        const balanceResult = await sponsorshipService.getSponsorBalance(
          args.sponsor as Address | undefined,
          tokenAddress
        );

        // Build response
        const output = createSponsorBalanceResponse({
          balance: balanceResult.balance,
          balanceRaw: balanceResult.balanceRaw.toString(),
          sponsor: balanceResult.sponsor,
          token: balanceResult.token,
          tokenSymbol: balanceResult.tokenSymbol,
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

        const errorOutput = createSponsorshipErrorResponse({
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

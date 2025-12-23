/**
 * Scheduled Payment Tools
 *
 * MCP tools for scheduling future payments on Tempo blockchain.
 * Leverages TempoTransaction (type 0x76) for protocol-level scheduling.
 *
 * Tools:
 * - schedule_payment: Create a scheduled payment for future execution
 * - cancel_scheduled_payment: Cancel a pending scheduled payment
 */

import { type Address } from 'viem';

import { server } from '../../server.js';
import { getTempoClient, TIP20_ABI } from '../../services/tempo-client.js';
import { getScheduleService } from '../../services/schedule-service.js';
import { getConfig } from '../../config/index.js';
import { getSecurityLayer } from '../../security/index.js';
import {
  buildExplorerTxUrl,
  isTempoMcpError,
  normalizeError,
  ValidationError,
} from '../../utils/index.js';
import { createRequestContext } from '../../types/index.js';
import {
  schedulePaymentInputSchema,
  cancelScheduledPaymentInputSchema,
  createScheduleSuccessResponse,
  createScheduleErrorResponse,
  createCancelSuccessResponse,
  createCancelErrorResponse,
  normalizeDatetime,
  type SchedulePaymentInput,
  type CancelScheduledPaymentInput,
} from './schedule-schemas.js';

// =============================================================================
// Token Resolution (shared with send-payment.ts)
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
// schedule_payment Tool
// =============================================================================

/**
 * Register the schedule_payment tool with the MCP server.
 *
 * This tool allows AI agents to create scheduled payments that
 * execute at a future time on the Tempo blockchain.
 */
export function registerSchedulePaymentTool(): void {
  server.registerTool(
    'schedule_payment',
    {
      title: 'Schedule Payment',
      description:
        'Create a scheduled payment that executes at a future time on Tempo blockchain. ' +
        'Uses protocol-level scheduling via TempoTransaction. ' +
        'Returns schedule ID and transaction hash on success.',
      inputSchema: schedulePaymentInputSchema,
    },
    async (args: SchedulePaymentInput) => {
      // Create request context for tracing
      const ctx = createRequestContext('schedule_payment');
      const security = getSecurityLayer();
      const config = getConfig();
      const scheduleService = getScheduleService();

      // Create sanitized args for logging
      const logArgs = {
        token: args.token,
        to: args.to,
        amount: args.amount,
        memo: args.memo ?? null,
        executeAt: args.executeAt,
        validFrom: args.validFrom ?? null,
        validUntil: args.validUntil ?? null,
        recurring: args.recurring ?? null,
      };

      try {
        // =====================================================================
        // 1. Validate and Normalize Datetime Fields
        // =====================================================================
        // Use normalizeDatetime to catch invalid dates like "2025-12-45" that
        // JavaScript's Date would auto-correct to "2026-01-14"
        let normalizedExecuteAt: string;
        try {
          normalizedExecuteAt = normalizeDatetime(args.executeAt);
        } catch (e) {
          throw ValidationError.custom(
            'executeAt',
            e instanceof Error ? e.message : 'Invalid datetime format',
            args.executeAt
          );
        }

        const executeAt = new Date(normalizedExecuteAt);
        const now = new Date();

        if (executeAt <= now) {
          throw ValidationError.custom(
            'executeAt',
            'Execution time must be in the future',
            args.executeAt
          );
        }

        // Validate validFrom/validUntil if provided
        let validFrom: Date | undefined;
        let validUntil: Date | undefined;

        if (args.validFrom) {
          try {
            validFrom = new Date(normalizeDatetime(args.validFrom));
          } catch (e) {
            throw ValidationError.custom(
              'validFrom',
              e instanceof Error ? e.message : 'Invalid datetime format',
              args.validFrom
            );
          }
        }

        if (args.validUntil) {
          try {
            validUntil = new Date(normalizeDatetime(args.validUntil));
          } catch (e) {
            throw ValidationError.custom(
              'validUntil',
              e instanceof Error ? e.message : 'Invalid datetime format',
              args.validUntil
            );
          }
        }

        if (validFrom && validFrom > executeAt) {
          throw ValidationError.custom(
            'validFrom',
            'validFrom cannot be after executeAt',
            args.validFrom
          );
        }

        if (validUntil && validUntil < executeAt) {
          throw ValidationError.custom(
            'validUntil',
            'validUntil cannot be before executeAt',
            args.validUntil
          );
        }

        // Validate recurring.endDate if provided
        if (args.recurring?.endDate) {
          try {
            normalizeDatetime(args.recurring.endDate);
          } catch (e) {
            throw ValidationError.custom(
              'recurring.endDate',
              e instanceof Error ? e.message : 'Invalid datetime format',
              args.recurring.endDate
            );
          }
        }

        // =====================================================================
        // 2. Resolve Token
        // =====================================================================
        const tokenAddress = resolveTokenAddress(args.token);
        const { decimals, symbol: tokenSymbol } =
          await getTokenMetadata(tokenAddress);

        // =====================================================================
        // 3. Security Validation
        // =====================================================================
        // Validate at schedule creation time (spending limits apply)
        await security.validatePayment({
          token: tokenSymbol,
          to: args.to as Address,
          amount: args.amount,
        });

        // =====================================================================
        // 4. Create Schedule
        // =====================================================================
        const result = await scheduleService.createSchedule({
          tokenAddress,
          tokenSymbol,
          decimals,
          to: args.to as Address,
          amount: args.amount,
          memo: args.memo,
          executeAt,
          validFrom,
          validUntil,
          recurring: args.recurring,
        });

        // =====================================================================
        // 5. Record Payment and Log Success
        // =====================================================================
        // Record the payment for spending limit tracking
        security.recordPayment({
          token: tokenSymbol,
          to: args.to as Address,
          amount: args.amount,
        });

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'schedule_payment',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.transactionHash,
        });

        // =====================================================================
        // 6. Format Response
        // =====================================================================
        const output = createScheduleSuccessResponse({
          scheduleId: result.scheduleId,
          transactionHash: result.transactionHash,
          token: tokenAddress,
          tokenSymbol,
          to: args.to,
          amount: args.amount,
          amountRaw: result.record.amountRaw,
          memo: args.memo ?? null,
          executeAt: args.executeAt,
          validFrom: args.validFrom ?? null,
          validUntil: args.validUntil ?? null,
          recurring: args.recurring
            ? {
                interval: args.recurring.interval,
                endDate: args.recurring.endDate ?? null,
                nextExecution: args.executeAt,
              }
            : null,
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

        // Log the error
        if (isTempoMcpError(error) && error.name === 'SecurityError') {
          await security.logRejected({
            requestId: ctx.requestId,
            tool: 'schedule_payment',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'schedule_payment',
            arguments: logArgs,
            durationMs,
            errorMessage: normalizedError.message,
            errorCode: normalizedError.code,
          });
        }

        // Create error response
        const errorOutput = createScheduleErrorResponse({
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

// =============================================================================
// cancel_scheduled_payment Tool
// =============================================================================

/**
 * Register the cancel_scheduled_payment tool with the MCP server.
 *
 * This tool allows AI agents to cancel a pending scheduled payment
 * before it executes.
 */
export function registerCancelScheduledPaymentTool(): void {
  server.registerTool(
    'cancel_scheduled_payment',
    {
      title: 'Cancel Scheduled Payment',
      description:
        'Cancel a pending scheduled payment before it executes. ' +
        'Only works for schedules that have not yet been executed. ' +
        'Returns confirmation on success.',
      inputSchema: cancelScheduledPaymentInputSchema,
    },
    async (args: CancelScheduledPaymentInput) => {
      // Create request context for tracing
      const ctx = createRequestContext('cancel_scheduled_payment');
      const security = getSecurityLayer();
      const scheduleService = getScheduleService();

      // Create sanitized args for logging
      const logArgs = {
        scheduleId: args.scheduleId,
      };

      try {
        // =====================================================================
        // 1. Get Schedule Record
        // =====================================================================
        const record = scheduleService.getSchedule(args.scheduleId);

        if (!record) {
          throw ValidationError.custom(
            'scheduleId',
            'Schedule not found',
            args.scheduleId
          );
        }

        // =====================================================================
        // 2. Cancel Schedule
        // =====================================================================
        await scheduleService.cancelSchedule(args.scheduleId);

        // =====================================================================
        // 3. Log Success
        // =====================================================================
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'cancel_scheduled_payment',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
        });

        // =====================================================================
        // 4. Format Response
        // =====================================================================
        const output = createCancelSuccessResponse(args.scheduleId);

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

        // SECURITY FIX: Consistent error logging (check for SecurityError)
        if (isTempoMcpError(error) && error.name === 'SecurityError') {
          await security.logRejected({
            requestId: ctx.requestId,
            tool: 'cancel_scheduled_payment',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'cancel_scheduled_payment',
            arguments: logArgs,
            durationMs,
            errorMessage: normalizedError.message,
            errorCode: normalizedError.code,
          });
        }

        // Create error response
        const errorOutput = createCancelErrorResponse({
          code: normalizedError.code,
          message: normalizedError.message,
          details: normalizedError.details,
          recoverable: normalizedError.recoverable,
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
// Combined Registration
// =============================================================================

/**
 * Register all scheduled payment tools with the MCP server.
 */
export function registerScheduledPaymentTools(): void {
  registerSchedulePaymentTool();
  registerCancelScheduledPaymentTool();
}

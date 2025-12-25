/**
 * Rewards Management Tools
 *
 * Tools for TIP-20 token rewards management on Tempo blockchain.
 *
 * Tools in this category:
 * - opt_in_rewards: Opt into rewards for a token (Medium risk)
 * - opt_out_rewards: Opt out of rewards for a token (Medium risk)
 * - claim_rewards: Claim pending rewards (Medium risk)
 * - get_pending_rewards: Check pending reward balance (Low risk)
 * - set_reward_recipient: Set auto-forward address for rewards (Medium risk)
 * - get_reward_status: Get comprehensive reward status (Low risk)
 * - distribute_rewards: Distribute rewards to opted-in holders (High risk)
 *
 * Rewards Model:
 * - Token issuers/funders can distribute rewards via distribute_rewards
 * - Holders must explicitly opt in to receive rewards
 * - Rewards are distributed pro-rata based on opted-in balances
 * - Rewards can be claimed or auto-forwarded to a designated recipient
 */

import type { Address } from 'viem';
import { formatUnits, parseUnits } from 'viem';
import { server } from '../../server.js';
import { getConfig } from '../../config/index.js';
import { getRewardsService } from '../../services/rewards-service.js';
import { resolveTokenAddress, getTokenService } from '../../services/token-service.js';
import { getSecurityLayer } from '../../security/index.js';
import { buildExplorerTxUrl } from '../../utils/formatting.js';
import { normalizeError, isTempoMcpError } from '../../utils/errors.js';
import { createRequestContext } from '../../types/index.js';
import {
  // Input schemas
  optInRewardsInputSchema,
  optOutRewardsInputSchema,
  claimRewardsInputSchema,
  getPendingRewardsInputSchema,
  setRewardRecipientInputSchema,
  getRewardStatusInputSchema,
  distributeRewardsInputSchema,
  // Response helpers
  createOptInRewardsResponse,
  createOptOutRewardsResponse,
  createClaimRewardsResponse,
  createGetPendingRewardsResponse,
  createSetRewardRecipientResponse,
  createGetRewardStatusResponse,
  createDistributeRewardsResponse,
  createRewardsErrorResponse,
  // Types
  type OptInRewardsInput,
  type OptOutRewardsInput,
  type ClaimRewardsInput,
  type GetPendingRewardsInput,
  type SetRewardRecipientInput,
  type GetRewardStatusInput,
  type DistributeRewardsInput,
} from './schemas.js';

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * Register all rewards management tools with the MCP server.
 */
export function registerRewardsTools(): void {
  registerOptInRewardsTool();
  registerOptOutRewardsTool();
  registerClaimRewardsTool();
  registerGetPendingRewardsTool();
  registerSetRewardRecipientTool();
  registerGetRewardStatusTool();
  registerDistributeRewardsTool();
}

// =============================================================================
// opt_in_rewards Tool
// =============================================================================

function registerOptInRewardsTool(): void {
  server.registerTool(
    'opt_in_rewards',
    {
      title: 'Opt Into Rewards',
      description:
        'Opt into rewards for a TIP-20 token. After opting in, you will earn rewards ' +
        'proportional to your token balance. Your entire balance becomes eligible for rewards.',
      inputSchema: optInRewardsInputSchema,
    },
    async (args: OptInRewardsInput) => {
      const ctx = createRequestContext('opt_in_rewards');
      const config = getConfig();
      const rewardsService = getRewardsService();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
      };

      try {
        // Resolve token address
        const tokenAddress = resolveTokenAddress(args.token);

        // Execute opt-in
        const result = await rewardsService.optInRewards(tokenAddress);

        // Get caller address for response
        const account = rewardsService['client'].getAddress();

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'opt_in_rewards',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        // Build response
        const output = createOptInRewardsResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          token: tokenAddress,
          account,
          gasCost: result.gasCost,
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
        const errorMessage = (error as Error).message || '';

        // Check for Unauthorized error - means rewards not enabled for this token
        if (errorMessage.includes('0xaa4bc69a') || errorMessage.includes('Unauthorized')) {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'opt_in_rewards',
            arguments: logArgs,
            durationMs,
            errorMessage: 'Rewards not enabled for this token',
            errorCode: 4003,
          });

          const errorOutput = createRewardsErrorResponse({
            code: 4003,
            message: 'Rewards are not enabled for this token. The token does not support the rewards feature.',
            details: { suggestion: 'This token does not have rewards functionality enabled.' },
            recoverable: false,
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

        if (isTempoMcpError(error) && error.name === 'SecurityError') {
          await security.logRejected({
            requestId: ctx.requestId,
            tool: 'opt_in_rewards',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'opt_in_rewards',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createRewardsErrorResponse({
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
// opt_out_rewards Tool
// =============================================================================

function registerOptOutRewardsTool(): void {
  server.registerTool(
    'opt_out_rewards',
    {
      title: 'Opt Out of Rewards',
      description:
        'Opt out of rewards for a TIP-20 token. By default, any pending rewards will be ' +
        'claimed before opting out. After opting out, your balance will no longer earn rewards.',
      inputSchema: optOutRewardsInputSchema,
    },
    async (args: OptOutRewardsInput) => {
      const ctx = createRequestContext('opt_out_rewards');
      const config = getConfig();
      const rewardsService = getRewardsService();
      const security = getSecurityLayer();

      const claimPending = args.claimPending ?? true;
      const logArgs = {
        token: args.token,
        claimPending,
      };

      try {
        // Resolve token address
        const tokenAddress = resolveTokenAddress(args.token);

        // Check if there are pending rewards (for response message)
        const pendingBefore = await rewardsService.getPendingRewards(tokenAddress);
        const hadPending = pendingBefore > 0n;

        // Execute opt-out
        const result = await rewardsService.optOutRewards(tokenAddress, claimPending);

        // Get caller address for response
        const account = rewardsService['client'].getAddress();

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'opt_out_rewards',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        // Build response
        const output = createOptOutRewardsResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          token: tokenAddress,
          account,
          pendingClaimedBefore: claimPending && hadPending,
          gasCost: result.gasCost,
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
        const errorMessage = (error as Error).message || '';

        // Check for Unauthorized error - means rewards not enabled for this token
        if (errorMessage.includes('0xaa4bc69a') || errorMessage.includes('Unauthorized')) {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'opt_out_rewards',
            arguments: logArgs,
            durationMs,
            errorMessage: 'Rewards not enabled for this token',
            errorCode: 4003,
          });

          const errorOutput = createRewardsErrorResponse({
            code: 4003,
            message: 'Rewards are not enabled for this token. The token does not support the rewards feature.',
            details: { suggestion: 'This token does not have rewards functionality enabled.' },
            recoverable: false,
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

        if (isTempoMcpError(error) && error.name === 'SecurityError') {
          await security.logRejected({
            requestId: ctx.requestId,
            tool: 'opt_out_rewards',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'opt_out_rewards',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createRewardsErrorResponse({
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
// claim_rewards Tool
// =============================================================================

function registerClaimRewardsTool(): void {
  server.registerTool(
    'claim_rewards',
    {
      title: 'Claim Rewards',
      description:
        'Claim all pending rewards for a TIP-20 token. Rewards are sent to your wallet ' +
        'or to your configured reward recipient if one is set.',
      inputSchema: claimRewardsInputSchema,
    },
    async (args: ClaimRewardsInput) => {
      const ctx = createRequestContext('claim_rewards');
      const config = getConfig();
      const rewardsService = getRewardsService();
      const tokenService = getTokenService();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
      };

      try {
        // Resolve token address
        const tokenAddress = resolveTokenAddress(args.token);

        // Get token decimals for formatting
        const tokenInfo = await tokenService.getTokenInfo(tokenAddress);
        const decimals = tokenInfo.decimals;

        // Execute claim
        const result = await rewardsService.claimRewards(tokenAddress);

        // Get caller address and recipient for response
        const account = rewardsService['client'].getAddress();
        const recipient = await rewardsService.getRewardRecipient(tokenAddress) ?? account;

        // Format claimed amount
        const amountClaimed = result.amountClaimed.toString();
        const amountClaimedFormatted = `${formatUnits(result.amountClaimed, decimals)} ${tokenInfo.symbol}`;

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'claim_rewards',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        // Build response
        const output = createClaimRewardsResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          token: tokenAddress,
          account,
          amountClaimed,
          amountClaimedFormatted,
          recipient,
          gasCost: result.gasCost,
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
        const errorMessage = (error as Error).message || '';

        // Check for Unauthorized error - means rewards not enabled for this token
        if (errorMessage.includes('0xaa4bc69a') || errorMessage.includes('Unauthorized')) {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'claim_rewards',
            arguments: logArgs,
            durationMs,
            errorMessage: 'Rewards not enabled for this token',
            errorCode: 4003,
          });

          const errorOutput = createRewardsErrorResponse({
            code: 4003,
            message: 'Rewards are not enabled for this token. The token does not support the rewards feature.',
            details: { suggestion: 'This token does not have rewards functionality enabled.' },
            recoverable: false,
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

        if (isTempoMcpError(error) && error.name === 'SecurityError') {
          await security.logRejected({
            requestId: ctx.requestId,
            tool: 'claim_rewards',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'claim_rewards',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createRewardsErrorResponse({
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
// get_pending_rewards Tool
// =============================================================================

function registerGetPendingRewardsTool(): void {
  server.registerTool(
    'get_pending_rewards',
    {
      title: 'Get Pending Rewards',
      description:
        'Check the pending reward balance for an address. Returns the amount of ' +
        'rewards that can be claimed, along with opt-in status.',
      inputSchema: getPendingRewardsInputSchema,
    },
    async (args: GetPendingRewardsInput) => {
      const ctx = createRequestContext('get_pending_rewards');
      const rewardsService = getRewardsService();
      const tokenService = getTokenService();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
        account: args.account ?? 'default',
      };

      try {
        // Resolve token address
        const tokenAddress = resolveTokenAddress(args.token);
        const account = (args.account as Address) ?? rewardsService['client'].getAddress();

        // Get token decimals for formatting
        const tokenInfo = await tokenService.getTokenInfo(tokenAddress);
        const decimals = tokenInfo.decimals;

        // Check opt-in status and pending rewards
        // These calls may revert with Unauthorized (0xaa4bc69a) if:
        // 1. Token doesn't support rewards
        // 2. Rewards feature isn't enabled for the token
        let isOptedIn = false;
        let pendingRewards = 0n;

        try {
          isOptedIn = await rewardsService.isOptedIn(tokenAddress, account);

          // Only query pending rewards if opted in
          if (isOptedIn) {
            pendingRewards = await rewardsService.getPendingRewards(tokenAddress, account);
          }
        } catch (rewardsError) {
          const errorMessage = (rewardsError as Error).message || '';
          // Check for Unauthorized error - means rewards not enabled for this token
          if (errorMessage.includes('0xaa4bc69a') || errorMessage.includes('Unauthorized')) {
            // Return response indicating rewards not available
            const output = {
              token: tokenAddress,
              account,
              pendingRewards: '0',
              pendingRewardsFormatted: `0 ${tokenInfo.symbol}`,
              isOptedIn: false,
              rewardsEnabled: false,
              message: 'Rewards are not enabled for this token.',
            };

            await security.logSuccess({
              requestId: ctx.requestId,
              tool: 'get_pending_rewards',
              arguments: logArgs,
              durationMs: Date.now() - ctx.startTime,
            });

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(output, null, 2),
                },
              ],
            };
          }
          // Re-throw other errors
          throw rewardsError;
        }

        // Format response
        const pendingRewardsStr = pendingRewards.toString();
        const pendingRewardsFormatted = `${formatUnits(pendingRewards, decimals)} ${tokenInfo.symbol}`;

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'get_pending_rewards',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
        });

        // Build response
        const output = createGetPendingRewardsResponse({
          token: tokenAddress,
          account,
          pendingRewards: pendingRewardsStr,
          pendingRewardsFormatted,
          isOptedIn,
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

        await security.logFailure({
          requestId: ctx.requestId,
          tool: 'get_pending_rewards',
          arguments: logArgs,
          durationMs,
          errorMessage: normalized.message,
          errorCode: normalized.code,
        });

        const errorOutput = createRewardsErrorResponse({
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
// set_reward_recipient Tool
// =============================================================================

function registerSetRewardRecipientTool(): void {
  server.registerTool(
    'set_reward_recipient',
    {
      title: 'Set Reward Recipient',
      description:
        'Set or clear the auto-forward recipient for rewards. When a recipient is set, ' +
        'claimed rewards are automatically sent to that address instead of your wallet. ' +
        'Use the zero address (0x0...0) to clear the recipient.',
      inputSchema: setRewardRecipientInputSchema,
    },
    async (args: SetRewardRecipientInput) => {
      const ctx = createRequestContext('set_reward_recipient');
      const config = getConfig();
      const rewardsService = getRewardsService();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
        recipient: args.recipient,
      };

      try {
        // Resolve token address
        const tokenAddress = resolveTokenAddress(args.token);

        // Execute set recipient
        const result = await rewardsService.setRewardRecipient(
          tokenAddress,
          args.recipient as Address
        );

        // Get caller address for response
        const account = rewardsService['client'].getAddress();

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'set_reward_recipient',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        // Build response
        const output = createSetRewardRecipientResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          token: tokenAddress,
          account,
          recipient: args.recipient,
          gasCost: result.gasCost,
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
        const errorMessage = (error as Error).message || '';

        // Check for Unauthorized error - means rewards not enabled for this token
        if (errorMessage.includes('0xaa4bc69a') || errorMessage.includes('Unauthorized')) {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'set_reward_recipient',
            arguments: logArgs,
            durationMs,
            errorMessage: 'Rewards not enabled for this token',
            errorCode: 4003,
          });

          const errorOutput = createRewardsErrorResponse({
            code: 4003,
            message: 'Rewards are not enabled for this token. The token does not support the rewards feature.',
            details: { suggestion: 'This token does not have rewards functionality enabled.' },
            recoverable: false,
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

        if (isTempoMcpError(error) && error.name === 'SecurityError') {
          await security.logRejected({
            requestId: ctx.requestId,
            tool: 'set_reward_recipient',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'set_reward_recipient',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createRewardsErrorResponse({
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
// get_reward_status Tool
// =============================================================================

function registerGetRewardStatusTool(): void {
  server.registerTool(
    'get_reward_status',
    {
      title: 'Get Reward Status',
      description:
        'Get comprehensive reward status for an account including opt-in status, ' +
        'pending rewards, opted-in balance, total claimed, reward recipient, and pool statistics.',
      inputSchema: getRewardStatusInputSchema,
    },
    async (args: GetRewardStatusInput) => {
      const ctx = createRequestContext('get_reward_status');
      const rewardsService = getRewardsService();
      const tokenService = getTokenService();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
        account: args.account ?? 'default',
      };

      try {
        // Resolve token address
        const tokenAddress = resolveTokenAddress(args.token);
        const account = (args.account as Address) ?? rewardsService['client'].getAddress();

        // Get token decimals for formatting
        const tokenInfo = await tokenService.getTokenInfo(tokenAddress);
        const decimals = tokenInfo.decimals;
        const symbol = tokenInfo.symbol;

        // Get complete reward status
        // May revert with Unauthorized (0xaa4bc69a) if rewards not enabled
        let status;
        try {
          status = await rewardsService.getRewardStatus(tokenAddress, account);
        } catch (rewardsError) {
          const errorMessage = (rewardsError as Error).message || '';
          // Check for Unauthorized error - means rewards not enabled for this token
          if (errorMessage.includes('0xaa4bc69a') || errorMessage.includes('Unauthorized')) {
            // Return response indicating rewards not available
            // Get balance from tempo client
            const tempoClient = rewardsService['client'];
            const balance = await tempoClient.getBalance(tokenAddress, account);
            const formatAmount = (amount: bigint) => `${formatUnits(amount, decimals)} ${symbol}`;

            const output = {
              token: tokenAddress,
              account,
              isOptedIn: false,
              rewardsEnabled: false,
              message: 'Rewards are not enabled for this token.',
              pendingRewards: '0',
              pendingRewardsFormatted: `0 ${symbol}`,
              optedInBalance: '0',
              optedInBalanceFormatted: `0 ${symbol}`,
              totalBalance: balance.toString(),
              totalBalanceFormatted: formatAmount(balance),
              participationRate: '0.00%',
              rewardRecipient: null,
              totalClaimed: '0',
              totalClaimedFormatted: `0 ${symbol}`,
              tokenStats: {
                totalOptedInSupply: '0',
                totalOptedInSupplyFormatted: `0 ${symbol}`,
                totalDistributed: '0',
                totalDistributedFormatted: `0 ${symbol}`,
              },
              shareOfPool: '0.00%',
            };

            await security.logSuccess({
              requestId: ctx.requestId,
              tool: 'get_reward_status',
              arguments: logArgs,
              durationMs: Date.now() - ctx.startTime,
            });

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(output, null, 2),
                },
              ],
            };
          }
          // Re-throw other errors
          throw rewardsError;
        }

        // Calculate participation rate (opted-in / total balance)
        let participationRate = '0.00%';
        if (status.totalBalance > 0n) {
          const rate = (Number(status.optedInBalance) / Number(status.totalBalance)) * 100;
          participationRate = `${rate.toFixed(2)}%`;
        }

        // Calculate share of pool
        let shareOfPool = '0.00%';
        if (status.tokenStats.totalOptedInSupply > 0n) {
          const share =
            (Number(status.optedInBalance) / Number(status.tokenStats.totalOptedInSupply)) * 100;
          shareOfPool = `${share.toFixed(4)}%`;
        }

        // Format all values
        const formatAmount = (amount: bigint) => `${formatUnits(amount, decimals)} ${symbol}`;

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'get_reward_status',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
        });

        // Build response
        const output = createGetRewardStatusResponse({
          token: tokenAddress,
          account,
          isOptedIn: status.isOptedIn,
          pendingRewards: status.pendingRewards.toString(),
          pendingRewardsFormatted: formatAmount(status.pendingRewards),
          optedInBalance: status.optedInBalance.toString(),
          optedInBalanceFormatted: formatAmount(status.optedInBalance),
          totalBalance: status.totalBalance.toString(),
          totalBalanceFormatted: formatAmount(status.totalBalance),
          participationRate,
          rewardRecipient: status.rewardRecipient,
          totalClaimed: status.totalClaimed.toString(),
          totalClaimedFormatted: formatAmount(status.totalClaimed),
          tokenStats: {
            totalOptedInSupply: status.tokenStats.totalOptedInSupply.toString(),
            totalOptedInSupplyFormatted: formatAmount(status.tokenStats.totalOptedInSupply),
            totalDistributed: status.tokenStats.totalDistributed.toString(),
            totalDistributedFormatted: formatAmount(status.tokenStats.totalDistributed),
          },
          shareOfPool,
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

        await security.logFailure({
          requestId: ctx.requestId,
          tool: 'get_reward_status',
          arguments: logArgs,
          durationMs,
          errorMessage: normalized.message,
          errorCode: normalized.code,
        });

        const errorOutput = createRewardsErrorResponse({
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
// distribute_rewards Tool
// =============================================================================

function registerDistributeRewardsTool(): void {
  server.registerTool(
    'distribute_rewards',
    {
      title: 'Distribute Rewards',
      description:
        'Distribute rewards to all opted-in holders of a TIP-20 token. ' +
        'Rewards are distributed proportionally based on opted-in balances. ' +
        'Currently only instant rewards (duration=0) are supported. ' +
        'Time-based streaming rewards are planned for a future Tempo protocol upgrade. ' +
        'Requires sufficient token balance to fund the reward distribution.',
      inputSchema: distributeRewardsInputSchema,
    },
    async (args: DistributeRewardsInput) => {
      const ctx = createRequestContext('distribute_rewards');
      const config = getConfig();
      const rewardsService = getRewardsService();
      const tokenService = getTokenService();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
        amount: args.amount,
        duration: args.duration,
      };

      try {
        // Resolve token address
        const tokenAddress = resolveTokenAddress(args.token);

        // Get token info for decimals
        const tokenInfo = await tokenService.getTokenInfo(tokenAddress);
        const decimals = tokenInfo.decimals;

        // Parse amount to wei
        const amountWei = parseUnits(args.amount, decimals);

        // Execute reward distribution
        const result = await rewardsService.distributeRewards(
          tokenAddress,
          amountWei,
          args.duration
        );

        // Get funder address for response
        const funder = rewardsService['client'].getAddress();

        // Format amount
        const amountFormatted = `${args.amount} ${tokenInfo.symbol}`;

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'distribute_rewards',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        // Build response
        const output = createDistributeRewardsResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          token: tokenAddress,
          funder,
          rewardId: result.rewardId.toString(),
          amount: amountWei.toString(),
          amountFormatted,
          durationSeconds: args.duration,
          gasCost: result.gasCost,
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
        const errorMessage = (error as Error).message || '';

        // Check for NoOptedInSupply error (0xe845980e)
        // This means no token holders have opted into rewards yet
        if (errorMessage.includes('0xe845980e') || errorMessage.includes('NoOptedInSupply')) {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'distribute_rewards',
            arguments: logArgs,
            durationMs,
            errorMessage: 'No token holders have opted into rewards',
            errorCode: 4004,
          });

          const errorOutput = createRewardsErrorResponse({
            code: 4004,
            message: 'Cannot distribute rewards: no token holders have opted into rewards yet.',
            details: {
              suggestion: 'At least one holder must call opt_in_rewards before rewards can be distributed. ' +
                          'The opted-in supply must be greater than zero.',
            },
            recoverable: true,
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

        // Check for ScheduledRewardsDisabled error (0xadf4cab0)
        // This means time-based streaming rewards (duration > 0) are not yet implemented in Tempo
        if (errorMessage.includes('0xadf4cab0') || errorMessage.includes('ScheduledRewardsDisabled')) {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'distribute_rewards',
            arguments: logArgs,
            durationMs,
            errorMessage: 'Time-based streaming rewards not yet implemented in Tempo protocol',
            errorCode: 4003,
          });

          const errorOutput = createRewardsErrorResponse({
            code: 4003,
            message: 'Time-based streaming rewards (duration > 0) are not yet implemented in the Tempo protocol. ' +
                     'This feature is planned for a future upgrade.',
            details: {
              suggestion: `Use duration=0 for instant reward distribution instead. You provided duration=${logArgs.duration}. ` +
                          'Instant rewards are distributed immediately and proportionally to all opted-in holders.',
              expected: 'duration=0 (instant rewards)',
              received: `duration=${logArgs.duration}`,
            },
            recoverable: true,
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

        // Check for Unauthorized error - means rewards not enabled for this token
        if (errorMessage.includes('0xaa4bc69a') || errorMessage.includes('Unauthorized')) {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'distribute_rewards',
            arguments: logArgs,
            durationMs,
            errorMessage: 'Rewards not enabled for this token',
            errorCode: 4003,
          });

          const errorOutput = createRewardsErrorResponse({
            code: 4003,
            message: 'Rewards are not enabled for this token. The token does not support the rewards feature.',
            details: { suggestion: 'This token does not have rewards functionality enabled.' },
            recoverable: false,
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

        if (isTempoMcpError(error) && error.name === 'SecurityError') {
          await security.logRejected({
            requestId: ctx.requestId,
            tool: 'distribute_rewards',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'distribute_rewards',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createRewardsErrorResponse({
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

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
 *
 * Rewards Model:
 * - Holders must explicitly opt in to receive rewards
 * - Rewards are distributed pro-rata based on opted-in balances
 * - Rewards can be claimed or auto-forwarded to a designated recipient
 */

import type { Address } from 'viem';
import { formatUnits } from 'viem';
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
  // Response helpers
  createOptInRewardsResponse,
  createOptOutRewardsResponse,
  createClaimRewardsResponse,
  createGetPendingRewardsResponse,
  createSetRewardRecipientResponse,
  createGetRewardStatusResponse,
  createRewardsErrorResponse,
  // Types
  type OptInRewardsInput,
  type OptOutRewardsInput,
  type ClaimRewardsInput,
  type GetPendingRewardsInput,
  type SetRewardRecipientInput,
  type GetRewardStatusInput,
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

        // Get pending rewards and opt-in status
        const [pendingRewards, isOptedIn] = await Promise.all([
          rewardsService.getPendingRewards(tokenAddress, account),
          rewardsService.isOptedIn(tokenAddress, account),
        ]);

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
        const status = await rewardsService.getRewardStatus(tokenAddress, account);

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

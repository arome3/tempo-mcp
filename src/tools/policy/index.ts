/**
 * Policy Management Tools
 *
 * Tools for TIP-403 Policy Registry operations on Tempo blockchain.
 * Provides compliance infrastructure with whitelist/blacklist policies
 * and pre-transfer validation.
 *
 * Tools in this category:
 * - create_policy: Create a new compliance policy (High risk)
 * - check_transfer_compliance: Check if transfer is allowed (Low risk)
 * - get_policy_info: Get policy details (Low risk)
 * - is_whitelisted: Check whitelist status (Low risk)
 * - is_blacklisted: Check blacklist status (Low risk)
 * - add_to_whitelist: Add address to whitelist (Critical risk)
 * - add_to_blacklist: Add address to blacklist (Critical risk)
 * - remove_from_whitelist: Remove from whitelist (High risk)
 * - remove_from_blacklist: Remove from blacklist (High risk)
 * - burn_blocked_tokens: Burn tokens from blocked address (Critical risk)
 *
 * Policy Registry Contract: 0x403c000000000000000000000000000000000000
 */

import type { Address } from 'viem';
import { parseUnits } from 'viem';
import { server } from '../../server.js';
import { getConfig } from '../../config/index.js';
import { getPolicyService } from '../../services/policy-service.js';
import { resolveTokenAddress, getTokenService } from '../../services/token-service.js';
import { getSecurityLayer } from '../../security/index.js';
import { buildExplorerTxUrl } from '../../utils/formatting.js';
import { normalizeError, isTempoMcpError } from '../../utils/errors.js';
import { createRequestContext } from '../../types/index.js';
import {
  // Input schemas
  createPolicyInputSchema,
  checkTransferComplianceInputSchema,
  getPolicyInfoInputSchema,
  isWhitelistedInputSchema,
  isBlacklistedInputSchema,
  addToWhitelistInputSchema,
  removeFromWhitelistInputSchema,
  addToBlacklistInputSchema,
  removeFromBlacklistInputSchema,
  burnBlockedTokensInputSchema,
  // Response helpers
  createCreatePolicyResponse,
  createCheckTransferComplianceResponse,
  createGetPolicyInfoResponse,
  createIsWhitelistedResponse,
  createIsBlacklistedResponse,
  createAddToWhitelistResponse,
  createRemoveFromWhitelistResponse,
  createAddToBlacklistResponse,
  createRemoveFromBlacklistResponse,
  createBurnBlockedTokensResponse,
  createPolicyErrorResponse,
  // Types
  type CreatePolicyInput,
  type CheckTransferComplianceInput,
  type GetPolicyInfoInput,
  type IsWhitelistedInput,
  type IsBlacklistedInput,
  type AddToWhitelistInput,
  type RemoveFromWhitelistInput,
  type AddToBlacklistInput,
  type RemoveFromBlacklistInput,
  type BurnBlockedTokensInput,
  type PolicyTypeValue,
} from './schemas.js';

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * Register all policy management tools with the MCP server.
 */
export function registerPolicyTools(): void {
  registerCreatePolicyTool();
  registerCheckTransferComplianceTool();
  registerGetPolicyInfoTool();
  registerIsWhitelistedTool();
  registerIsBlacklistedTool();
  registerAddToWhitelistTool();
  registerRemoveFromWhitelistTool();
  registerAddToBlacklistTool();
  registerRemoveFromBlacklistTool();
  registerBurnBlockedTokensTool();
}

// =============================================================================
// create_policy Tool
// =============================================================================

function registerCreatePolicyTool(): void {
  server.registerTool(
    'create_policy',
    {
      title: 'Create Policy',
      description:
        'Create a new TIP-403 compliance policy. ' +
        'Policies enable transfer restrictions on tokens. ' +
        'Choose "whitelist" to only allow approved addresses, or "blacklist" to block specific addresses. ' +
        'The caller becomes the policy admin who can modify entries. ' +
        'Returns the new policy ID which can be used with add_to_whitelist/add_to_blacklist.',
      inputSchema: createPolicyInputSchema,
    },
    async (args: CreatePolicyInput) => {
      const ctx = createRequestContext('create_policy');
      const config = getConfig();
      const policyService = getPolicyService();
      const security = getSecurityLayer();

      const logArgs = {
        policyType: args.policyType,
        admin: args.admin,
        initialAccountsCount: args.initialAccounts?.length ?? 0,
      };

      try {
        // Determine admin address
        const adminAddress = (args.admin || policyService['client'].getAddress()) as Address;

        let result: { hash: string; blockNumber: number; gasCost: string; policyId: number };

        if (args.initialAccounts && args.initialAccounts.length > 0) {
          // Create policy with initial accounts
          result = await policyService.createPolicyWithAccounts(
            args.policyType,
            args.initialAccounts as Address[],
            adminAddress
          );
        } else {
          // Create empty policy
          result = await policyService.createPolicy(args.policyType, adminAddress);
        }

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'create_policy',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createCreatePolicyResponse({
          policyId: result.policyId,
          policyType: args.policyType,
          admin: adminAddress,
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
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
            tool: 'create_policy',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'create_policy',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createPolicyErrorResponse({
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
// check_transfer_compliance Tool
// =============================================================================

function registerCheckTransferComplianceTool(): void {
  server.registerTool(
    'check_transfer_compliance',
    {
      title: 'Check Transfer Compliance',
      description:
        "Check if a TIP-20 transfer is allowed by the token's TIP-403 policy. " +
        'Returns detailed compliance status including policy type and address statuses. ' +
        'This is a read-only query with no gas cost.',
      inputSchema: checkTransferComplianceInputSchema,
    },
    async (args: CheckTransferComplianceInput) => {
      try {
        const tokenAddress = resolveTokenAddress(args.token);
        const policyService = getPolicyService();

        const result = await policyService.checkTransferCompliance(
          tokenAddress,
          args.from as Address,
          args.to as Address
        );

        const output = createCheckTransferComplianceResponse({
          allowed: result.allowed,
          policyId: result.policyId,
          policyType: result.policyType as PolicyTypeValue,
          fromStatus: result.fromStatus,
          toStatus: result.toStatus,
          reason: result.reason,
          token: tokenAddress,
          from: args.from,
          to: args.to,
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

        const errorOutput = createPolicyErrorResponse({
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
// get_policy_info Tool
// =============================================================================

function registerGetPolicyInfoTool(): void {
  server.registerTool(
    'get_policy_info',
    {
      title: 'Get Policy Info',
      description:
        'Get details about a TIP-403 policy including type, owner, and token count. ' +
        'This is a read-only query with no gas cost.',
      inputSchema: getPolicyInfoInputSchema,
    },
    async (args: GetPolicyInfoInput) => {
      try {
        const policyService = getPolicyService();

        const policyInfo = await policyService.getPolicy(args.policyId);

        const output = createGetPolicyInfoResponse({
          policyId: policyInfo.policyId,
          policyType: policyInfo.policyType as PolicyTypeValue,
          owner: policyInfo.owner,
          tokenCount: policyInfo.tokenCount,
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

        const errorOutput = createPolicyErrorResponse({
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
// is_whitelisted Tool
// =============================================================================

function registerIsWhitelistedTool(): void {
  server.registerTool(
    'is_whitelisted',
    {
      title: 'Is Whitelisted',
      description:
        'Check if an address is on the whitelist for a TIP-403 policy. ' +
        'This is a read-only query with no gas cost.',
      inputSchema: isWhitelistedInputSchema,
    },
    async (args: IsWhitelistedInput) => {
      try {
        const policyService = getPolicyService();

        const isWhitelisted = await policyService.isWhitelisted(
          args.policyId,
          args.account as Address
        );

        const output = createIsWhitelistedResponse({
          isWhitelisted,
          policyId: args.policyId,
          account: args.account,
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

        const errorOutput = createPolicyErrorResponse({
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
// is_blacklisted Tool
// =============================================================================

function registerIsBlacklistedTool(): void {
  server.registerTool(
    'is_blacklisted',
    {
      title: 'Is Blacklisted',
      description:
        'Check if an address is on the blacklist for a TIP-403 policy. ' +
        'This is a read-only query with no gas cost.',
      inputSchema: isBlacklistedInputSchema,
    },
    async (args: IsBlacklistedInput) => {
      try {
        const policyService = getPolicyService();

        const isBlacklisted = await policyService.isBlacklisted(
          args.policyId,
          args.account as Address
        );

        const output = createIsBlacklistedResponse({
          isBlacklisted,
          policyId: args.policyId,
          account: args.account,
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

        const errorOutput = createPolicyErrorResponse({
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
// add_to_whitelist Tool
// =============================================================================

function registerAddToWhitelistTool(): void {
  server.registerTool(
    'add_to_whitelist',
    {
      title: 'Add to Whitelist',
      description:
        'Add an address to a TIP-403 policy whitelist. ' +
        'Requires policy admin/owner authorization. ' +
        'Whitelisted addresses can send and receive tokens governed by this policy.',
      inputSchema: addToWhitelistInputSchema,
    },
    async (args: AddToWhitelistInput) => {
      const ctx = createRequestContext('add_to_whitelist');
      const config = getConfig();
      const policyService = getPolicyService();
      const security = getSecurityLayer();

      const logArgs = {
        policyId: args.policyId,
        account: args.account,
      };

      try {
        const result = await policyService.addToWhitelist(
          args.policyId,
          args.account as Address
        );

        // Get caller address for response
        const addedBy = policyService['client'].getAddress();

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'add_to_whitelist',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createAddToWhitelistResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          policyId: args.policyId,
          account: args.account,
          addedBy,
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
            tool: 'add_to_whitelist',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'add_to_whitelist',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createPolicyErrorResponse({
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
// remove_from_whitelist Tool
// =============================================================================

function registerRemoveFromWhitelistTool(): void {
  server.registerTool(
    'remove_from_whitelist',
    {
      title: 'Remove from Whitelist',
      description:
        'Remove an address from a TIP-403 policy whitelist. ' +
        'Requires policy admin/owner authorization. ' +
        'The address will no longer be able to send or receive tokens governed by this policy.',
      inputSchema: removeFromWhitelistInputSchema,
    },
    async (args: RemoveFromWhitelistInput) => {
      const ctx = createRequestContext('remove_from_whitelist');
      const config = getConfig();
      const policyService = getPolicyService();
      const security = getSecurityLayer();

      const logArgs = {
        policyId: args.policyId,
        account: args.account,
      };

      try {
        const result = await policyService.removeFromWhitelist(
          args.policyId,
          args.account as Address
        );

        const removedBy = policyService['client'].getAddress();

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'remove_from_whitelist',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createRemoveFromWhitelistResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          policyId: args.policyId,
          account: args.account,
          removedBy,
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
            tool: 'remove_from_whitelist',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'remove_from_whitelist',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createPolicyErrorResponse({
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
// add_to_blacklist Tool
// =============================================================================

function registerAddToBlacklistTool(): void {
  server.registerTool(
    'add_to_blacklist',
    {
      title: 'Add to Blacklist',
      description:
        'Add an address to a TIP-403 policy blacklist (block the address). ' +
        'Requires policy admin/owner authorization. ' +
        'Typically used for sanctions compliance. ' +
        'The blocked address will not be able to send or receive tokens governed by this policy.',
      inputSchema: addToBlacklistInputSchema,
    },
    async (args: AddToBlacklistInput) => {
      const ctx = createRequestContext('add_to_blacklist');
      const config = getConfig();
      const policyService = getPolicyService();
      const security = getSecurityLayer();

      const logArgs = {
        policyId: args.policyId,
        account: args.account,
      };

      try {
        const result = await policyService.addToBlacklist(
          args.policyId,
          args.account as Address
        );

        const blockedBy = policyService['client'].getAddress();

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'add_to_blacklist',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createAddToBlacklistResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          policyId: args.policyId,
          account: args.account,
          blockedBy,
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
            tool: 'add_to_blacklist',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'add_to_blacklist',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createPolicyErrorResponse({
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
// remove_from_blacklist Tool
// =============================================================================

function registerRemoveFromBlacklistTool(): void {
  server.registerTool(
    'remove_from_blacklist',
    {
      title: 'Remove from Blacklist',
      description:
        'Remove an address from a TIP-403 policy blacklist (unblock the address). ' +
        'Requires policy admin/owner authorization. ' +
        'The address will be able to send and receive tokens governed by this policy again.',
      inputSchema: removeFromBlacklistInputSchema,
    },
    async (args: RemoveFromBlacklistInput) => {
      const ctx = createRequestContext('remove_from_blacklist');
      const config = getConfig();
      const policyService = getPolicyService();
      const security = getSecurityLayer();

      const logArgs = {
        policyId: args.policyId,
        account: args.account,
      };

      try {
        const result = await policyService.removeFromBlacklist(
          args.policyId,
          args.account as Address
        );

        const unblockedBy = policyService['client'].getAddress();

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'remove_from_blacklist',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createRemoveFromBlacklistResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          policyId: args.policyId,
          account: args.account,
          unblockedBy,
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
            tool: 'remove_from_blacklist',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'remove_from_blacklist',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createPolicyErrorResponse({
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
// burn_blocked_tokens Tool
// =============================================================================

function registerBurnBlockedTokensTool(): void {
  server.registerTool(
    'burn_blocked_tokens',
    {
      title: 'Burn Blocked Tokens',
      description:
        'Burn tokens held by a blocked address (compliance seizure). ' +
        'Requires BURN_BLOCKED_ROLE on the token. ' +
        'The blocked address must be on the blacklist. ' +
        'Use "all" as amount to burn the entire balance.',
      inputSchema: burnBlockedTokensInputSchema,
    },
    async (args: BurnBlockedTokensInput) => {
      const ctx = createRequestContext('burn_blocked_tokens');
      const config = getConfig();
      const policyService = getPolicyService();
      const tokenService = getTokenService();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
        blockedAddress: args.blockedAddress,
        amount: args.amount,
      };

      try {
        const tokenAddress = resolveTokenAddress(args.token);

        // Determine amount to burn
        let burnAmount: bigint | null = null;
        if (args.amount.toLowerCase() !== 'all') {
          // Parse the amount using token decimals
          const tokenInfo = await tokenService.getTokenInfo(tokenAddress);
          burnAmount = parseUnits(args.amount, tokenInfo.decimals);
        }

        const result = await policyService.burnBlocked(
          tokenAddress,
          args.blockedAddress as Address,
          burnAmount
        );

        const burnedBy = policyService['client'].getAddress();

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'burn_blocked_tokens',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createBurnBlockedTokensResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          token: tokenAddress,
          blockedAddress: args.blockedAddress,
          amountBurned: result.amountBurned,
          amountBurnedFormatted: result.amountBurnedFormatted,
          burnedBy,
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
            tool: 'burn_blocked_tokens',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'burn_blocked_tokens',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createPolicyErrorResponse({
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

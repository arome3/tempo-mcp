/**
 * Role Management Tools
 *
 * Tools for TIP-20 token role-based access control (RBAC) on Tempo blockchain.
 *
 * Tools in this category:
 * - grant_role: Grant a role to an address (Critical risk)
 * - revoke_role: Revoke a role from an address (Critical risk)
 * - renounce_role: Renounce your own role (High risk)
 * - has_role: Check if address has a role (Low risk)
 * - get_role_members: List addresses with a role (Low risk)
 * - pause_token: Emergency pause transfers (Critical risk)
 * - unpause_token: Resume transfers (Critical risk)
 *
 * Role hierarchy:
 * - DEFAULT_ADMIN_ROLE: Full control, can grant/revoke all roles
 * - ISSUER_ROLE: Can mint and burn tokens
 * - PAUSE_ROLE: Can pause token transfers
 * - UNPAUSE_ROLE: Can resume token transfers
 * - BURN_BLOCKED_ROLE: Can burn tokens from blocked addresses
 */

import type { Address } from 'viem';
import { server } from '../../server.js';
import { getConfig } from '../../config/index.js';
import { getRoleService, type RoleName } from '../../services/role-service.js';
import { resolveTokenAddress } from '../../services/token-service.js';
import { getSecurityLayer } from '../../security/index.js';
import { buildExplorerTxUrl } from '../../utils/formatting.js';
import { normalizeError, isTempoMcpError } from '../../utils/errors.js';
import { createRequestContext } from '../../types/index.js';
import {
  // Input schemas
  grantRoleInputSchema,
  revokeRoleInputSchema,
  renounceRoleInputSchema,
  hasRoleInputSchema,
  getRoleMembersInputSchema,
  pauseTokenInputSchema,
  unpauseTokenInputSchema,
  // Response helpers
  createGrantRoleResponse,
  createRevokeRoleResponse,
  createRenounceRoleResponse,
  createHasRoleResponse,
  createGetRoleMembersResponse,
  createPauseTokenResponse,
  createUnpauseTokenResponse,
  createRoleErrorResponse,
  // Types
  type GrantRoleInput,
  type RevokeRoleInput,
  type RenounceRoleInput,
  type HasRoleInput,
  type GetRoleMembersInput,
  type PauseTokenInput,
  type UnpauseTokenInput,
  type RoleNameType,
} from './schemas.js';

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * Register all role management tools with the MCP server.
 */
export function registerRoleTools(): void {
  registerGrantRoleTool();
  registerRevokeRoleTool();
  registerRenounceRoleTool();
  registerHasRoleTool();
  registerGetRoleMembersTool();
  registerPauseTokenTool();
  registerUnpauseTokenTool();
}

// =============================================================================
// grant_role Tool
// =============================================================================

function registerGrantRoleTool(): void {
  server.registerTool(
    'grant_role',
    {
      title: 'Grant Role',
      description:
        'Grant a TIP-20 role to an address. Requires DEFAULT_ADMIN_ROLE on the token. ' +
        'Available roles: DEFAULT_ADMIN_ROLE (full control), ISSUER_ROLE (mint/burn), ' +
        'PAUSE_ROLE (pause transfers), UNPAUSE_ROLE (unpause), BURN_BLOCKED_ROLE (burn blocked funds).',
      inputSchema: grantRoleInputSchema,
    },
    async (args: GrantRoleInput) => {
      const ctx = createRequestContext('grant_role');
      const config = getConfig();
      const roleService = getRoleService();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
        role: args.role,
        account: args.account,
      };

      try {
        // Resolve token address
        const tokenAddress = resolveTokenAddress(args.token);

        // Execute role grant
        const result = await roleService.grantRole(
          tokenAddress,
          args.role as RoleName,
          args.account as Address
        );

        // Get caller address for response
        const grantedBy = roleService['client'].getAddress();

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'grant_role',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        // Build response
        const output = createGrantRoleResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          token: tokenAddress,
          role: args.role,
          account: args.account,
          grantedBy,
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
            tool: 'grant_role',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'grant_role',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createRoleErrorResponse({
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
// revoke_role Tool
// =============================================================================

function registerRevokeRoleTool(): void {
  server.registerTool(
    'revoke_role',
    {
      title: 'Revoke Role',
      description:
        'Revoke a TIP-20 role from an address. Requires DEFAULT_ADMIN_ROLE on the token. ' +
        'Use with caution - revoking roles can lock out administrative access.',
      inputSchema: revokeRoleInputSchema,
    },
    async (args: RevokeRoleInput) => {
      const ctx = createRequestContext('revoke_role');
      const config = getConfig();
      const roleService = getRoleService();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
        role: args.role,
        account: args.account,
      };

      try {
        const tokenAddress = resolveTokenAddress(args.token);

        const result = await roleService.revokeRole(
          tokenAddress,
          args.role as RoleName,
          args.account as Address
        );

        const revokedBy = roleService['client'].getAddress();

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'revoke_role',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createRevokeRoleResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          token: tokenAddress,
          role: args.role,
          account: args.account,
          revokedBy,
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
            tool: 'revoke_role',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'revoke_role',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createRoleErrorResponse({
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
// renounce_role Tool
// =============================================================================

function registerRenounceRoleTool(): void {
  server.registerTool(
    'renounce_role',
    {
      title: 'Renounce Role',
      description:
        'Renounce your own role on a TIP-20 token. This is irreversible unless ' +
        'another admin grants the role back. Use with extreme caution.',
      inputSchema: renounceRoleInputSchema,
    },
    async (args: RenounceRoleInput) => {
      const ctx = createRequestContext('renounce_role');
      const config = getConfig();
      const roleService = getRoleService();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
        role: args.role,
      };

      try {
        const tokenAddress = resolveTokenAddress(args.token);

        const result = await roleService.renounceRole(
          tokenAddress,
          args.role as RoleName
        );

        const renouncedBy = roleService['client'].getAddress();

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'renounce_role',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createRenounceRoleResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          token: tokenAddress,
          role: args.role,
          renouncedBy,
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

        await security.logFailure({
          requestId: ctx.requestId,
          tool: 'renounce_role',
          arguments: logArgs,
          durationMs,
          errorMessage: normalized.message,
          errorCode: normalized.code,
        });

        const errorOutput = createRoleErrorResponse({
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
// has_role Tool
// =============================================================================

function registerHasRoleTool(): void {
  server.registerTool(
    'has_role',
    {
      title: 'Has Role',
      description:
        'Check if an address has a specific role on a TIP-20 token. ' +
        'This is a read-only query with no gas cost.',
      inputSchema: hasRoleInputSchema,
    },
    async (args: HasRoleInput) => {
      try {
        const tokenAddress = resolveTokenAddress(args.token);
        const roleService = getRoleService();

        const hasRole = await roleService.hasRole(
          tokenAddress,
          args.role as RoleName,
          args.account as Address
        );

        const output = createHasRoleResponse({
          hasRole,
          token: tokenAddress,
          role: args.role as RoleNameType,
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

        const errorOutput = createRoleErrorResponse({
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
// get_role_members Tool
// =============================================================================

function registerGetRoleMembersTool(): void {
  server.registerTool(
    'get_role_members',
    {
      title: 'Get Role Members',
      description:
        'Get all addresses that have a specific role on a TIP-20 token. ' +
        'This is a read-only query with no gas cost.',
      inputSchema: getRoleMembersInputSchema,
    },
    async (args: GetRoleMembersInput) => {
      try {
        const tokenAddress = resolveTokenAddress(args.token);
        const roleService = getRoleService();

        const members = await roleService.getRoleMembers(
          tokenAddress,
          args.role as RoleName
        );

        const output = createGetRoleMembersResponse({
          token: tokenAddress,
          role: args.role as RoleNameType,
          members,
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

        const errorOutput = createRoleErrorResponse({
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
// pause_token Tool
// =============================================================================

function registerPauseTokenTool(): void {
  server.registerTool(
    'pause_token',
    {
      title: 'Pause Token',
      description:
        'Emergency pause all transfers on a TIP-20 token. Requires PAUSE_ROLE. ' +
        'Use only for security incidents or compliance requirements. ' +
        'All transfers will fail until the token is unpaused.',
      inputSchema: pauseTokenInputSchema,
    },
    async (args: PauseTokenInput) => {
      const ctx = createRequestContext('pause_token');
      const config = getConfig();
      const roleService = getRoleService();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
        reason: args.reason ?? null,
      };

      try {
        const tokenAddress = resolveTokenAddress(args.token);

        const result = await roleService.pauseToken(tokenAddress);

        const pausedBy = roleService['client'].getAddress();

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'pause_token',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createPauseTokenResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          token: tokenAddress,
          pausedBy,
          reason: args.reason ?? null,
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
            tool: 'pause_token',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'pause_token',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createRoleErrorResponse({
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
// unpause_token Tool
// =============================================================================

function registerUnpauseTokenTool(): void {
  server.registerTool(
    'unpause_token',
    {
      title: 'Unpause Token',
      description:
        'Resume transfers on a paused TIP-20 token. Requires UNPAUSE_ROLE. ' +
        'Only call after verifying the security incident has been resolved.',
      inputSchema: unpauseTokenInputSchema,
    },
    async (args: UnpauseTokenInput) => {
      const ctx = createRequestContext('unpause_token');
      const config = getConfig();
      const roleService = getRoleService();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
        reason: args.reason ?? null,
      };

      try {
        const tokenAddress = resolveTokenAddress(args.token);

        const result = await roleService.unpauseToken(tokenAddress);

        const unpausedBy = roleService['client'].getAddress();

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'unpause_token',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createUnpauseTokenResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          token: tokenAddress,
          unpausedBy,
          reason: args.reason ?? null,
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
            tool: 'unpause_token',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'unpause_token',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createRoleErrorResponse({
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

/**
 * Access Key Tools
 *
 * Tools for managing Tempo access keys (session keys) for delegated signing.
 *
 * Tools in this category:
 * - create_access_key: Create a new delegated signing key (High risk)
 * - revoke_access_key: Revoke an existing access key (High risk)
 * - get_access_key_info: Get key info (Low risk)
 * - get_remaining_limit: Get remaining spending limit (Low risk)
 * - update_spending_limit: Update spending limit (High risk)
 *
 * Access keys enable:
 * - Delegated signing from primary account to secondary keys
 * - P256 (WebAuthn/passkey) and secp256k1 signature types
 * - Token-specific spending limits
 * - Expiration timestamps
 */

import type { Address } from 'viem';
import { server } from '../../server.js';
import { getConfig } from '../../config/index.js';
import { getTempoClient } from '../../services/tempo-client.js';
import { getTokenService, resolveTokenAddress } from '../../services/token-service.js';
import {
  getAccessKeyService,
  SIGNATURE_TYPE_NAMES,
} from '../../services/access-key-service.js';
import { getSecurityLayer } from '../../security/index.js';
import { buildExplorerTxUrl } from '../../utils/formatting.js';
import { normalizeError, isTempoMcpError } from '../../utils/errors.js';
import { createRequestContext } from '../../types/index.js';
import {
  // Input schemas
  createAccessKeyInputSchema,
  revokeAccessKeyInputSchema,
  getAccessKeyInfoInputSchema,
  getRemainingLimitInputSchema,
  updateSpendingLimitInputSchema,
  // Response helpers
  createRevokeAccessKeyResponse,
  createGetAccessKeyInfoResponse,
  createGetRemainingLimitResponse,
  createUpdateSpendingLimitResponse,
  createAccessKeyErrorResponse,
  // Types
  type CreateAccessKeyInput,
  type RevokeAccessKeyInput,
  type GetAccessKeyInfoInput,
  type GetRemainingLimitInput,
  type UpdateSpendingLimitInput,
} from './schemas.js';

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * Register all access key tools with the MCP server.
 */
export function registerAccessKeyTools(): void {
  registerCreateAccessKeyTool();
  registerRevokeAccessKeyTool();
  registerGetAccessKeyInfoTool();
  registerGetRemainingLimitTool();
  registerUpdateSpendingLimitTool();
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get default account address from wallet.
 */
function getDefaultAccount(): Address {
  const client = getTempoClient();
  return client.getAddress();
}

// =============================================================================
// create_access_key Tool
// =============================================================================

function registerCreateAccessKeyTool(): void {
  server.registerTool(
    'create_access_key',
    {
      title: 'Create Access Key',
      description:
        'Create a new access key (session key) for delegated signing. ' +
        'Supports P256 (WebAuthn/passkey), secp256k1, and WebAuthn signature types. ' +
        'Access keys can have spending limits per token and expiration timestamps. ' +
        'Note: This authorizes a key ID on the Account Keychain precompile. ' +
        'For full P256 key generation, use the tempo.ts SDK.',
      inputSchema: createAccessKeyInputSchema,
    },
    async (args: CreateAccessKeyInput) => {
      const ctx = createRequestContext('create_access_key');
      const security = getSecurityLayer();

      const logArgs = {
        signatureType: args.signatureType,
        expiry: args.expiry ?? null,
        enforceLimits: args.enforceLimits,
        limitsCount: args.limits?.length ?? 0,
        label: args.label ?? null,
      };

      try {
        // For this tool, we need a key ID to authorize
        // In a full implementation, we would generate a P256 key pair here
        // For now, we'll return an error explaining this limitation
        throw new Error(
          'create_access_key requires a keyId parameter. ' +
          'To create a new access key with P256 key generation, use the tempo.ts SDK: ' +
          'const keyPair = await WebCryptoP256.createKeyPair(); ' +
          'const accessKey = Account.fromWebCryptoP256(keyPair, { access: account }); ' +
          'Then use authorize_access_key tool with the derived keyId.'
        );
      } catch (error) {
        const normalized = normalizeError(error);
        const durationMs = Date.now() - ctx.startTime;

        await security.logFailure({
          requestId: ctx.requestId,
          tool: 'create_access_key',
          arguments: logArgs,
          durationMs,
          errorMessage: normalized.message,
          errorCode: normalized.code,
        });

        const errorOutput = createAccessKeyErrorResponse({
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
// revoke_access_key Tool
// =============================================================================

function registerRevokeAccessKeyTool(): void {
  server.registerTool(
    'revoke_access_key',
    {
      title: 'Revoke Access Key',
      description:
        'Revoke an existing access key. Revoked keys cannot be used for signing ' +
        'and cannot be re-authorized (to prevent replay attacks). ' +
        'This operation must be signed by the Root Key (configured wallet).',
      inputSchema: revokeAccessKeyInputSchema,
    },
    async (args: RevokeAccessKeyInput) => {
      const ctx = createRequestContext('revoke_access_key');
      const config = getConfig();
      const accessKeyService = getAccessKeyService();
      const security = getSecurityLayer();

      const logArgs = {
        keyId: args.keyId,
      };

      try {
        const result = await accessKeyService.revokeAccessKey(args.keyId as Address);

        const revokedBy = getDefaultAccount();

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'revoke_access_key',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createRevokeAccessKeyResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          keyId: args.keyId,
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
            tool: 'revoke_access_key',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'revoke_access_key',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createAccessKeyErrorResponse({
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
// get_access_key_info Tool
// =============================================================================

function registerGetAccessKeyInfoTool(): void {
  server.registerTool(
    'get_access_key_info',
    {
      title: 'Get Access Key Info',
      description:
        'Get information about an access key including signature type, expiry, ' +
        'spending limit enforcement, and revocation status. ' +
        'This is a read-only query with no gas cost.',
      inputSchema: getAccessKeyInfoInputSchema,
    },
    async (args: GetAccessKeyInfoInput) => {
      try {
        const accessKeyService = getAccessKeyService();
        const account = (args.account ?? getDefaultAccount()) as Address;

        const keyInfo = await accessKeyService.getKeyInfo(account, args.keyId as Address);

        const output = createGetAccessKeyInfoResponse({
          found: keyInfo !== null,
          keyId: args.keyId,
          account,
          signatureType: keyInfo ? SIGNATURE_TYPE_NAMES[keyInfo.signatureType] : null,
          expiry: keyInfo?.expiry ?? null,
          enforceLimits: keyInfo?.enforceLimits ?? null,
          isRevoked: keyInfo?.isRevoked ?? null,
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

        const errorOutput = createAccessKeyErrorResponse({
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
// get_remaining_limit Tool
// =============================================================================

function registerGetRemainingLimitTool(): void {
  server.registerTool(
    'get_remaining_limit',
    {
      title: 'Get Remaining Spending Limit',
      description:
        'Get the remaining spending limit for an access key on a specific token. ' +
        'Returns the amount the key can still spend. ' +
        'This is a read-only query with no gas cost.',
      inputSchema: getRemainingLimitInputSchema,
    },
    async (args: GetRemainingLimitInput) => {
      try {
        const accessKeyService = getAccessKeyService();
        const tokenService = getTokenService();
        const account = (args.account ?? getDefaultAccount()) as Address;
        const tokenAddress = resolveTokenAddress(args.token);

        // Get remaining limit
        const remainingLimit = await accessKeyService.getRemainingLimit(
          account,
          args.keyId as Address,
          tokenAddress
        );

        // Get token decimals for formatting
        let decimals = 6; // Default to 6 (common for stablecoins)
        try {
          const tokenInfo = await tokenService.getTokenInfo(tokenAddress);
          decimals = tokenInfo.decimals;
        } catch {
          // Use default decimals if token info unavailable
        }

        const output = createGetRemainingLimitResponse({
          keyId: args.keyId,
          account,
          token: tokenAddress,
          remainingLimit: remainingLimit.toString(),
          decimals,
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

        const errorOutput = createAccessKeyErrorResponse({
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
// update_spending_limit Tool
// =============================================================================

function registerUpdateSpendingLimitTool(): void {
  server.registerTool(
    'update_spending_limit',
    {
      title: 'Update Spending Limit',
      description:
        'Update the spending limit for an access key on a specific token. ' +
        'This operation must be signed by the Root Key (configured wallet). ' +
        'The new limit replaces the existing limit for that token.',
      inputSchema: updateSpendingLimitInputSchema,
    },
    async (args: UpdateSpendingLimitInput) => {
      const ctx = createRequestContext('update_spending_limit');
      const config = getConfig();
      const accessKeyService = getAccessKeyService();
      const tokenService = getTokenService();
      const security = getSecurityLayer();

      const logArgs = {
        keyId: args.keyId,
        token: args.token,
        newLimit: args.newLimit,
      };

      try {
        const tokenAddress = resolveTokenAddress(args.token);

        // Parse the new limit as bigint
        const newLimitBigInt = BigInt(args.newLimit);

        // Get token decimals for formatting
        let decimals = 6;
        try {
          const tokenInfo = await tokenService.getTokenInfo(tokenAddress);
          decimals = tokenInfo.decimals;
        } catch {
          // Use default decimals if token info unavailable
        }

        const result = await accessKeyService.updateSpendingLimit(
          args.keyId as Address,
          tokenAddress,
          newLimitBigInt
        );

        const updatedBy = getDefaultAccount();

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'update_spending_limit',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createUpdateSpendingLimitResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          keyId: args.keyId,
          token: tokenAddress,
          newLimit: args.newLimit,
          decimals,
          updatedBy,
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
            tool: 'update_spending_limit',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'update_spending_limit',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createAccessKeyErrorResponse({
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

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

import type { Address, Hex } from 'viem';
import { parseUnits } from 'viem';
import { server } from '../../server.js';
import { getConfig } from '../../config/index.js';
import { getTempoClient } from '../../services/tempo-client.js';
import { getTokenService, resolveTokenAddress } from '../../services/token-service.js';
import {
  getAccessKeyService,
  SIGNATURE_TYPE_NAMES,
  deriveAddressFromP256,
  parseSignatureType,
  type TokenLimit,
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
  createCreateAccessKeyResponse,
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
// P256 Key Generation Utilities
// =============================================================================

/**
 * Generate a P256 key pair using WebCrypto API.
 * Returns the public key coordinates and private key for storage.
 */
async function generateP256KeyPair(): Promise<{
  publicKeyX: Hex;
  publicKeyY: Hex;
  privateKeyHex: Hex;
  keyId: Address;
}> {
  // Generate P256 key pair using WebCrypto
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['sign', 'verify']
  );

  // Export public key to get coordinates
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

  if (!publicKeyJwk.x || !publicKeyJwk.y) {
    throw new Error('Failed to extract public key coordinates');
  }

  // Convert base64url to hex (32 bytes each for P-256)
  const xBytes = Buffer.from(publicKeyJwk.x, 'base64url');
  const yBytes = Buffer.from(publicKeyJwk.y, 'base64url');

  const publicKeyX = `0x${xBytes.toString('hex').padStart(64, '0')}` as Hex;
  const publicKeyY = `0x${yBytes.toString('hex').padStart(64, '0')}` as Hex;

  // Export private key
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  if (!privateKeyJwk.d) {
    throw new Error('Failed to extract private key');
  }
  const dBytes = Buffer.from(privateKeyJwk.d, 'base64url');
  const privateKeyHex = `0x${dBytes.toString('hex').padStart(64, '0')}` as Hex;

  // Derive keyId from public key coordinates
  const keyId = deriveAddressFromP256(publicKeyX, publicKeyY);

  return {
    publicKeyX,
    publicKeyY,
    privateKeyHex,
    keyId,
  };
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
        'Create a new P256 access key (session key) for delegated signing. ' +
        'Generates a new P256 key pair, authorizes it on-chain, and returns the key details. ' +
        'IMPORTANT: Store the returned privateKey securely - it cannot be recovered! ' +
        'Access keys can have spending limits per token and expiration timestamps.',
      inputSchema: createAccessKeyInputSchema,
    },
    async (args: CreateAccessKeyInput) => {
      const ctx = createRequestContext('create_access_key');
      const config = getConfig();
      const accessKeyService = getAccessKeyService();
      const security = getSecurityLayer();

      const logArgs = {
        signatureType: args.signatureType,
        expiry: args.expiry ?? null,
        enforceLimits: args.enforceLimits,
        limitsCount: args.limits?.length ?? 0,
        label: args.label ?? null,
      };

      try {
        // Generate P256 key pair
        const { publicKeyX, publicKeyY, privateKeyHex, keyId } = await generateP256KeyPair();

        // Parse signature type
        const signatureType = parseSignatureType(args.signatureType ?? 'p256');

        // Parse spending limits
        const limits: TokenLimit[] = [];
        if (args.limits && args.limits.length > 0) {
          for (const limit of args.limits) {
            const tokenAddress = resolveTokenAddress(limit.token);
            // Parse amount - assume 6 decimals for stablecoins
            const amountBigInt = parseUnits(limit.amount, 6);
            limits.push({
              token: tokenAddress,
              amount: amountBigInt,
            });
          }
        }

        // Authorize the key on-chain
        const result = await accessKeyService.authorizeKey(
          keyId,
          signatureType,
          args.expiry ?? 0,
          args.enforceLimits ?? true,
          limits
        );

        // Get creator address
        const createdBy = getDefaultAccount();

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'create_access_key',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        // Build response with key details
        const output = createCreateAccessKeyResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          keyId,
          signatureType: args.signatureType ?? 'p256',
          expiry: args.expiry ?? null,
          enforceLimits: args.enforceLimits ?? true,
          limits: args.limits,
          label: args.label ?? null,
          createdBy,
          gasCost: result.gasCost,
          explorerUrl: buildExplorerTxUrl(config.network.explorerUrl, result.hash),
        });

        // Add key material to response (user must store this!)
        const fullOutput = {
          ...output,
          keyMaterial: {
            warning: 'STORE THIS SECURELY! The private key cannot be recovered.',
            publicKeyX,
            publicKeyY,
            privateKey: privateKeyHex,
          },
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(fullOutput, null, 2),
            },
          ],
        };
      } catch (error) {
        const normalized = normalizeError(error);
        const durationMs = Date.now() - ctx.startTime;

        if (isTempoMcpError(error) && error.name === 'SecurityError') {
          await security.logRejected({
            requestId: ctx.requestId,
            tool: 'create_access_key',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'create_access_key',
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

        // Get token decimals
        let decimals = 6;
        try {
          const tokenInfo = await tokenService.getTokenInfo(tokenAddress);
          decimals = tokenInfo.decimals;
        } catch {
          // Default to 6 decimals for stablecoins
        }

        // Parse the new limit with decimals (same as create_access_key)
        const newLimitBigInt = parseUnits(args.newLimit, decimals);

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
          newLimit: newLimitBigInt.toString(), // Pass the actual on-chain value
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

/**
 * Token Operation Tools
 *
 * Tools for TIP-20 token operations on Tempo blockchain.
 *
 * Tools in this category:
 * - create_token: Deploy new TIP-20 token via factory contract
 * - get_token_info: Get token metadata (name, symbol, decimals, supply)
 * - mint_tokens: Mint tokens to address (requires ISSUER_ROLE)
 * - burn_tokens: Burn tokens from balance (requires ISSUER_ROLE)
 */

import { parseUnits, type Address } from 'viem';
import { server } from '../../server.js';
import { getConfig } from '../../config/index.js';
import {
  getTokenService,
  resolveTokenAddress,
  getTokenMetadata,
} from '../../services/token-service.js';
import { getSecurityLayer } from '../../security/index.js';
import { stringToBytes32, buildExplorerTxUrl } from '../../utils/formatting.js';
import { normalizeError, isTempoMcpError } from '../../utils/errors.js';
import { createRequestContext } from '../../types/index.js';
import {
  createTokenInputSchema,
  getTokenInfoInputSchema,
  mintTokensInputSchema,
  burnTokensInputSchema,
  createCreateTokenResponse,
  createMintTokensResponse,
  createBurnTokensResponse,
  createTokenErrorResponse,
  type CreateTokenInput,
  type GetTokenInfoInput,
  type MintTokensInput,
  type BurnTokensInput,
} from './schemas.js';

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * Register all token operation tools with the MCP server.
 */
export function registerTokenTools(): void {
  registerCreateTokenTool();
  registerGetTokenInfoTool();
  registerMintTokensTool();
  registerBurnTokensTool();
}

// =============================================================================
// create_token Tool
// =============================================================================

function registerCreateTokenTool(): void {
  server.registerTool(
    'create_token',
    {
      title: 'Create Token',
      description:
        'Deploy a new TIP-20 token on Tempo blockchain via the factory contract. ' +
        'The caller becomes the admin with ISSUER_ROLE (can mint/burn). ' +
        'All TIP-20 tokens have 6 decimals.',
      inputSchema: createTokenInputSchema,
    },
    async (args: CreateTokenInput) => {
      // Create request context for tracing
      const ctx = createRequestContext('create_token');
      const config = getConfig();
      const tokenService = getTokenService();
      const security = getSecurityLayer();

      // Create sanitized args for logging
      const logArgs = {
        name: args.name,
        symbol: args.symbol,
        currency: args.currency ?? 'USD',
        quoteToken: args.quoteToken ?? null,
      };

      try {
        // Create the token
        const result = await tokenService.createToken({
          name: args.name,
          symbol: args.symbol,
          currency: args.currency ?? 'USD',
          quoteToken: args.quoteToken as Address | undefined,
        });

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'create_token',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        // Build response
        const output = createCreateTokenResponse({
          tokenAddress: result.tokenAddress,
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          name: args.name,
          symbol: args.symbol,
          currency: args.currency ?? 'USD',
          admin: config.wallet.privateKey
            ? '(configured wallet)'
            : 'unknown',
          quoteToken: args.quoteToken ?? config.contracts.pathUSD,
          gasCost: result.gasCost,
          explorerUrl: buildExplorerTxUrl(
            config.network.explorerUrl,
            result.hash
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
        const normalized = normalizeError(error);
        const durationMs = Date.now() - ctx.startTime;

        // Log failure
        await security.logFailure({
          requestId: ctx.requestId,
          tool: 'create_token',
          arguments: logArgs,
          durationMs,
          errorMessage: normalized.message,
          errorCode: normalized.code,
        });

        const errorOutput = createTokenErrorResponse({
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
// get_token_info Tool
// =============================================================================

function registerGetTokenInfoTool(): void {
  server.registerTool(
    'get_token_info',
    {
      title: 'Get Token Info',
      description:
        'Get metadata for a TIP-20 token including name, symbol, decimals, and total supply.',
      inputSchema: getTokenInfoInputSchema,
    },
    async (args: GetTokenInfoInput) => {
      const tokenService = getTokenService();

      try {
        // Resolve token address from symbol or address
        const tokenAddress = resolveTokenAddress(args.token);

        // Get token info
        const info = await tokenService.getTokenInfo(tokenAddress);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      } catch (error) {
        const normalized = normalizeError(error);
        const errorOutput = createTokenErrorResponse({
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
// mint_tokens Tool
// =============================================================================

function registerMintTokensTool(): void {
  server.registerTool(
    'mint_tokens',
    {
      title: 'Mint Tokens',
      description:
        'Mint new TIP-20 tokens to a recipient address. ' +
        'Requires ISSUER_ROLE on the token contract (automatically granted to token creator). ' +
        'Subject to spending limits and security validation.',
      inputSchema: mintTokensInputSchema,
    },
    async (args: MintTokensInput) => {
      // Create request context for tracing
      const ctx = createRequestContext('mint_tokens');
      const config = getConfig();
      const tokenService = getTokenService();
      const security = getSecurityLayer();

      // Create sanitized args for logging
      const logArgs = {
        token: args.token,
        to: args.to,
        amount: args.amount,
        memo: args.memo ?? null,
      };

      try {
        // Resolve token address
        const tokenAddress = resolveTokenAddress(args.token);

        // Get token metadata for decimals and symbol
        const { symbol: tokenSymbol, decimals } =
          await getTokenMetadata(tokenAddress);

        // Convert amount to wei
        const amountWei = parseUnits(args.amount, decimals);

        // Security validation (same as payments)
        await security.validatePayment({
          token: tokenSymbol,
          to: args.to as Address,
          amount: args.amount,
          isBatch: false,
        });

        // Encode memo if provided
        const memo = args.memo ? stringToBytes32(args.memo) : undefined;

        // Execute mint
        const result = await tokenService.mintTokens({
          token: tokenAddress,
          to: args.to as Address,
          amount: amountWei,
          memo,
        });

        // Record in security layer
        security.recordPayment({
          token: tokenSymbol,
          to: args.to as Address,
          amount: args.amount,
        });

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'mint_tokens',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        // Build response
        const output = createMintTokensResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          token: tokenAddress,
          tokenSymbol,
          to: args.to,
          amount: args.amount,
          amountRaw: amountWei.toString(),
          memo: args.memo ?? null,
          gasCost: result.gasCost,
          explorerUrl: buildExplorerTxUrl(
            config.network.explorerUrl,
            result.hash
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
        const normalized = normalizeError(error);
        const durationMs = Date.now() - ctx.startTime;

        // Log the error
        if (isTempoMcpError(error) && error.name === 'SecurityError') {
          await security.logRejected({
            requestId: ctx.requestId,
            tool: 'mint_tokens',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'mint_tokens',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createTokenErrorResponse({
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
// burn_tokens Tool
// =============================================================================

function registerBurnTokensTool(): void {
  server.registerTool(
    'burn_tokens',
    {
      title: 'Burn Tokens',
      description:
        "Burn TIP-20 tokens from the caller's balance. " +
        'Requires ISSUER_ROLE on the token contract (automatically granted to token creator). ' +
        'Subject to spending limits and security validation.',
      inputSchema: burnTokensInputSchema,
    },
    async (args: BurnTokensInput) => {
      // Create request context for tracing
      const ctx = createRequestContext('burn_tokens');
      const config = getConfig();
      const tokenService = getTokenService();
      const security = getSecurityLayer();

      // Create sanitized args for logging
      const logArgs = {
        token: args.token,
        amount: args.amount,
        memo: args.memo ?? null,
      };

      try {
        // Resolve token address
        const tokenAddress = resolveTokenAddress(args.token);

        // Get token metadata for decimals and symbol
        const { symbol: tokenSymbol, decimals } =
          await getTokenMetadata(tokenAddress);

        // Convert amount to wei
        const amountWei = parseUnits(args.amount, decimals);

        // Security validation (audit logging, rate limits)
        // Note: Burning doesn't need recipient validation since it's from own balance
        await security.validatePayment({
          token: tokenSymbol,
          to: '0x0000000000000000000000000000000000000000' as Address, // Burn address
          amount: args.amount,
          isBatch: false,
        });

        // Encode memo if provided
        const memo = args.memo ? stringToBytes32(args.memo) : undefined;

        // Execute burn
        const result = await tokenService.burnTokens({
          token: tokenAddress,
          amount: amountWei,
          memo,
        });

        // SECURITY FIX: Record payment for spending tracking
        // Previously missing - burns were not counted against limits
        security.recordPayment({
          token: tokenSymbol,
          to: '0x0000000000000000000000000000000000000000' as Address, // Burn address
          amount: args.amount,
        });

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'burn_tokens',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        // Build response
        const output = createBurnTokensResponse({
          transactionHash: result.hash,
          blockNumber: result.blockNumber,
          token: tokenAddress,
          tokenSymbol,
          amount: args.amount,
          amountRaw: amountWei.toString(),
          memo: args.memo ?? null,
          gasCost: result.gasCost,
          explorerUrl: buildExplorerTxUrl(
            config.network.explorerUrl,
            result.hash
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
        const normalized = normalizeError(error);
        const durationMs = Date.now() - ctx.startTime;

        // Log the error
        if (isTempoMcpError(error) && error.name === 'SecurityError') {
          await security.logRejected({
            requestId: ctx.requestId,
            tool: 'burn_tokens',
            arguments: logArgs,
            durationMs,
            rejectionReason: error.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'burn_tokens',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createTokenErrorResponse({
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

/**
 * Fee AMM Tool Registration
 *
 * This module registers all Fee AMM liquidity management tools with the MCP server.
 * These tools enable AI agents to manage liquidity in Tempo's Fee AMM for automatic
 * gas fee token conversion.
 *
 * Tools registered:
 * - get_fee_pool_info: Get pool reserves and statistics
 * - add_fee_liquidity: Add liquidity to a fee pool
 * - remove_fee_liquidity: Remove liquidity from a fee pool
 * - get_lp_position: Get LP token balance and underlying value
 * - estimate_fee_swap: Estimate output for a fee token swap
 */

import { server } from '../../server.js';
import { getFeeAmmService, PATH_USD_ADDRESS, FEE_SWAP_RATE } from '../../services/fee-amm-service.js';
import { resolveTokenAddress, getTokenService } from '../../services/token-service.js';
import { getConfig } from '../../config/index.js';
import { getSecurityLayer } from '../../security/index.js';
import { buildExplorerTxUrl } from '../../utils/formatting.js';
import { normalizeError, isTempoMcpError } from '../../utils/errors.js';
import { createRequestContext } from '../../types/index.js';
import { parseUnits, formatUnits, type Address } from 'viem';

import {
  getFeePoolInfoInputSchema,
  addFeeLiquidityInputSchema,
  removeFeeLiquidityInputSchema,
  getLpPositionInputSchema,
  estimateFeeSwapInputSchema,
  createGetFeePoolInfoResponse,
  createAddFeeLiquidityResponse,
  createRemoveFeeLiquidityResponse,
  createGetLpPositionResponse,
  createEstimateFeeSwapResponse,
  createFeeAmmErrorResponse,
  type GetFeePoolInfoInput,
  type AddFeeLiquidityInput,
  type RemoveFeeLiquidityInput,
  type GetLpPositionInput,
  type EstimateFeeSwapInput,
} from './schemas.js';

// =============================================================================
// Constants
// =============================================================================

/** Default decimals for USD stablecoins */
const DEFAULT_DECIMALS = 6;

// =============================================================================
// Tool: get_fee_pool_info
// =============================================================================

function registerGetFeePoolInfoTool(): void {
  server.registerTool(
    'get_fee_pool_info',
    {
      title: 'Get Fee Pool Info',
      description:
        'Get information about a Fee AMM liquidity pool including reserves, LP supply, ' +
        'and swap rate. Use this to check pool health and available liquidity.',
      inputSchema: getFeePoolInfoInputSchema,
    },
    async (args: GetFeePoolInfoInput) => {
      try {
        const feeAmmService = getFeeAmmService();
        const tokenService = getTokenService();

        // Resolve token addresses
        const userTokenAddress = resolveTokenAddress(args.userToken);
        const validatorTokenAddress = args.validatorToken
          ? resolveTokenAddress(args.validatorToken)
          : PATH_USD_ADDRESS;

        // Get pool info
        const poolInfo = await feeAmmService.getPoolInfo(
          userTokenAddress,
          validatorTokenAddress
        );

        // Get token metadata for formatting
        const [userTokenInfo, validatorTokenInfo] = await Promise.all([
          tokenService.getTokenInfo(userTokenAddress),
          tokenService.getTokenInfo(validatorTokenAddress),
        ]);

        const userDecimals = userTokenInfo.decimals;
        const validatorDecimals = validatorTokenInfo.decimals;

        const output = createGetFeePoolInfoResponse({
          pool: `${userTokenInfo.symbol}/${validatorTokenInfo.symbol}`,
          userToken: {
            address: userTokenAddress,
            symbol: userTokenInfo.symbol,
            reserve: formatUnits(poolInfo.reserveUser, userDecimals),
            reserveRaw: poolInfo.reserveUser.toString(),
          },
          validatorToken: {
            address: validatorTokenAddress,
            symbol: validatorTokenInfo.symbol,
            reserve: formatUnits(poolInfo.reserveValidator, validatorDecimals),
            reserveRaw: poolInfo.reserveValidator.toString(),
          },
          totalLpSupply: formatUnits(poolInfo.totalLpSupply, DEFAULT_DECIMALS),
          totalLpSupplyRaw: poolInfo.totalLpSupply.toString(),
          swapRate: poolInfo.swapRate,
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
        const errorOutput = createFeeAmmErrorResponse({
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
// Tool: add_fee_liquidity
// =============================================================================

function registerAddFeeLiquidityTool(): void {
  server.registerTool(
    'add_fee_liquidity',
    {
      title: 'Add Fee Liquidity',
      description:
        'Add liquidity to a Fee AMM pool. You must provide equal USD value of both tokens. ' +
        'The first liquidity provider burns 1000 LP tokens to prevent manipulation. ' +
        'Both tokens will be automatically approved if needed.',
      inputSchema: addFeeLiquidityInputSchema,
    },
    async (args: AddFeeLiquidityInput) => {
      const ctx = createRequestContext('add_fee_liquidity');
      const config = getConfig();
      const security = getSecurityLayer();

      const logArgs = {
        userToken: args.userToken,
        validatorToken: args.validatorToken ?? 'PathUSD',
        amountUserToken: args.amountUserToken,
        amountValidatorToken: args.amountValidatorToken,
      };

      try {
        const feeAmmService = getFeeAmmService();
        const tokenService = getTokenService();

        // Resolve token addresses
        const userTokenAddress = resolveTokenAddress(args.userToken);
        const validatorTokenAddress = args.validatorToken
          ? resolveTokenAddress(args.validatorToken)
          : PATH_USD_ADDRESS;

        // Get token decimals
        const [userTokenInfo, validatorTokenInfo] = await Promise.all([
          tokenService.getTokenInfo(userTokenAddress),
          tokenService.getTokenInfo(validatorTokenAddress),
        ]);

        const userDecimals = userTokenInfo.decimals;
        const validatorDecimals = validatorTokenInfo.decimals;

        // Parse amounts
        const amountUser = parseUnits(args.amountUserToken, userDecimals);
        const amountValidator = parseUnits(args.amountValidatorToken, validatorDecimals);

        // Add liquidity
        const result = await feeAmmService.addLiquidity({
          userToken: userTokenAddress,
          validatorToken: validatorTokenAddress,
          amountUser,
          amountValidator,
        });

        // Get updated pool info for share calculation
        const poolInfo = await feeAmmService.getPoolInfo(
          userTokenAddress,
          validatorTokenAddress
        );

        const shareOfPool = poolInfo.totalLpSupply > 0n
          ? (Number(result.lpTokensMinted) / Number(poolInfo.totalLpSupply) * 100).toFixed(4)
          : '100.0000';

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'add_fee_liquidity',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createAddFeeLiquidityResponse({
          lpTokensMinted: formatUnits(result.lpTokensMinted, DEFAULT_DECIMALS),
          lpTokensMintedRaw: result.lpTokensMinted.toString(),
          userTokenAdded: args.amountUserToken,
          validatorTokenAdded: args.amountValidatorToken,
          poolShare: `${shareOfPool}%`,
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
            tool: 'add_fee_liquidity',
            arguments: logArgs,
            durationMs,
            rejectionReason: normalized.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'add_fee_liquidity',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createFeeAmmErrorResponse({
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
// Tool: remove_fee_liquidity
// =============================================================================

function registerRemoveFeeLiquidityTool(): void {
  server.registerTool(
    'remove_fee_liquidity',
    {
      title: 'Remove Fee Liquidity',
      description:
        'Remove liquidity from a Fee AMM pool by burning LP tokens. ' +
        'You will receive proportional amounts of both the user token and validator token.',
      inputSchema: removeFeeLiquidityInputSchema,
    },
    async (args: RemoveFeeLiquidityInput) => {
      const ctx = createRequestContext('remove_fee_liquidity');
      const config = getConfig();
      const security = getSecurityLayer();

      const logArgs = {
        userToken: args.userToken,
        validatorToken: args.validatorToken ?? 'PathUSD',
        lpTokenAmount: args.lpTokenAmount,
      };

      try {
        const feeAmmService = getFeeAmmService();
        const tokenService = getTokenService();

        // Resolve token addresses
        const userTokenAddress = resolveTokenAddress(args.userToken);
        const validatorTokenAddress = args.validatorToken
          ? resolveTokenAddress(args.validatorToken)
          : PATH_USD_ADDRESS;

        // Get token decimals
        const [userTokenInfo, validatorTokenInfo] = await Promise.all([
          tokenService.getTokenInfo(userTokenAddress),
          tokenService.getTokenInfo(validatorTokenAddress),
        ]);

        const userDecimals = userTokenInfo.decimals;
        const validatorDecimals = validatorTokenInfo.decimals;

        // Parse LP amount
        const lpAmount = parseUnits(args.lpTokenAmount, DEFAULT_DECIMALS);

        // Remove liquidity
        const result = await feeAmmService.removeLiquidity({
          userToken: userTokenAddress,
          validatorToken: validatorTokenAddress,
          lpAmount,
        });

        // Log success
        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'remove_fee_liquidity',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createRemoveFeeLiquidityResponse({
          lpTokensBurned: args.lpTokenAmount,
          userTokenReceived: formatUnits(result.userTokenReceived, userDecimals),
          userTokenReceivedRaw: result.userTokenReceived.toString(),
          validatorTokenReceived: formatUnits(result.validatorTokenReceived, validatorDecimals),
          validatorTokenReceivedRaw: result.validatorTokenReceived.toString(),
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
            tool: 'remove_fee_liquidity',
            arguments: logArgs,
            durationMs,
            rejectionReason: normalized.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'remove_fee_liquidity',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createFeeAmmErrorResponse({
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
// Tool: get_lp_position
// =============================================================================

function registerGetLpPositionTool(): void {
  server.registerTool(
    'get_lp_position',
    {
      title: 'Get LP Position',
      description:
        'Get your LP token balance and the underlying token values for a Fee AMM pool. ' +
        'Shows your share of the pool and how much you would receive if you removed all liquidity.',
      inputSchema: getLpPositionInputSchema,
    },
    async (args: GetLpPositionInput) => {
      try {
        const feeAmmService = getFeeAmmService();
        const tokenService = getTokenService();

        // Resolve token addresses
        const userTokenAddress = resolveTokenAddress(args.userToken);
        const validatorTokenAddress = args.validatorToken
          ? resolveTokenAddress(args.validatorToken)
          : PATH_USD_ADDRESS;
        const accountAddress = args.address as Address | undefined;

        // Get LP position
        const position = await feeAmmService.getLpPosition(
          userTokenAddress,
          validatorTokenAddress,
          accountAddress
        );

        // Get token metadata for formatting
        const [userTokenInfo, validatorTokenInfo] = await Promise.all([
          tokenService.getTokenInfo(userTokenAddress),
          tokenService.getTokenInfo(validatorTokenAddress),
        ]);

        const userDecimals = userTokenInfo.decimals;
        const validatorDecimals = validatorTokenInfo.decimals;

        // Calculate total value (approximate, assumes 1:1 for stablecoins)
        const totalValue =
          parseFloat(formatUnits(position.underlyingUserToken, userDecimals)) +
          parseFloat(formatUnits(position.underlyingValidatorToken, validatorDecimals));

        const output = createGetLpPositionResponse({
          pool: `${userTokenInfo.symbol}/${validatorTokenInfo.symbol}`,
          address: accountAddress ?? feeAmmService['client'].getAddress(),
          lpBalance: formatUnits(position.lpBalance, DEFAULT_DECIMALS),
          lpBalanceRaw: position.lpBalance.toString(),
          shareOfPool: `${(position.shareOfPool * 100).toFixed(4)}%`,
          underlyingValue: {
            userToken: formatUnits(position.underlyingUserToken, userDecimals),
            userTokenRaw: position.underlyingUserToken.toString(),
            validatorToken: formatUnits(position.underlyingValidatorToken, validatorDecimals),
            validatorTokenRaw: position.underlyingValidatorToken.toString(),
            total: `$${totalValue.toFixed(2)}`,
          },
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
        const errorOutput = createFeeAmmErrorResponse({
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
// Tool: estimate_fee_swap
// =============================================================================

function registerEstimateFeeSwapTool(): void {
  server.registerTool(
    'estimate_fee_swap',
    {
      title: 'Estimate Fee Swap',
      description:
        'Estimate the output amount for a fee token swap. The Fee AMM uses a fixed rate ' +
        'of 0.9985 (0.15% protocol fee) for all conversions between USD stablecoins.',
      inputSchema: estimateFeeSwapInputSchema,
    },
    async (args: EstimateFeeSwapInput) => {
      try {
        const feeAmmService = getFeeAmmService();
        const tokenService = getTokenService();

        // Resolve token addresses
        const fromTokenAddress = resolveTokenAddress(args.fromToken);
        const toTokenAddress = resolveTokenAddress(args.toToken);

        // Get token decimals
        const [fromTokenInfo, toTokenInfo] = await Promise.all([
          tokenService.getTokenInfo(fromTokenAddress),
          tokenService.getTokenInfo(toTokenAddress),
        ]);

        const fromDecimals = fromTokenInfo.decimals;
        const toDecimals = toTokenInfo.decimals;

        // Parse amount
        const amountIn = parseUnits(args.amount, fromDecimals);

        // Get quote
        const amountOut = await feeAmmService.estimateFeeSwap(
          fromTokenAddress,
          toTokenAddress,
          amountIn
        );

        // Calculate effective rate
        const amountInFloat = parseFloat(args.amount);
        const amountOutFloat = parseFloat(formatUnits(amountOut, toDecimals));
        const effectiveRate = amountInFloat > 0 ? amountOutFloat / amountInFloat : 0;

        // Calculate slippage from theoretical rate
        const slippage = ((1 - effectiveRate / FEE_SWAP_RATE) * 100).toFixed(4);

        const output = createEstimateFeeSwapResponse({
          fromToken: fromTokenAddress,
          toToken: toTokenAddress,
          amountIn: args.amount,
          amountInRaw: amountIn.toString(),
          amountOut: formatUnits(amountOut, toDecimals),
          amountOutRaw: amountOut.toString(),
          effectiveRate: effectiveRate.toFixed(6),
          slippage: `${slippage}%`,
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
        const errorOutput = createFeeAmmErrorResponse({
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
// Registration Orchestrator
// =============================================================================

/**
 * Register all Fee AMM tools with the MCP server.
 *
 * Tools registered:
 * - get_fee_pool_info: Get pool reserves and statistics (Low risk)
 * - add_fee_liquidity: Add liquidity to a fee pool (High risk)
 * - remove_fee_liquidity: Remove liquidity from a pool (High risk)
 * - get_lp_position: Get LP token balance and value (Low risk)
 * - estimate_fee_swap: Estimate swap output (Low risk)
 */
export function registerFeeAmmTools(): void {
  registerGetFeePoolInfoTool();
  registerAddFeeLiquidityTool();
  registerRemoveFeeLiquidityTool();
  registerGetLpPositionTool();
  registerEstimateFeeSwapTool();
}

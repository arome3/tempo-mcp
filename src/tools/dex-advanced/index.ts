/**
 * DEX Advanced Tool Registration
 *
 * This module registers all DEX Advanced orderbook tools with the MCP server.
 * These tools enable AI agents to place limit orders, flip orders, and manage
 * orders on Tempo's native stablecoin DEX.
 *
 * Tools registered:
 * - place_limit_order: Place a resting limit order (High risk)
 * - place_flip_order: Place an auto-reversing flip order (High risk)
 * - cancel_order: Cancel an open order (Medium risk)
 * - get_orderbook: View orderbook depth (Low risk)
 * - get_my_orders: List your open orders (Low risk)
 * - get_order_status: Check specific order status (Low risk)
 */

import { server } from '../../server.js';
import {
  getDexAdvancedService,
  PATH_USD_ADDRESS,
  DEX_ADDRESS,
} from '../../services/dex-advanced-service.js';
import { resolveTokenAddress, getTokenService } from '../../services/token-service.js';
import { getConfig } from '../../config/index.js';
import { getSecurityLayer } from '../../security/index.js';
import { buildExplorerTxUrl } from '../../utils/formatting.js';
import { normalizeError, isTempoMcpError } from '../../utils/errors.js';
import { createRequestContext } from '../../types/index.js';
import { parseUnits, formatUnits } from 'viem';

import {
  placeLimitOrderInputSchema,
  placeFlipOrderInputSchema,
  cancelOrderInputSchema,
  getOrderbookInputSchema,
  getMyOrdersInputSchema,
  getOrderStatusInputSchema,
  createPlaceLimitOrderResponse,
  createPlaceFlipOrderResponse,
  createCancelOrderResponse,
  createGetOrderbookResponse,
  createGetMyOrdersResponse,
  createGetOrderStatusResponse,
  createDexAdvancedErrorResponse,
  type PlaceLimitOrderInput,
  type PlaceFlipOrderInput,
  type CancelOrderInput,
  type GetOrderbookInput,
  type GetMyOrdersInput,
  type GetOrderStatusInput,
} from './schemas.js';

// =============================================================================
// Constants
// =============================================================================

/** TIP-20 tokens always have 6 decimals */
const TIP20_DECIMALS = 6;

// =============================================================================
// Tool: place_limit_order (High Risk)
// =============================================================================

function registerPlaceLimitOrderTool(): void {
  server.registerTool(
    'place_limit_order',
    {
      title: 'Place Limit Order',
      description:
        'Place a resting limit order on the stablecoin DEX orderbook. ' +
        'Orders are queued and added at block-end for MEV protection. ' +
        'Uses tick-based pricing: tick = (price - 1) × 100,000. ' +
        'Examples: tick 0 = $1.0000, tick 10 = $1.0001, tick -10 = $0.9999.',
      inputSchema: placeLimitOrderInputSchema,
    },
    async (args: PlaceLimitOrderInput) => {
      const ctx = createRequestContext('place_limit_order');
      const config = getConfig();
      const security = getSecurityLayer();

      const logArgs = {
        token: args.token,
        amount: args.amount,
        side: args.side,
        tick: args.tick,
      };

      try {
        const dexService = getDexAdvancedService();
        const tokenService = getTokenService();

        // Resolve token address
        const tokenAddress = resolveTokenAddress(args.token);

        // Get token info for formatting
        const tokenInfo = await tokenService.getTokenInfo(tokenAddress);

        // Parse amount
        const amount = parseUnits(args.amount, TIP20_DECIMALS);

        // Validate spending via security layer (treat order as spending)
        const spendToken = args.side === 'buy' ? PATH_USD_ADDRESS : tokenAddress;
        const spendAmount = args.side === 'buy'
          ? dexService.calculateQuoteAmount(amount, args.tick)
          : amount;

        await security.validatePayment({
          token: spendToken,
          to: DEX_ADDRESS,
          amount: formatUnits(spendAmount, TIP20_DECIMALS),
        });

        // Place the order
        const result = await dexService.placeLimitOrder({
          token: tokenAddress,
          amount,
          side: args.side,
          tick: args.tick,
        });

        // Record the payment and log success
        security.recordPayment({
          token: spendToken,
          to: DEX_ADDRESS,
          amount: formatUnits(spendAmount, TIP20_DECIMALS),
        });

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'place_limit_order',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createPlaceLimitOrderResponse({
          orderId: result.orderId.toString(),
          token: tokenAddress,
          tokenSymbol: tokenInfo.symbol,
          side: args.side,
          amount: args.amount,
          amountRaw: amount.toString(),
          tick: args.tick,
          price: dexService.tickToPrice(args.tick).toFixed(6),
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
            tool: 'place_limit_order',
            arguments: logArgs,
            durationMs,
            rejectionReason: normalized.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'place_limit_order',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createDexAdvancedErrorResponse({
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
// Tool: place_flip_order (High Risk)
// =============================================================================

function registerPlaceFlipOrderTool(): void {
  server.registerTool(
    'place_flip_order',
    {
      title: 'Place Flip Order',
      description:
        'Place an auto-reversing flip order that provides perpetual liquidity. ' +
        'When filled, the order automatically places a new order on the opposite side. ' +
        'Buy orders flip to sells at flipTick, sell orders flip to buys. ' +
        'Ideal for market making around the $1.00 parity price.',
      inputSchema: placeFlipOrderInputSchema,
    },
    async (args: PlaceFlipOrderInput) => {
      const ctx = createRequestContext('place_flip_order');
      const config = getConfig();
      const security = getSecurityLayer();

      const flipTick = args.flipTick ?? -args.tick;

      const logArgs = {
        token: args.token,
        amount: args.amount,
        side: args.side,
        tick: args.tick,
        flipTick,
      };

      try {
        const dexService = getDexAdvancedService();
        const tokenService = getTokenService();

        // Resolve token address
        const tokenAddress = resolveTokenAddress(args.token);

        // Get token info for formatting
        const tokenInfo = await tokenService.getTokenInfo(tokenAddress);

        // Parse amount
        const amount = parseUnits(args.amount, TIP20_DECIMALS);

        // Validate spending via security layer
        const spendToken = args.side === 'buy' ? PATH_USD_ADDRESS : tokenAddress;
        const spendAmount = args.side === 'buy'
          ? dexService.calculateQuoteAmount(amount, args.tick)
          : amount;

        await security.validatePayment({
          token: spendToken,
          to: DEX_ADDRESS,
          amount: formatUnits(spendAmount, TIP20_DECIMALS),
        });

        // Place the flip order
        const result = await dexService.placeFlipOrder({
          token: tokenAddress,
          amount,
          side: args.side,
          tick: args.tick,
          flipTick,
        });

        // Record the payment and log success
        security.recordPayment({
          token: spendToken,
          to: DEX_ADDRESS,
          amount: formatUnits(spendAmount, TIP20_DECIMALS),
        });

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'place_flip_order',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createPlaceFlipOrderResponse({
          orderId: result.orderId.toString(),
          token: tokenAddress,
          tokenSymbol: tokenInfo.symbol,
          side: args.side,
          amount: args.amount,
          amountRaw: amount.toString(),
          tick: args.tick,
          tickPrice: dexService.tickToPrice(args.tick).toFixed(6),
          flipTick,
          flipPrice: dexService.tickToPrice(flipTick).toFixed(6),
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
            tool: 'place_flip_order',
            arguments: logArgs,
            durationMs,
            rejectionReason: normalized.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'place_flip_order',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createDexAdvancedErrorResponse({
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
// Tool: cancel_order (Medium Risk)
// =============================================================================

function registerCancelOrderTool(): void {
  server.registerTool(
    'cancel_order',
    {
      title: 'Cancel Order',
      description:
        'Cancel an open order on the DEX. The remaining unfilled amount will be ' +
        'refunded to your account. Orders that are already filled or cancelled ' +
        'cannot be cancelled.',
      inputSchema: cancelOrderInputSchema,
    },
    async (args: CancelOrderInput) => {
      const ctx = createRequestContext('cancel_order');
      const config = getConfig();
      const security = getSecurityLayer();

      const logArgs = {
        orderId: args.orderId,
      };

      try {
        const dexService = getDexAdvancedService();

        // Parse order ID
        const orderId = BigInt(args.orderId);

        // Cancel the order
        const result = await dexService.cancelOrder(orderId);

        await security.logSuccess({
          requestId: ctx.requestId,
          tool: 'cancel_order',
          arguments: logArgs,
          durationMs: Date.now() - ctx.startTime,
          transactionHash: result.hash,
          gasCost: result.gasCost,
        });

        const output = createCancelOrderResponse({
          orderId: args.orderId,
          cancelledOrder: {
            side: result.order.side,
            amount: result.order.amount,
            filled: result.order.filled,
            tick: result.order.tick,
            price: dexService.tickToPrice(result.order.tick).toFixed(6),
          },
          refundedAmount: formatUnits(result.refundedAmount, TIP20_DECIMALS),
          refundedAmountRaw: result.refundedAmount.toString(),
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
            tool: 'cancel_order',
            arguments: logArgs,
            durationMs,
            rejectionReason: normalized.message,
          });
        } else {
          await security.logFailure({
            requestId: ctx.requestId,
            tool: 'cancel_order',
            arguments: logArgs,
            durationMs,
            errorMessage: normalized.message,
            errorCode: normalized.code,
          });
        }

        const errorOutput = createDexAdvancedErrorResponse({
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
// Tool: get_orderbook (Low Risk)
// =============================================================================

function registerGetOrderbookTool(): void {
  server.registerTool(
    'get_orderbook',
    {
      title: 'Get Orderbook',
      description:
        'View the orderbook depth for a token pair. Shows bid and ask levels ' +
        'with prices and amounts. Use depth parameter to control how many ' +
        'price levels to return (1-50, default 10).',
      inputSchema: getOrderbookInputSchema,
    },
    async (args: GetOrderbookInput) => {
      try {
        const dexService = getDexAdvancedService();
        const tokenService = getTokenService();

        // Resolve token addresses
        const baseTokenAddress = resolveTokenAddress(args.baseToken);
        const quoteTokenAddress = args.quoteToken
          ? resolveTokenAddress(args.quoteToken)
          : PATH_USD_ADDRESS;

        // Get token info
        const [baseTokenInfo, quoteTokenInfo] = await Promise.all([
          tokenService.getTokenInfo(baseTokenAddress),
          tokenService.getTokenInfo(quoteTokenAddress),
        ]);

        // Get orderbook
        const orderbook = await dexService.getOrderbook(
          baseTokenAddress,
          quoteTokenAddress,
          args.depth ?? 10
        );

        // Format the response
        const output = createGetOrderbookResponse({
          pair: `${baseTokenInfo.symbol}/${quoteTokenInfo.symbol}`,
          baseToken: baseTokenAddress,
          quoteToken: quoteTokenAddress,
          midPrice: orderbook.midPrice?.toFixed(6) ?? null,
          spread: orderbook.spread?.toFixed(6) ?? null,
          spreadPercent: orderbook.spreadPercent,
          asks: orderbook.asks.map((level) => ({
            price: level.price.toFixed(6),
            tick: level.tick,
            amount: level.amountFormatted,
          })),
          bids: orderbook.bids.map((level) => ({
            price: level.price.toFixed(6),
            tick: level.tick,
            amount: level.amountFormatted,
          })),
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
        const errorOutput = createDexAdvancedErrorResponse({
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
// Tool: get_my_orders (Low Risk)
// =============================================================================

function registerGetMyOrdersTool(): void {
  server.registerTool(
    'get_my_orders',
    {
      title: 'Get My Orders',
      description:
        'List your open orders on the DEX. Can filter by token and status. ' +
        'Status options: "open" (default), "filled", "cancelled", or "all".',
      inputSchema: getMyOrdersInputSchema,
    },
    async (args: GetMyOrdersInput) => {
      try {
        const dexService = getDexAdvancedService();
        const tokenService = getTokenService();

        // Resolve token address if provided
        const tokenAddress = args.token
          ? resolveTokenAddress(args.token)
          : undefined;

        // Get orders
        const orders = await dexService.getOrdersByOwner(
          undefined, // Use configured wallet address
          tokenAddress,
          args.status === 'all' ? undefined : args.status
        );

        // Format orders with token symbols
        const formattedOrders = await Promise.all(
          orders.map(async (order) => {
            let tokenSymbol = 'UNKNOWN';
            try {
              const tokenInfo = await tokenService.getTokenInfo(order.token);
              tokenSymbol = tokenInfo.symbol;
            } catch {
              // Token info not available
            }

            return {
              orderId: order.orderId.toString(),
              token: order.token,
              tokenSymbol,
              side: order.side,
              amount: formatUnits(order.amount, TIP20_DECIMALS),
              filled: formatUnits(order.filled, TIP20_DECIMALS),
              remaining: formatUnits(order.remaining, TIP20_DECIMALS),
              tick: order.tick,
              price: dexService.tickToPrice(order.tick).toFixed(6),
              status: order.status,
              isFlip: order.isFlip,
            };
          })
        );

        const output = createGetMyOrdersResponse({
          totalOrders: formattedOrders.length,
          orders: formattedOrders,
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
        const errorOutput = createDexAdvancedErrorResponse({
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
// Tool: get_order_status (Low Risk)
// =============================================================================

function registerGetOrderStatusTool(): void {
  server.registerTool(
    'get_order_status',
    {
      title: 'Get Order Status',
      description:
        'Check the status of a specific order by ID. Returns order details ' +
        'including amount, filled amount, price, and current status.',
      inputSchema: getOrderStatusInputSchema,
    },
    async (args: GetOrderStatusInput) => {
      try {
        const dexService = getDexAdvancedService();
        const tokenService = getTokenService();

        // Parse order ID
        const orderId = BigInt(args.orderId);

        // Get order
        const order = await dexService.getOrder(orderId);

        // Get token symbol
        let tokenSymbol = 'UNKNOWN';
        try {
          const tokenInfo = await tokenService.getTokenInfo(order.token);
          tokenSymbol = tokenInfo.symbol;
        } catch {
          // Token info not available
        }

        // Format amounts as strings
        const amountStr = formatUnits(order.amount, TIP20_DECIMALS);
        const filledStr = formatUnits(order.filled, TIP20_DECIMALS);
        const remainingStr = formatUnits(order.remaining, TIP20_DECIMALS);

        // Calculate fill percentage
        const amountNum = Number(order.amount);
        const filledNum = Number(order.filled);
        const fillPercent = amountNum > 0
          ? ((filledNum / amountNum) * 100).toFixed(2)
          : '0.00';

        const output = createGetOrderStatusResponse({
          orderId: args.orderId,
          owner: order.owner,
          token: order.token,
          tokenSymbol,
          side: order.side,
          tick: order.tick,
          price: dexService.tickToPrice(order.tick).toFixed(6),
          amount: amountStr,
          filled: filledStr,
          remaining: remainingStr,
          fillPercent: `${fillPercent}%`,
          status: order.status,
          isFlip: order.isFlip,
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
        const errorOutput = createDexAdvancedErrorResponse({
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
 * Register all DEX Advanced tools with the MCP server.
 *
 * Tools registered:
 * - place_limit_order: Place resting limit order (High risk)
 * - place_flip_order: Place auto-reversing flip order (High risk)
 * - cancel_order: Cancel open order (Medium risk)
 * - get_orderbook: View orderbook depth (Low risk)
 * - get_my_orders: List your open orders (Low risk)
 * - get_order_status: Check order status (Low risk)
 */
export function registerDexAdvancedTools(): void {
  registerPlaceLimitOrderTool();
  registerPlaceFlipOrderTool();
  registerCancelOrderTool();
  registerGetOrderbookTool();
  registerGetMyOrdersTool();
  registerGetOrderStatusTool();
}

/**
 * DEX Advanced Service
 *
 * Handles advanced orderbook operations on Tempo's native stablecoin DEX.
 * Provides limit orders, flip orders, order management, and orderbook queries.
 *
 * @see https://docs.tempo.xyz/guide/stablecoin-exchange/providing-liquidity
 */

import { formatUnits, keccak256, toBytes, type Address, type Hash } from 'viem';
import { Actions, Addresses } from 'tempo.ts/viem';
import { getTempoClient } from './tempo-client.js';
import { getTokenService } from './token-service.js';
import { ValidationError, BlockchainError } from '../utils/errors.js';

// =============================================================================
// Constants
// =============================================================================

/** TIP-20 tokens always have 6 decimals */
const TIP20_DECIMALS = 6;

/** PathUSD - the quote token for all DEX pairs */
export const PATH_USD_ADDRESS = '0x20c0000000000000000000000000000000000000' as const;

/** DEX Contract address */
export const DEX_ADDRESS = Addresses.stablecoinExchange;

/** OrderPlaced event signature: keccak256("OrderPlaced(uint128,address,address,uint128,bool,int16)") */
const ORDER_PLACED_SIGNATURE = keccak256(
  toBytes('OrderPlaced(uint128,address,address,uint128,bool,int16)')
);

/** FlipOrderPlaced event signature: keccak256("FlipOrderPlaced(uint128,address,address,uint128,bool,int16,int16)") */
const FLIP_ORDER_PLACED_SIGNATURE = keccak256(
  toBytes('FlipOrderPlaced(uint128,address,address,uint128,bool,int16,int16)')
);

// =============================================================================
// ERC-20 Approval ABI
// =============================================================================

/**
 * ERC-20 approval ABI for allowance checks and approvals.
 */
const ERC20_APPROVAL_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// =============================================================================
// DEX ABI Definitions
// =============================================================================

/**
 * Stablecoin DEX ABI for orderbook operations.
 * Note: Most operations use tempo.ts Actions which handle encoding internally.
 */
export const DEX_ABI = [
  // Order placement
  {
    name: 'place',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint128' },
      { name: 'isBid', type: 'bool' },
      { name: 'tick', type: 'int16' },
    ],
    outputs: [{ name: 'orderId', type: 'uint128' }],
  },
  {
    name: 'placeFlip',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint128' },
      { name: 'isBid', type: 'bool' },
      { name: 'tick', type: 'int16' },
      { name: 'flipTick', type: 'int16' },
    ],
    outputs: [{ name: 'orderId', type: 'uint128' }],
  },
  {
    name: 'cancel',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'uint128' }],
    outputs: [],
  },
  // View functions
  {
    name: 'activeOrderId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint128' }],
  },
  {
    name: 'pendingOrderId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint128' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint128' }],
  },
  // Events
  {
    name: 'OrderPlaced',
    type: 'event',
    inputs: [
      { name: 'orderId', type: 'uint128', indexed: true },
      { name: 'maker', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint128', indexed: false },
      { name: 'isBid', type: 'bool', indexed: false },
      { name: 'tick', type: 'int16', indexed: false },
    ],
  },
  {
    name: 'FlipOrderPlaced',
    type: 'event',
    inputs: [
      { name: 'orderId', type: 'uint128', indexed: true },
      { name: 'maker', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint128', indexed: false },
      { name: 'isBid', type: 'bool', indexed: false },
      { name: 'tick', type: 'int16', indexed: false },
      { name: 'flipTick', type: 'int16', indexed: false },
    ],
  },
  {
    name: 'OrderCancelled',
    type: 'event',
    inputs: [
      { name: 'orderId', type: 'uint128', indexed: true },
      { name: 'maker', type: 'address', indexed: true },
    ],
  },
] as const;

// =============================================================================
// Types
// =============================================================================

/** Order side type */
export type OrderSide = 'buy' | 'sell';

/** Order status */
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'queued';

/** Order details from the DEX */
export interface Order {
  orderId: bigint;
  owner: Address;
  token: Address;
  tokenSymbol: string;
  amount: bigint;
  remaining: bigint;
  filled: bigint;
  side: OrderSide;
  tick: number;
  price: number;
  status: OrderStatus;
  isFlip: boolean;
}

/** Orderbook level (aggregated liquidity at a price) */
export interface OrderbookLevel {
  tick: number;
  price: number;
  amount: bigint;
  amountFormatted: string;
}

/** Full orderbook snapshot */
export interface Orderbook {
  baseToken: Address;
  baseTokenSymbol: string;
  quoteToken: Address;
  quoteTokenSymbol: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  spreadPercent: string | null;
  midPrice: number | null;
}

/** Result of placing an order */
export interface PlaceOrderResult {
  orderId: bigint;
  hash: Hash;
  blockNumber: number;
  gasCost: string;
}

/** Result of cancelling an order */
export interface CancelOrderResult {
  hash: Hash;
  blockNumber: number;
  gasCost: string;
  refundedAmount: bigint;
  /** Order details before cancellation */
  order: {
    side: OrderSide;
    amount: string;
    filled: string;
    tick: number;
  };
}

// =============================================================================
// DexAdvancedService Class
// =============================================================================

/**
 * Service for advanced DEX orderbook operations.
 *
 * Provides limit orders, flip orders, order management, and orderbook queries
 * on Tempo's native stablecoin exchange.
 *
 * @example
 * ```typescript
 * const service = getDexAdvancedService();
 *
 * // Place a limit order
 * const result = await service.placeLimitOrder({
 *   token: '0x20c0000000000000000000000000000000000001',
 *   amount: parseUnits('1000', 6),
 *   side: 'buy',
 *   tick: -10,  // $0.9999
 * });
 *
 * // Get orderbook
 * const book = await service.getOrderbook('0x20c0000000000000000000000000000000000001');
 * ```
 */
export class DexAdvancedService {
  private client = getTempoClient();

  // ===========================================================================
  // Price Conversion Utilities
  // ===========================================================================

  /**
   * Convert a tick value to a price.
   *
   * Formula: price = 1 + tick / 100,000
   *
   * @param tick - The tick value (-100000 to +100000)
   * @returns The price (e.g., 0.9999, 1.0000, 1.0001)
   */
  tickToPrice(tick: number): number {
    return 1 + tick / 100000;
  }

  /**
   * Convert a price to a tick value.
   *
   * Formula: tick = (price - 1) * 100,000
   *
   * @param price - The price (e.g., 0.9999, 1.0000, 1.0001)
   * @returns The tick value
   */
  priceToTick(price: number): number {
    return Math.round((price - 1) * 100000);
  }

  /**
   * Validate a tick value is within acceptable range.
   *
   * @param tick - The tick to validate
   * @throws ValidationError if tick is out of range
   */
  private validateTick(tick: number): void {
    // int16 range, but DEX may have tighter bounds
    if (tick < -32768 || tick > 32767) {
      throw new ValidationError(
        1012,
        `Tick value ${tick} is out of range. Must be between -32768 and 32767.`,
        {
          recoverable: false,
          details: {
            field: 'tick',
            expected: '-32768 to 32767',
            received: String(tick),
          },
        }
      );
    }
  }

  // ===========================================================================
  // Order Placement Methods
  // ===========================================================================

  /**
   * Place a limit order on the orderbook.
   *
   * The order will be queued and added to the book at end-of-block
   * to prevent frontrunning and MEV attacks.
   *
   * @param params - Order parameters
   * @returns Order placement result with orderId and transaction hash
   */
  async placeLimitOrder(params: {
    token: Address;
    amount: bigint;
    side: OrderSide;
    tick: number;
  }): Promise<PlaceOrderResult> {
    const { token, amount, side, tick } = params;

    this.validateTick(tick);

    // Determine which token needs to be approved
    // Buy orders spend the quote token (PathUSD)
    // Sell orders spend the base token
    const spendToken = side === 'buy' ? PATH_USD_ADDRESS : token;

    // For buy orders, calculate the quote amount needed based on tick
    const spendAmount = side === 'buy'
      ? this.calculateQuoteAmount(amount, tick)
      : amount;

    // Approve DEX to spend tokens
    await this.approveToken(spendToken, spendAmount);

    // Create the order placement call
    const calls = [
      Actions.dex.place.call({
        token,
        amount,
        type: side,
        tick,
      }),
    ];

    // Send batch transaction
    const hash = await this.client.sendBatch(calls);
    const receipt = await this.client.waitForTransaction(hash);

    // Parse orderId from event logs
    const orderId = this.parseOrderIdFromReceipt(receipt);

    // Calculate gas cost
    const gasCost = this.calculateGasCost(receipt);

    return {
      orderId,
      hash,
      blockNumber: Number(receipt.blockNumber),
      gasCost,
    };
  }

  /**
   * Place a flip order on the orderbook.
   *
   * Flip orders automatically reverse to the opposite side when filled,
   * providing perpetual liquidity and capturing spread on each round-trip.
   *
   * @param params - Flip order parameters
   * @returns Order placement result with orderId and transaction hash
   */
  async placeFlipOrder(params: {
    token: Address;
    amount: bigint;
    side: OrderSide;
    tick: number;
    flipTick?: number;
  }): Promise<PlaceOrderResult> {
    const { token, amount, side, tick } = params;

    // Default flipTick to negative of tick (symmetric around parity)
    const flipTick = params.flipTick ?? -tick;

    this.validateTick(tick);
    this.validateTick(flipTick);

    // Validate flip tick constraints
    if (side === 'buy' && flipTick <= tick) {
      throw new ValidationError(
        1013,
        'For buy orders, flipTick must be greater than tick',
        {
          recoverable: false,
          details: {
            field: 'flipTick',
            suggestion: `Use a flipTick greater than ${tick}`,
          },
        }
      );
    }
    if (side === 'sell' && flipTick >= tick) {
      throw new ValidationError(
        1013,
        'For sell orders, flipTick must be less than tick',
        {
          recoverable: false,
          details: {
            field: 'flipTick',
            suggestion: `Use a flipTick less than ${tick}`,
          },
        }
      );
    }

    // Flip orders need approval for both tokens since they trade both ways
    const baseSpendAmount = amount;
    const quoteSpendAmount = this.calculateQuoteAmount(amount, Math.max(tick, flipTick));

    await Promise.all([
      this.approveToken(token, baseSpendAmount),
      this.approveToken(PATH_USD_ADDRESS, quoteSpendAmount),
    ]);

    // Create the flip order placement call
    const calls = [
      Actions.dex.placeFlip.call({
        token,
        amount,
        type: side,
        tick,
        flipTick,
      }),
    ];

    // Send batch transaction
    const hash = await this.client.sendBatch(calls);
    const receipt = await this.client.waitForTransaction(hash);

    // Parse orderId from event logs
    const orderId = this.parseOrderIdFromReceipt(receipt);

    // Calculate gas cost
    const gasCost = this.calculateGasCost(receipt);

    return {
      orderId,
      hash,
      blockNumber: Number(receipt.blockNumber),
      gasCost,
    };
  }

  /**
   * Cancel an open order.
   *
   * Cancellation executes immediately (not queued like new orders).
   * Any unfilled amount is refunded to your DEX balance.
   *
   * @param orderId - The order ID to cancel
   * @returns Cancellation result with refund amount
   */
  async cancelOrder(orderId: bigint): Promise<CancelOrderResult> {
    // Get order details first to know refund amount
    const order = await this.getOrder(orderId);

    if (order.status === 'cancelled') {
      throw new ValidationError(
        1014,
        `Order ${orderId} is already cancelled`,
        { recoverable: false }
      );
    }
    if (order.status === 'filled') {
      throw new ValidationError(
        1014,
        `Order ${orderId} is already filled`,
        { recoverable: false }
      );
    }

    // Create cancel call
    const calls = [
      Actions.dex.cancel.call({ orderId }),
    ];

    // Send batch transaction
    const hash = await this.client.sendBatch(calls);
    const receipt = await this.client.waitForTransaction(hash);

    // Calculate gas cost
    const gasCost = this.calculateGasCost(receipt);

    return {
      hash,
      blockNumber: Number(receipt.blockNumber),
      gasCost,
      refundedAmount: order.remaining,
      order: {
        side: order.side,
        amount: formatUnits(order.amount, TIP20_DECIMALS),
        filled: formatUnits(order.filled, TIP20_DECIMALS),
        tick: order.tick,
      },
    };
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Get details of a specific order.
   *
   * @param orderId - The order ID to query
   * @returns Order details
   */
  async getOrder(orderId: bigint): Promise<Order> {
    const client = getTempoClient();
    const publicClient = client['publicClient'];
    const tokenService = getTokenService();

    try {
      // Use Actions.dex.getOrder to get order details
      const orderData = await Actions.dex.getOrder(publicClient, { orderId });

      // The bookKey contains the pair info - we need to decode it to get the base token
      // For now, we'll use the bookKey as the token identifier
      // In production, you'd decode the bookKey or query the books() function
      const bookKey = orderData.bookKey;

      // Try to get book info to extract token address
      let tokenAddress: Address = PATH_USD_ADDRESS; // Default
      let tokenSymbol = 'UNKNOWN';

      try {
        // Query the books function to get base token from bookKey
        const bookInfo = await publicClient.readContract({
          address: DEX_ADDRESS,
          abi: [{
            name: 'books',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'pairKey', type: 'bytes32' }],
            outputs: [
              { name: 'base', type: 'address' },
              { name: 'quote', type: 'address' },
              { name: 'bestBidTick', type: 'int16' },
              { name: 'bestAskTick', type: 'int16' },
            ],
          }],
          functionName: 'books',
          args: [bookKey],
        }) as [Address, Address, number, number];

        tokenAddress = bookInfo[0];
        const tokenInfo = await tokenService.getTokenInfo(tokenAddress);
        tokenSymbol = tokenInfo.symbol;
      } catch {
        // Use bookKey as fallback identifier if book lookup fails
      }

      // Calculate filled amount
      const filled = orderData.amount - orderData.remaining;

      // Determine status
      let status: OrderStatus = 'open';
      if (orderData.remaining === 0n) {
        status = 'filled';
      }

      return {
        orderId,
        owner: orderData.maker, // Note: tempo.ts uses 'maker' not 'owner'
        token: tokenAddress,
        tokenSymbol,
        amount: orderData.amount,
        remaining: orderData.remaining,
        filled,
        side: orderData.isBid ? 'buy' : 'sell',
        tick: orderData.tick,
        price: this.tickToPrice(orderData.tick),
        status,
        isFlip: orderData.isFlip,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BlockchainError(
        3020,
        `Failed to get order ${orderId}: ${message}`,
        { recoverable: true }
      );
    }
  }

  /**
   * Get the orderbook for a token pair.
   *
   * Uses the books() and getTickLevel() contract functions directly.
   *
   * @param baseToken - The base token address (e.g., AlphaUSD)
   * @param quoteToken - The quote token (defaults to PathUSD)
   * @param depth - Number of price levels to return per side
   * @returns Orderbook snapshot with bids and asks
   */
  async getOrderbook(
    baseToken: Address,
    quoteToken: Address = PATH_USD_ADDRESS,
    depth: number = 10
  ): Promise<Orderbook> {
    const client = getTempoClient();
    const publicClient = client['publicClient'];
    const tokenService = getTokenService();

    // Get token symbols
    const [baseTokenInfo, quoteTokenInfo] = await Promise.all([
      tokenService.getTokenInfo(baseToken),
      tokenService.getTokenInfo(quoteToken),
    ]);

    // Get pair key and best ticks from books()
    const pairKey = await publicClient.readContract({
      address: DEX_ADDRESS,
      abi: [{
        name: 'pairKey',
        type: 'function',
        stateMutability: 'pure',
        inputs: [
          { name: 'tokenA', type: 'address' },
          { name: 'tokenB', type: 'address' },
        ],
        outputs: [{ name: 'key', type: 'bytes32' }],
      }],
      functionName: 'pairKey',
      args: [baseToken, quoteToken],
    }) as `0x${string}`;

    // Get book info including best bid/ask ticks
    const bookInfo = await publicClient.readContract({
      address: DEX_ADDRESS,
      abi: [{
        name: 'books',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'pairKey', type: 'bytes32' }],
        outputs: [
          { name: 'base', type: 'address' },
          { name: 'quote', type: 'address' },
          { name: 'bestBidTick', type: 'int16' },
          { name: 'bestAskTick', type: 'int16' },
        ],
      }],
      functionName: 'books',
      args: [pairKey],
    }) as [Address, Address, number, number];

    const [, , bestBidTick, bestAskTick] = bookInfo;

    // Query tick levels for bids and asks using getTickLevel
    const bidLevels: OrderbookLevel[] = [];
    const askLevels: OrderbookLevel[] = [];

    // Query around the best ticks
    const tickSpacing = 10; // Default tick spacing

    // Query bid levels (starting from best bid going down)
    for (let i = 0; i < depth; i++) {
      const tick = bestBidTick - (i * tickSpacing);
      try {
        const [, , totalLiquidity] = await publicClient.readContract({
          address: DEX_ADDRESS,
          abi: [{
            name: 'getTickLevel',
            type: 'function',
            stateMutability: 'view',
            inputs: [
              { name: 'base', type: 'address' },
              { name: 'tick', type: 'int16' },
              { name: 'isBid', type: 'bool' },
            ],
            outputs: [
              { name: 'head', type: 'uint128' },
              { name: 'tail', type: 'uint128' },
              { name: 'totalLiquidity', type: 'uint128' },
            ],
          }],
          functionName: 'getTickLevel',
          args: [baseToken, tick, true],
        }) as [bigint, bigint, bigint];

        if (totalLiquidity > 0n) {
          bidLevels.push({
            tick,
            price: this.tickToPrice(tick),
            amount: totalLiquidity,
            amountFormatted: formatUnits(totalLiquidity, TIP20_DECIMALS),
          });
        }
      } catch {
        // No liquidity at this tick
      }
    }

    // Query ask levels (starting from best ask going up)
    for (let i = 0; i < depth; i++) {
      const tick = bestAskTick + (i * tickSpacing);
      try {
        const [, , totalLiquidity] = await publicClient.readContract({
          address: DEX_ADDRESS,
          abi: [{
            name: 'getTickLevel',
            type: 'function',
            stateMutability: 'view',
            inputs: [
              { name: 'base', type: 'address' },
              { name: 'tick', type: 'int16' },
              { name: 'isBid', type: 'bool' },
            ],
            outputs: [
              { name: 'head', type: 'uint128' },
              { name: 'tail', type: 'uint128' },
              { name: 'totalLiquidity', type: 'uint128' },
            ],
          }],
          functionName: 'getTickLevel',
          args: [baseToken, tick, false],
        }) as [bigint, bigint, bigint];

        if (totalLiquidity > 0n) {
          askLevels.push({
            tick,
            price: this.tickToPrice(tick),
            amount: totalLiquidity,
            amountFormatted: formatUnits(totalLiquidity, TIP20_DECIMALS),
          });
        }
      } catch {
        // No liquidity at this tick
      }
    }

    // Sort bids descending (highest first), asks ascending (lowest first)
    bidLevels.sort((a, b) => b.tick - a.tick);
    askLevels.sort((a, b) => a.tick - b.tick);

    // Calculate spread metrics
    const bestBid = bidLevels[0]?.price ?? null;
    const bestAsk = askLevels[0]?.price ?? null;
    let spread: number | null = null;
    let spreadPercent: string | null = null;
    let midPrice: number | null = null;

    if (bestBid !== null && bestAsk !== null) {
      spread = bestAsk - bestBid;
      midPrice = (bestBid + bestAsk) / 2;
      spreadPercent = ((spread / midPrice) * 100).toFixed(4);
    }

    return {
      baseToken,
      baseTokenSymbol: baseTokenInfo.symbol,
      quoteToken,
      quoteTokenSymbol: quoteTokenInfo.symbol,
      bids: bidLevels.slice(0, depth),
      asks: askLevels.slice(0, depth),
      bestBid,
      bestAsk,
      spread,
      spreadPercent: spreadPercent ? `${spreadPercent}%` : null,
      midPrice,
    };
  }

  /**
   * Get all orders for an owner.
   *
   * Note: This is a simplified implementation. Production would use
   * event indexing for efficient queries.
   *
   * @param owner - Owner address (defaults to configured wallet)
   * @param token - Optional token filter
   * @param status - Optional status filter
   * @returns List of orders
   */
  async getOrdersByOwner(
    owner?: Address,
    token?: Address,
    status?: OrderStatus
  ): Promise<Order[]> {
    const client = getTempoClient();
    const publicClient = client['publicClient'];

    const targetOwner = owner ?? client.getAddress();

    // Get the latest order ID to know the range
    const latestOrderId = await publicClient.readContract({
      address: DEX_ADDRESS,
      abi: DEX_ABI,
      functionName: 'activeOrderId',
    }) as bigint;

    const orders: Order[] = [];

    // Query recent orders (last 100)
    // Production would use indexed events or subgraph
    const startId = latestOrderId > 100n ? latestOrderId - 100n : 1n;

    for (let id = startId; id <= latestOrderId; id++) {
      try {
        const order = await this.getOrder(id);

        // Filter by owner
        if (order.owner.toLowerCase() !== targetOwner.toLowerCase()) {
          continue;
        }

        // Filter by token if specified
        if (token && order.token.toLowerCase() !== token.toLowerCase()) {
          continue;
        }

        // Filter by status if specified
        if (status && order.status !== status) {
          continue;
        }

        orders.push(order);
      } catch {
        // Order doesn't exist or error - skip
      }
    }

    return orders;
  }

  /**
   * Get your DEX balance for a token.
   *
   * DEX balance is separate from wallet balance. Funds are credited
   * to DEX balance when orders are cancelled or withdrawn.
   *
   * @param token - Token address to check
   * @param owner - Optional owner address (defaults to wallet)
   * @returns Balance on the DEX
   */
  async getDexBalance(token: Address, owner?: Address): Promise<bigint> {
    const client = getTempoClient();
    const publicClient = client['publicClient'];

    const targetOwner = owner ?? client.getAddress();

    const balance = await publicClient.readContract({
      address: DEX_ADDRESS,
      abi: DEX_ABI,
      functionName: 'balanceOf',
      args: [targetOwner, token],
    }) as bigint;

    return balance;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Calculate the quote amount needed for a buy order at a given tick.
   *
   * @param baseAmount - Amount of base token
   * @param tick - Price tick
   * @returns Amount of quote token needed (with 1% buffer)
   */
  calculateQuoteAmount(baseAmount: bigint, tick: number): bigint {
    const price = this.tickToPrice(tick);
    // Add 1% buffer for price movements
    const bufferedPrice = price * 1.01;
    return BigInt(Math.ceil(Number(baseAmount) * bufferedPrice));
  }

  /**
   * Approve the DEX to spend tokens.
   */
  private async approveToken(token: Address, amount: bigint): Promise<void> {
    const client = getTempoClient();
    const walletClient = client['walletClient'];

    if (!walletClient) {
      throw new BlockchainError(
        3005,
        'Wallet not configured for token approval',
        { recoverable: false }
      );
    }

    // Check current allowance
    const publicClient = client['publicClient'];
    const currentAllowance = await publicClient.readContract({
      address: token,
      abi: ERC20_APPROVAL_ABI,
      functionName: 'allowance',
      args: [client.getAddress(), DEX_ADDRESS],
    }) as bigint;

    // Only approve if needed
    if (currentAllowance >= amount) {
      return;
    }

    const hash = await walletClient.writeContract({
      address: token,
      abi: [
        {
          name: 'approve',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ],
      functionName: 'approve',
      args: [DEX_ADDRESS, amount],
      feeToken: client['feeToken'],
    } as Parameters<typeof walletClient.writeContract>[0]);

    await client.waitForTransaction(hash);
  }

  /**
   * Parse order ID from transaction receipt events.
   */
  private parseOrderIdFromReceipt(receipt: {
    logs: Array<{ address: string; topics: string[]; data: string }>;
  }): bigint {
    // Look for OrderPlaced or FlipOrderPlaced event from the DEX contract
    for (const log of receipt.logs) {
      // Check if this log is from the DEX contract
      if (log.address.toLowerCase() !== DEX_ADDRESS.toLowerCase()) {
        continue;
      }

      // Check if this is an OrderPlaced or FlipOrderPlaced event
      const eventSig = log.topics[0];
      if (
        eventSig !== ORDER_PLACED_SIGNATURE &&
        eventSig !== FLIP_ORDER_PLACED_SIGNATURE
      ) {
        continue;
      }

      // OrderPlaced and FlipOrderPlaced have orderId as first indexed topic
      if (log.topics.length >= 2) {
        const orderIdHex = log.topics[1];
        if (orderIdHex) {
          return BigInt(orderIdHex);
        }
      }
    }

    // If we couldn't parse from logs, return 0 (should not happen in practice)
    return 0n;
  }

  /**
   * Calculate gas cost from receipt.
   */
  private calculateGasCost(receipt: {
    gasUsed: bigint;
    effectiveGasPrice?: bigint;
  }): string {
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice ?? 0n;
    return formatUnits(gasUsed * gasPrice, TIP20_DECIMALS);
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

let serviceInstance: DexAdvancedService | null = null;

/**
 * Get or create the singleton DexAdvancedService instance.
 */
export function getDexAdvancedService(): DexAdvancedService {
  if (!serviceInstance) {
    serviceInstance = new DexAdvancedService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetDexAdvancedService(): void {
  serviceInstance = null;
}

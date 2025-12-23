/**
 * Market Maker Agent
 *
 * Automated market-making CLI for Tempo DEX orderbook.
 *
 * Usage:
 *   npx tsx src/index.ts                      # Show help
 *   npx tsx src/index.ts --orderbook AlphaUSD # View orderbook
 *   npx tsx src/index.ts --orders             # View open orders
 */

import 'dotenv/config';
import { createTempoClient, callTool, disconnect } from '../../shared/client.js';
import type { GetOrderbookResult, GetMyOrdersResult } from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printTable,
  printDivider,
  formatAmount,
} from '../../shared/utils.js';

function tickToPrice(tick: number): number {
  return 1 + tick / 100000;
}

function printUsage() {
  console.log('Usage: npx tsx src/index.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --orderbook <token>  View orderbook for token pair');
  console.log('  --orders             View your open orders');
  console.log('  --help               Show this help');
  console.log('');
  console.log('Order Commands:');
  console.log('  npx tsx src/place-order.ts   # Place limit/flip orders');
  console.log('  npx tsx src/cancel-order.ts  # Cancel orders');
  console.log('');
  console.log('Tick Pricing:');
  console.log('  tick 0    = $1.0000');
  console.log('  tick -10  = $0.9999 (buy below parity)');
  console.log('  tick 10   = $1.0001 (sell above parity)');
}

interface CliArgs {
  orderbook?: string;
  orders: boolean;
}

function parseArgs(): CliArgs | null {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    return null;
  }

  const result: CliArgs = {
    orders: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--orderbook' || arg === '-o') {
      result.orderbook = args[++i] || process.env.MM_DEFAULT_TOKEN || 'AlphaUSD';
    } else if (arg === '--orders') {
      result.orders = true;
    }
  }

  return result;
}

async function showOrderbook(
  client: ReturnType<typeof createTempoClient> extends Promise<infer T> ? T : never,
  token: string
) {
  printInfo(`Fetching orderbook for ${token}...`);

  const orderbook = await callTool<GetOrderbookResult>(client, 'get_orderbook', {
    baseToken: token,
    depth: 10,
  });

  printDivider();
  console.log(`\n  Orderbook: ${orderbook.pair}\n`);

  // Calculate mid price and spread
  if (orderbook.midPrice) {
    console.log(`  Mid Price: $${orderbook.midPrice}`);
    console.log(`  Spread: ${orderbook.spread} (${orderbook.spreadPercent})`);
  }
  console.log('');

  // Display asks (sell orders) - reversed so best ask is at bottom
  if (orderbook.asks.length > 0) {
    console.log('  ASKS (Sell Orders):');
    printTable(
      ['Price', 'Tick', 'Amount'],
      [...orderbook.asks].reverse().map((level) => [
        `$${level.price}`,
        level.tick.toString(),
        formatAmount(level.amount),
      ])
    );
  } else {
    console.log('  ASKS: No sell orders');
  }

  console.log('');
  console.log('  ─────────────────────── SPREAD ───────────────────────');
  console.log('');

  // Display bids (buy orders)
  if (orderbook.bids.length > 0) {
    console.log('  BIDS (Buy Orders):');
    printTable(
      ['Price', 'Tick', 'Amount'],
      orderbook.bids.map((level) => [
        `$${level.price}`,
        level.tick.toString(),
        formatAmount(level.amount),
      ])
    );
  } else {
    console.log('  BIDS: No buy orders');
  }
}

async function showOrders(
  client: ReturnType<typeof createTempoClient> extends Promise<infer T> ? T : never
) {
  printInfo('Fetching your open orders...');

  const result = await callTool<GetMyOrdersResult>(client, 'get_my_orders', {
    status: 'open',
  });

  printDivider();
  console.log(`\n  Your Orders: ${result.totalOrders} open\n`);

  if (result.orders.length === 0) {
    console.log('  No open orders found.');
    console.log('  Use: npx tsx src/place-order.ts to place orders');
    return;
  }

  printTable(
    ['ID', 'Token', 'Side', 'Amount', 'Filled', 'Price', 'Flip'],
    result.orders.map((order) => [
      order.orderId,
      order.tokenSymbol,
      order.side.toUpperCase(),
      formatAmount(order.amount),
      `${order.filled}/${order.remaining}`,
      `$${order.price}`,
      order.isFlip ? 'Yes' : 'No',
    ])
  );

  console.log('');
  printInfo('To cancel an order: npx tsx src/cancel-order.ts --id <order-id>');
}

async function main() {
  const cliArgs = parseArgs();
  if (!cliArgs) {
    process.exit(0);
  }

  printHeader('Tempo Market Maker');

  const client = await createTempoClient();

  try {
    if (cliArgs.orderbook) {
      await showOrderbook(client, cliArgs.orderbook);
    }

    if (cliArgs.orders) {
      await showOrders(client);
    }

    if (!cliArgs.orderbook && !cliArgs.orders) {
      printUsage();
    }
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

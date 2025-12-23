/**
 * Place Order
 *
 * Place limit or flip orders on Tempo DEX.
 *
 * Usage:
 *   npx tsx src/place-order.ts --side buy --token AlphaUSD --amount 100 --tick -10
 *   npx tsx src/place-order.ts --flip --side buy --token AlphaUSD --amount 100 --tick -10 --flip-tick 10
 */

import 'dotenv/config';
import { createTempoClient, callTool, disconnect } from '../../shared/client.js';
import type { PlaceLimitOrderResult, PlaceFlipOrderResult } from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printTable,
  formatAmount,
  confirm,
} from '../../shared/utils.js';

function tickToPrice(tick: number): number {
  return 1 + tick / 100000;
}

function printUsage() {
  console.log('Usage: npx tsx src/place-order.ts [options]');
  console.log('');
  console.log('Required:');
  console.log('  --side <buy|sell>    Order side');
  console.log('  --token <symbol>     Token to trade (e.g., AlphaUSD)');
  console.log('  --amount <number>    Amount of tokens');
  console.log('  --tick <number>      Price tick (-32768 to 32767)');
  console.log('');
  console.log('Optional:');
  console.log('  --flip               Create a flip order (auto-reversing)');
  console.log('  --flip-tick <number> Tick for reverse order (required with --flip)');
  console.log('  --help               Show this help');
  console.log('');
  console.log('Tick Pricing:');
  console.log('  tick 0    = $1.0000');
  console.log('  tick -10  = $0.9999 (buy below parity)');
  console.log('  tick 10   = $1.0001 (sell above parity)');
  console.log('');
  console.log('Examples:');
  console.log('  # Place limit buy at $0.9999');
  console.log('  npx tsx src/place-order.ts --side buy --token AlphaUSD --amount 100 --tick -10');
  console.log('');
  console.log('  # Place flip order: buy at $0.9999, auto-sell at $1.0001');
  console.log('  npx tsx src/place-order.ts --flip --side buy --token AlphaUSD --amount 100 --tick -10 --flip-tick 10');
}

interface OrderArgs {
  side: 'buy' | 'sell';
  token: string;
  amount: string;
  tick: number;
  isFlip: boolean;
  flipTick?: number;
}

function parseArgs(): OrderArgs | null {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return null;
  }

  let side: 'buy' | 'sell' | undefined;
  let token: string | undefined;
  let amount: string | undefined;
  let tick: number | undefined;
  let isFlip = false;
  let flipTick: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--side':
      case '-s':
        side = args[++i] as 'buy' | 'sell';
        break;
      case '--token':
      case '-t':
        token = args[++i];
        break;
      case '--amount':
      case '-a':
        amount = args[++i];
        break;
      case '--tick':
        tick = parseInt(args[++i], 10);
        break;
      case '--flip':
        isFlip = true;
        break;
      case '--flip-tick':
        flipTick = parseInt(args[++i], 10);
        break;
    }
  }

  // Validate required args
  if (!side || !token || !amount || tick === undefined) {
    printError('Missing required arguments');
    printUsage();
    return null;
  }

  if (side !== 'buy' && side !== 'sell') {
    printError('Side must be "buy" or "sell"');
    return null;
  }

  if (isFlip && flipTick === undefined) {
    // Default flip tick to opposite side of parity
    const defaultSpread = parseInt(process.env.MM_SPREAD_TICKS || '20', 10);
    flipTick = side === 'buy' ? Math.abs(tick) + defaultSpread : -Math.abs(tick) - defaultSpread;
    printInfo(`Auto-calculated flip tick: ${flipTick} ($${tickToPrice(flipTick).toFixed(6)})`);
  }

  return { side, token, amount, tick, isFlip, flipTick };
}

async function main() {
  const orderArgs = parseArgs();
  if (!orderArgs) {
    process.exit(0);
  }

  const { side, token, amount, tick, isFlip, flipTick } = orderArgs;

  printHeader('Tempo DEX Order');

  const price = tickToPrice(tick);
  console.log('');
  console.log('Order Details:');
  console.log(`  Token:  ${token}`);
  console.log(`  Side:   ${side.toUpperCase()}`);
  console.log(`  Amount: ${formatAmount(amount)}`);
  console.log(`  Tick:   ${tick}`);
  console.log(`  Price:  $${price.toFixed(6)}`);

  if (isFlip && flipTick !== undefined) {
    const flipPrice = tickToPrice(flipTick);
    console.log(`  Type:   FLIP ORDER`);
    console.log(`  Flip Tick: ${flipTick}`);
    console.log(`  Flip Price: $${flipPrice.toFixed(6)}`);
    console.log(`  Spread: $${Math.abs(flipPrice - price).toFixed(6)} (${Math.abs(flipTick - tick)} ticks)`);
  } else {
    console.log(`  Type:   LIMIT ORDER`);
  }
  console.log('');

  const shouldProceed = await confirm('Place this order?');
  if (!shouldProceed) {
    printInfo('Order cancelled');
    return;
  }

  const client = await createTempoClient();

  try {
    printInfo('Submitting order...');

    if (isFlip && flipTick !== undefined) {
      // Place flip order
      const result = await callTool<PlaceFlipOrderResult>(client, 'place_flip_order', {
        token,
        amount,
        side,
        tick,
        flipTick,
      });

      if (!result.success) {
        printError(`Order failed: ${result.error?.message}`);
        process.exit(1);
      }

      printSuccess('Flip order placed!');
      printTable(
        ['Field', 'Value'],
        [
          ['Order ID', result.orderId ?? 'N/A'],
          ['Status', result.status ?? 'queued'],
          ['Initial Side', result.side?.toUpperCase() ?? 'N/A'],
          ['Amount', formatAmount(result.amount ?? '0')],
          ['Entry Price', `$${result.tickPrice ?? '0'}`],
          ['Flip Price', `$${result.flipPrice ?? '0'}`],
          ['Transaction', result.transactionHash ?? 'N/A'],
          ['Block', result.blockNumber?.toString() ?? 'Pending'],
          ['Gas Cost', result.gasCost ?? 'N/A'],
        ]
      );

      console.log('');
      console.log(result.behavior);
    } else {
      // Place limit order
      const result = await callTool<PlaceLimitOrderResult>(client, 'place_limit_order', {
        token,
        amount,
        side,
        tick,
      });

      if (!result.success) {
        printError(`Order failed: ${result.error?.message}`);
        process.exit(1);
      }

      printSuccess('Limit order placed!');
      printTable(
        ['Field', 'Value'],
        [
          ['Order ID', result.orderId ?? 'N/A'],
          ['Status', result.status ?? 'queued'],
          ['Side', result.side?.toUpperCase() ?? 'N/A'],
          ['Amount', formatAmount(result.amount ?? '0')],
          ['Price', `$${result.price ?? '0'}`],
          ['Transaction', result.transactionHash ?? 'N/A'],
          ['Block', result.blockNumber?.toString() ?? 'Pending'],
          ['Gas Cost', result.gasCost ?? 'N/A'],
        ]
      );

      if (result.note) {
        console.log('');
        printInfo(result.note);
      }
    }

    console.log('');
    printInfo('View your orders: npx tsx src/index.ts --orders');
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

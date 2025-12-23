/**
 * Cancel Order
 *
 * Cancel an open order on Tempo DEX.
 *
 * Usage:
 *   npx tsx src/cancel-order.ts --id <order-id>
 */

import 'dotenv/config';
import { createTempoClient, callTool, disconnect } from '../../shared/client.js';
import type { CancelOrderResult, GetMyOrdersResult } from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printTable,
  formatAmount,
  confirm,
} from '../../shared/utils.js';

function printUsage() {
  console.log('Usage: npx tsx src/cancel-order.ts --id <order-id>');
  console.log('');
  console.log('Options:');
  console.log('  --id <order-id>  Order ID to cancel');
  console.log('  --all            Cancel all open orders');
  console.log('  --help           Show this help');
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx src/cancel-order.ts --id 12345');
  console.log('  npx tsx src/cancel-order.ts --all');
}

interface CancelArgs {
  orderId?: string;
  cancelAll: boolean;
}

function parseArgs(): CancelArgs | null {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return null;
  }

  let orderId: string | undefined;
  let cancelAll = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--id') {
      orderId = args[++i];
    } else if (arg === '--all') {
      cancelAll = true;
    }
  }

  if (!orderId && !cancelAll) {
    printError('Must specify --id <order-id> or --all');
    printUsage();
    return null;
  }

  return { orderId, cancelAll };
}

async function cancelSingleOrder(
  client: ReturnType<typeof createTempoClient> extends Promise<infer T> ? T : never,
  orderId: string
) {
  printInfo(`Cancelling order ${orderId}...`);

  const result = await callTool<CancelOrderResult>(client, 'cancel_order', {
    orderId,
  });

  if (!result.success) {
    printError(`Cancel failed: ${result.error?.message}`);
    return false;
  }

  printSuccess(`Order ${orderId} cancelled!`);

  if (result.cancelledOrder) {
    printTable(
      ['Field', 'Value'],
      [
        ['Order ID', result.orderId ?? orderId],
        ['Side', result.cancelledOrder.side.toUpperCase()],
        ['Original Amount', formatAmount(result.cancelledOrder.amount)],
        ['Filled', formatAmount(result.cancelledOrder.filled)],
        ['Price', `$${result.cancelledOrder.price}`],
        ['Refunded', formatAmount(result.refundedAmount ?? '0')],
        ['Transaction', result.transactionHash ?? 'N/A'],
        ['Block', result.blockNumber?.toString() ?? 'Pending'],
        ['Gas Cost', result.gasCost ?? 'N/A'],
      ]
    );
  }

  return true;
}

async function main() {
  const cancelArgs = parseArgs();
  if (!cancelArgs) {
    process.exit(0);
  }

  printHeader('Tempo DEX Cancel Order');

  const client = await createTempoClient();

  try {
    if (cancelArgs.cancelAll) {
      // Get all open orders first
      printInfo('Fetching open orders...');
      const ordersResult = await callTool<GetMyOrdersResult>(client, 'get_my_orders', {
        status: 'open',
      });

      if (ordersResult.orders.length === 0) {
        printInfo('No open orders to cancel.');
        return;
      }

      console.log('');
      console.log(`Found ${ordersResult.orders.length} open order(s):`);
      printTable(
        ['ID', 'Token', 'Side', 'Amount', 'Price'],
        ordersResult.orders.map((order) => [
          order.orderId,
          order.tokenSymbol,
          order.side.toUpperCase(),
          formatAmount(order.amount),
          `$${order.price}`,
        ])
      );
      console.log('');

      const shouldProceed = await confirm('Cancel ALL these orders?');
      if (!shouldProceed) {
        printInfo('Cancelled');
        return;
      }

      // Cancel each order
      let successCount = 0;
      let failCount = 0;

      for (const order of ordersResult.orders) {
        console.log('');
        const success = await cancelSingleOrder(client, order.orderId);
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      }

      console.log('');
      console.log(`Cancelled: ${successCount}, Failed: ${failCount}`);
    } else if (cancelArgs.orderId) {
      // Cancel single order
      const shouldProceed = await confirm(`Cancel order ${cancelArgs.orderId}?`);
      if (!shouldProceed) {
        printInfo('Cancelled');
        return;
      }

      await cancelSingleOrder(client, cancelArgs.orderId);
    }
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

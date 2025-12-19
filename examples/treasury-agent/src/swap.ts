/**
 * Token Swap
 *
 * Swap between stablecoins on Tempo DEX.
 *
 * Usage:
 *   npx tsx src/swap.ts <from> <to> <amount>
 *   npx tsx src/swap.ts AlphaUSD AlphaEUR 1000
 *   npx tsx src/swap.ts AlphaEUR AlphaUSD 500 --slippage 0.3
 */

import 'dotenv/config';
import { createTempoClient, callTool, disconnect } from '../../shared/client.js';
import type { SwapQuoteResult, SwapResult, BalanceResult } from '../../shared/types.js';
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
  console.log('Usage: npx tsx src/swap.ts <from-token> <to-token> <amount> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --slippage <pct>  Max slippage tolerance (default: 0.5%)');
  console.log('  --quote-only      Get quote without executing');
  console.log('  --help            Show this help');
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx src/swap.ts AlphaUSD AlphaEUR 1000');
  console.log('  npx tsx src/swap.ts AlphaEUR AlphaUSD 500 --slippage 0.3');
  console.log('  npx tsx src/swap.ts AlphaUSD AlphaGBP 2000 --quote-only');
}

interface SwapArgs {
  fromToken: string;
  toToken: string;
  amount: string;
  slippage: number;
  quoteOnly: boolean;
}

function parseArgs(): SwapArgs | null {
  const args = process.argv.slice(2);

  if (
    args.length < 3 ||
    args.includes('--help') ||
    args.includes('-h')
  ) {
    printUsage();
    return null;
  }

  const fromToken = args[0];
  const toToken = args[1];
  const amount = args[2];
  let slippage = parseFloat(process.env.TREASURY_MAX_SLIPPAGE ?? '0.5');
  let quoteOnly = false;

  for (let i = 3; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--slippage' || arg === '-s') {
      slippage = parseFloat(args[++i]);
    } else if (arg === '--quote-only' || arg === '-q') {
      quoteOnly = true;
    }
  }

  return { fromToken, toToken, amount, slippage, quoteOnly };
}

async function main() {
  const swapArgs = parseArgs();
  if (!swapArgs) {
    process.exit(0);
  }

  const { fromToken, toToken, amount, slippage, quoteOnly } = swapArgs;

  printHeader('Tempo Token Swap');

  const client = await createTempoClient();

  try {
    // Check balance
    printInfo('Checking balance...');
    const balance = await callTool<BalanceResult>(client, 'get_balance', {
      token: fromToken,
    });

    const balanceNum = parseFloat(balance.balance);
    const amountNum = parseFloat(amount);

    if (balanceNum < amountNum) {
      printError(`Insufficient ${fromToken} balance`);
      console.log(`Have: ${formatAmount(balance.balance)} ${balance.tokenSymbol}`);
      console.log(`Need: ${formatAmount(amount)} ${fromToken}`);
      process.exit(1);
    }

    // Get quote
    printInfo('Fetching swap quote...');
    const quote = await callTool<SwapQuoteResult>(client, 'get_swap_quote', {
      fromToken,
      toToken,
      amount,
    });

    // Display quote
    console.log('\nSwap Quote:');
    printTable(
      ['Field', 'Value'],
      [
        ['From', `${formatAmount(quote.amountIn)} ${quote.fromTokenSymbol}`],
        ['To', `${formatAmount(quote.amountOut)} ${quote.toTokenSymbol}`],
        ['Rate', `1 ${quote.fromTokenSymbol} = ${quote.rate} ${quote.toTokenSymbol}`],
        ['Inverse', `1 ${quote.toTokenSymbol} = ${quote.inverseRate} ${quote.fromTokenSymbol}`],
        ['Valid For', `${quote.validFor} seconds`],
        ['Max Slippage', `${slippage}%`],
      ]
    );

    // Balance after swap estimate
    const newFromBalance = balanceNum - amountNum;
    console.log(`\n${fromToken} Balance After: ${formatAmount(newFromBalance)}`);

    if (quoteOnly) {
      printInfo('Quote-only mode. Use without --quote-only to execute.');
      return;
    }

    // Confirm swap
    const shouldProceed = await confirm(
      `\nSwap ${formatAmount(amount)} ${fromToken} for ~${formatAmount(quote.amountOut)} ${toToken}?`
    );

    if (!shouldProceed) {
      printInfo('Swap cancelled');
      return;
    }

    // Execute swap
    printInfo('Executing swap...');
    const result = await callTool<SwapResult>(client, 'swap_stablecoins', {
      fromToken,
      toToken,
      amount,
      slippageTolerance: slippage,
    });

    if (!result.success) {
      printError(`Swap failed: ${result.error?.message}`);
      process.exit(1);
    }

    printSuccess('Swap completed!');
    printTable(
      ['Field', 'Value'],
      [
        ['Transaction', result.transactionHash ?? 'N/A'],
        ['Block', result.blockNumber?.toString() ?? 'Pending'],
        ['Sold', `${formatAmount(result.amountIn ?? '0')} ${result.fromTokenSymbol}`],
        ['Received', `${formatAmount(result.amountOut ?? '0')} ${result.toTokenSymbol}`],
        ['Effective Rate', result.effectiveRate ?? 'N/A'],
        ['Actual Slippage', result.slippage ?? 'N/A'],
        ['Gas Cost', result.gasCost ?? 'N/A'],
      ]
    );

    if (result.explorerUrl) {
      console.log(`\nExplorer: ${result.explorerUrl}`);
    }
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

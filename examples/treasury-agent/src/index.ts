/**
 * Treasury Agent
 *
 * Multi-token treasury management CLI.
 *
 * Usage:
 *   npx tsx src/index.ts                   # Show portfolio summary
 *   npx tsx src/index.ts --check-drift     # Check allocation drift
 *   npx tsx src/index.ts --rebalance       # Interactive rebalancing
 */

import 'dotenv/config';
import { createTempoClient, callTool, disconnect } from '../../shared/client.js';
import type { BalancesResult, SwapQuoteResult } from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printTable,
  printDivider,
  formatAmount,
  formatPercent,
  promptInput,
  confirm,
} from '../../shared/utils.js';

// Approximate exchange rates to USD
const USD_RATES: Record<string, number> = {
  AlphaUSD: 1.0,
  AUSD: 1.0,
  AlphaEUR: 1.08,
  AEUR: 1.08,
  AlphaGBP: 1.27,
  AGBP: 1.27,
};

interface TargetAllocation {
  token: string;
  target: number;
}

function getDefaultTokens(): string[] {
  const tokens = process.env.TREASURY_TOKENS;
  if (tokens) {
    return tokens.split(',').map((t) => t.trim());
  }
  return ['AlphaUSD'];
}

function getTargetAllocations(): TargetAllocation[] {
  const targets: TargetAllocation[] = [];

  const usdTarget = parseFloat(process.env.TREASURY_TARGET_USD ?? '0');
  const eurTarget = parseFloat(process.env.TREASURY_TARGET_EUR ?? '0');
  const gbpTarget = parseFloat(process.env.TREASURY_TARGET_GBP ?? '0');

  if (usdTarget > 0) targets.push({ token: 'AlphaUSD', target: usdTarget });
  if (eurTarget > 0) targets.push({ token: 'AlphaEUR', target: eurTarget });
  if (gbpTarget > 0) targets.push({ token: 'AlphaGBP', target: gbpTarget });

  return targets;
}

function printUsage() {
  console.log('Usage: npx tsx src/index.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --check-drift     Check allocation drift against targets');
  console.log('  --rebalance       Interactive rebalancing mode');
  console.log('  --swap            Interactive swap mode');
  console.log('  --help            Show this help');
  console.log('');
  console.log('Individual Commands:');
  console.log('  npx tsx src/portfolio.ts       # View portfolio');
  console.log('  npx tsx src/swap.ts            # Execute swap');
  console.log('  npx tsx src/rebalance.ts       # Auto-rebalance');
}

interface CliArgs {
  checkDrift: boolean;
  rebalance: boolean;
  swap: boolean;
}

function parseArgs(): CliArgs | null {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return null;
  }

  return {
    checkDrift: args.includes('--check-drift'),
    rebalance: args.includes('--rebalance'),
    swap: args.includes('--swap'),
  };
}

async function showPortfolioSummary(client: ReturnType<typeof createTempoClient> extends Promise<infer T> ? T : never) {
  const tokens = getDefaultTokens();
  const targets = getTargetAllocations();

  const balances = await callTool<BalancesResult>(client, 'get_balances', {
    tokens,
  });

  let totalValueUSD = 0;
  const items: Array<{
    symbol: string;
    balance: string;
    valueUSD: number;
    currentAlloc: number;
    targetAlloc: number;
  }> = [];

  for (const bal of balances.balances) {
    const rate = USD_RATES[bal.tokenSymbol] ?? 1.0;
    const value = parseFloat(bal.balance) * rate;
    totalValueUSD += value;

    const target = targets.find(
      (t) => t.token === bal.tokenSymbol || bal.tokenSymbol.includes(t.token.replace('Alpha', ''))
    );

    items.push({
      symbol: bal.tokenSymbol,
      balance: bal.balance,
      valueUSD: value,
      currentAlloc: 0,
      targetAlloc: target?.target ?? 0,
    });
  }

  // Calculate allocations
  for (const item of items) {
    item.currentAlloc = totalValueUSD > 0 ? (item.valueUSD / totalValueUSD) * 100 : 0;
  }

  // Sort by value
  items.sort((a, b) => b.valueUSD - a.valueUSD);

  console.log(`Total Portfolio Value: $${formatAmount(totalValueUSD)}\n`);

  printTable(
    ['Token', 'Balance', 'Value (USD)', 'Current', 'Target', 'Drift'],
    items.map((item) => {
      const drift = item.currentAlloc - item.targetAlloc;
      return [
        item.symbol,
        formatAmount(item.balance),
        `$${formatAmount(item.valueUSD)}`,
        formatPercent(item.currentAlloc),
        item.targetAlloc > 0 ? formatPercent(item.targetAlloc) : '-',
        item.targetAlloc > 0 ? `${drift >= 0 ? '+' : ''}${formatPercent(drift)}` : '-',
      ];
    })
  );

  return { items, totalValueUSD };
}

async function interactiveSwap(client: ReturnType<typeof createTempoClient> extends Promise<infer T> ? T : never) {
  printDivider();
  console.log('\nInteractive Swap\n');

  const fromToken = await promptInput('From token (e.g., AlphaUSD)');
  const toToken = await promptInput('To token (e.g., AlphaEUR)');
  const amount = await promptInput('Amount');

  if (!fromToken || !toToken || !amount) {
    printError('All fields are required');
    return;
  }

  printInfo('Fetching quote...');
  const quote = await callTool<SwapQuoteResult>(client, 'get_swap_quote', {
    fromToken,
    toToken,
    amount,
  });

  console.log('\nQuote:');
  console.log(`  ${formatAmount(quote.amountIn)} ${quote.fromTokenSymbol}`);
  console.log(`  → ${formatAmount(quote.amountOut)} ${quote.toTokenSymbol}`);
  console.log(`  Rate: ${quote.rate}`);

  const shouldProceed = await confirm('Execute this swap?');
  if (!shouldProceed) {
    printInfo('Swap cancelled');
    return;
  }

  printInfo('Executing swap...');
  const result = await callTool<{
    success: boolean;
    transactionHash?: string;
    amountIn?: string;
    amountOut?: string;
    error?: { message: string };
  }>(client, 'swap_stablecoins', {
    fromToken,
    toToken,
    amount,
  });

  if (!result.success) {
    printError(`Swap failed: ${result.error?.message}`);
    return;
  }

  printSuccess('Swap complete!');
  console.log(`Transaction: ${result.transactionHash}`);
  console.log(`Received: ${result.amountOut} ${toToken}`);
}

async function main() {
  const cliArgs = parseArgs();
  if (!cliArgs) {
    process.exit(0);
  }

  printHeader('Tempo Treasury Agent');

  const client = await createTempoClient();

  try {
    // Always show portfolio summary
    printInfo('Loading portfolio...\n');
    const { items, totalValueUSD } = await showPortfolioSummary(client);

    if (cliArgs.checkDrift) {
      printDivider();
      console.log('\nDrift Analysis:\n');

      const threshold = parseFloat(process.env.TREASURY_DRIFT_THRESHOLD ?? '5');
      const hasSignificantDrift = items.some(
        (item) => item.targetAlloc > 0 && Math.abs(item.currentAlloc - item.targetAlloc) > threshold
      );

      if (hasSignificantDrift) {
        printWarning(`Portfolio drift exceeds ${threshold}% threshold`);

        const drifted = items.filter(
          (item) => item.targetAlloc > 0 && Math.abs(item.currentAlloc - item.targetAlloc) > threshold
        );

        for (const item of drifted) {
          const drift = item.currentAlloc - item.targetAlloc;
          console.log(
            `  ${item.symbol}: ${drift > 0 ? 'Overweight' : 'Underweight'} by ${formatPercent(Math.abs(drift))}`
          );
        }

        printInfo('Run with --rebalance for interactive rebalancing');
      } else {
        printSuccess(`Portfolio is balanced (all drift < ${threshold}%)`);
      }
    }

    if (cliArgs.rebalance) {
      printDivider();
      console.log('\nRebalancing Mode\n');
      printInfo('Run: npx tsx src/rebalance.ts --execute');
      printInfo('Or use interactive swap below:');
      await interactiveSwap(client);
    }

    if (cliArgs.swap) {
      await interactiveSwap(client);
    }

    if (!cliArgs.checkDrift && !cliArgs.rebalance && !cliArgs.swap) {
      printDivider();
      console.log('\nAvailable Actions:');
      console.log('  --check-drift   Check allocation drift');
      console.log('  --rebalance     Interactive rebalancing');
      console.log('  --swap          Interactive token swap');
    }
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

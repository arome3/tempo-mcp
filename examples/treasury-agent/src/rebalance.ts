/**
 * Portfolio Rebalancing
 *
 * Detect drift from target allocation and suggest/execute rebalancing swaps.
 *
 * Usage:
 *   npx tsx src/rebalance.ts                  # Check drift
 *   npx tsx src/rebalance.ts --execute        # Execute rebalancing
 */

import 'dotenv/config';
import { createTempoClient, callTool, disconnect } from '../../shared/client.js';
import type { BalancesResult, SwapQuoteResult, SwapResult } from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printTable,
  formatAmount,
  formatPercent,
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

interface PortfolioItem {
  token: string;
  symbol: string;
  balance: number;
  valueUSD: number;
  currentAlloc: number;
  targetAlloc: number;
  drift: number;
}

interface RebalanceAction {
  type: 'sell' | 'buy';
  token: string;
  symbol: string;
  amountUSD: number;
}

function getTargetAllocations(): TargetAllocation[] {
  // Read from environment or use defaults
  const targets: TargetAllocation[] = [];

  const usdTarget = parseFloat(process.env.TREASURY_TARGET_USD ?? '60');
  const eurTarget = parseFloat(process.env.TREASURY_TARGET_EUR ?? '25');
  const gbpTarget = parseFloat(process.env.TREASURY_TARGET_GBP ?? '15');

  if (usdTarget > 0) targets.push({ token: 'AlphaUSD', target: usdTarget });
  if (eurTarget > 0) targets.push({ token: 'AlphaEUR', target: eurTarget });
  if (gbpTarget > 0) targets.push({ token: 'AlphaGBP', target: gbpTarget });

  return targets;
}

function getDriftThreshold(): number {
  return parseFloat(process.env.TREASURY_DRIFT_THRESHOLD ?? '5');
}

function printUsage() {
  console.log('Usage: npx tsx src/rebalance.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --execute         Execute rebalancing trades');
  console.log('  --threshold <pct> Drift threshold to trigger rebalance (default: 5%)');
  console.log('  --help            Show this help');
  console.log('');
  console.log('Environment Variables:');
  console.log('  TREASURY_TARGET_USD   Target USD allocation %');
  console.log('  TREASURY_TARGET_EUR   Target EUR allocation %');
  console.log('  TREASURY_TARGET_GBP   Target GBP allocation %');
  console.log('  TREASURY_DRIFT_THRESHOLD   Drift % to trigger rebalance');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  let execute = false;
  let threshold = getDriftThreshold();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--execute' || arg === '-e') {
      execute = true;
    } else if (arg === '--threshold' || arg === '-t') {
      threshold = parseFloat(args[++i]);
    }
  }

  const targets = getTargetAllocations();
  if (targets.length === 0) {
    printError('No target allocations configured');
    console.log('Set TREASURY_TARGET_USD, TREASURY_TARGET_EUR, etc.');
    process.exit(1);
  }

  // Validate targets sum to 100
  const totalTarget = targets.reduce((sum, t) => sum + t.target, 0);
  if (Math.abs(totalTarget - 100) > 0.1) {
    printWarning(`Target allocations sum to ${totalTarget}%, not 100%`);
  }

  printHeader('Treasury Rebalancing');

  const client = await createTempoClient();

  try {
    // Fetch current balances
    printInfo('Fetching portfolio...');
    const tokens = targets.map((t) => t.token);
    const balances = await callTool<BalancesResult>(client, 'get_balances', {
      tokens,
    });

    // Calculate current portfolio
    const portfolio: PortfolioItem[] = [];
    let totalValueUSD = 0;

    for (const target of targets) {
      const bal = balances.balances.find(
        (b) => b.tokenSymbol === target.token || b.tokenName.includes(target.token.replace('Alpha', ''))
      );

      const balance = bal ? parseFloat(bal.balance) : 0;
      const rate = USD_RATES[target.token] ?? 1.0;
      const valueUSD = balance * rate;
      totalValueUSD += valueUSD;

      portfolio.push({
        token: target.token,
        symbol: bal?.tokenSymbol ?? target.token,
        balance,
        valueUSD,
        currentAlloc: 0,
        targetAlloc: target.target,
        drift: 0,
      });
    }

    // Calculate allocations and drift
    for (const item of portfolio) {
      item.currentAlloc = totalValueUSD > 0 ? (item.valueUSD / totalValueUSD) * 100 : 0;
      item.drift = item.currentAlloc - item.targetAlloc;
    }

    // Display current state
    console.log(`\nPortfolio Value: $${formatAmount(totalValueUSD)}\n`);

    printTable(
      ['Token', 'Balance', 'Value', 'Current', 'Target', 'Drift'],
      portfolio.map((item) => [
        item.symbol,
        formatAmount(item.balance),
        `$${formatAmount(item.valueUSD)}`,
        formatPercent(item.currentAlloc),
        formatPercent(item.targetAlloc),
        `${item.drift >= 0 ? '+' : ''}${formatPercent(item.drift)}`,
      ])
    );

    // Check if rebalancing is needed
    const needsRebalance = portfolio.some((p) => Math.abs(p.drift) > threshold);

    if (!needsRebalance) {
      printSuccess(`Portfolio is balanced (drift < ${threshold}%)`);
      return;
    }

    printWarning(`Portfolio drift exceeds ${threshold}% threshold`);

    // Calculate rebalancing actions
    const overweight = portfolio.filter((p) => p.drift > threshold);
    const underweight = portfolio.filter((p) => p.drift < -threshold);

    console.log('\nRebalancing Actions:');

    // For simplicity, swap overweight tokens to underweight tokens
    // In a real implementation, this would be more sophisticated
    const actions: Array<{
      fromToken: string;
      toToken: string;
      amountUSD: number;
    }> = [];

    for (const over of overweight) {
      for (const under of underweight) {
        // Calculate how much to move
        const overExcess = (over.drift / 100) * totalValueUSD;
        const underDeficit = Math.abs((under.drift / 100) * totalValueUSD);
        const amountToMove = Math.min(overExcess, underDeficit);

        if (amountToMove > 10) {
          // Minimum $10 swap
          actions.push({
            fromToken: over.token,
            toToken: under.token,
            amountUSD: amountToMove,
          });
        }
      }
    }

    if (actions.length === 0) {
      printInfo('No significant rebalancing actions needed');
      return;
    }

    printTable(
      ['Action', 'From', 'To', 'Amount (USD)'],
      actions.map((a, i) => [
        `Trade ${i + 1}`,
        a.fromToken,
        a.toToken,
        `$${formatAmount(a.amountUSD)}`,
      ])
    );

    if (!execute) {
      printInfo('Use --execute to perform these trades');
      return;
    }

    // Execute rebalancing
    const shouldProceed = await confirm(
      `\nExecute ${actions.length} rebalancing trade(s)?`
    );

    if (!shouldProceed) {
      printInfo('Rebalancing cancelled');
      return;
    }

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const fromRate = USD_RATES[action.fromToken] ?? 1.0;
      const amount = (action.amountUSD / fromRate).toFixed(2);

      printInfo(`Executing trade ${i + 1}/${actions.length}...`);

      // Get quote
      const quote = await callTool<SwapQuoteResult>(client, 'get_swap_quote', {
        fromToken: action.fromToken,
        toToken: action.toToken,
        amount,
      });

      console.log(
        `  Swap ${formatAmount(amount)} ${action.fromToken} → ~${formatAmount(quote.amountOut)} ${action.toToken}`
      );

      // Execute swap
      const result = await callTool<SwapResult>(client, 'swap_stablecoins', {
        fromToken: action.fromToken,
        toToken: action.toToken,
        amount,
        slippageTolerance: parseFloat(process.env.TREASURY_MAX_SLIPPAGE ?? '0.5'),
      });

      if (!result.success) {
        printError(`Trade ${i + 1} failed: ${result.error?.message}`);
        continue;
      }

      printSuccess(`Trade ${i + 1} complete: ${result.transactionHash}`);
    }

    printSuccess('Rebalancing complete!');

    // Show new portfolio
    printInfo('Fetching updated portfolio...');
    const newBalances = await callTool<BalancesResult>(client, 'get_balances', {
      tokens,
    });

    let newTotal = 0;
    for (const bal of newBalances.balances) {
      const rate = USD_RATES[bal.tokenSymbol] ?? 1.0;
      newTotal += parseFloat(bal.balance) * rate;
    }

    console.log('\nUpdated Portfolio:');
    printTable(
      ['Token', 'Balance', 'Value', 'Allocation'],
      newBalances.balances.map((bal) => {
        const rate = USD_RATES[bal.tokenSymbol] ?? 1.0;
        const value = parseFloat(bal.balance) * rate;
        const alloc = newTotal > 0 ? (value / newTotal) * 100 : 0;
        return [
          bal.tokenSymbol,
          formatAmount(bal.balance),
          `$${formatAmount(value)}`,
          formatPercent(alloc),
        ];
      })
    );
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

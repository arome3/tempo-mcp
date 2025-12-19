/**
 * Portfolio View
 *
 * Display multi-token treasury portfolio with allocations.
 *
 * Usage:
 *   npx tsx src/portfolio.ts
 *   npx tsx src/portfolio.ts --tokens AlphaUSD,AlphaEUR,AlphaGBP
 */

import 'dotenv/config';
import { createTempoClient, callTool, disconnect } from '../../shared/client.js';
import type { BalancesResult } from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printTable,
  formatAmount,
  formatPercent,
  truncateAddress,
} from '../../shared/utils.js';

// Approximate exchange rates to USD (for demo purposes)
const USD_RATES: Record<string, number> = {
  AlphaUSD: 1.0,
  AUSD: 1.0,
  AlphaEUR: 1.08,
  AEUR: 1.08,
  AlphaGBP: 1.27,
  AGBP: 1.27,
};

interface PortfolioItem {
  token: string;
  symbol: string;
  balance: string;
  valueUSD: number;
  allocation: number;
}

function getDefaultTokens(): string[] {
  const tokens = process.env.TREASURY_TOKENS;
  if (tokens) {
    return tokens.split(',').map((t) => t.trim());
  }
  return ['AlphaUSD'];
}

function printUsage() {
  console.log('Usage: npx tsx src/portfolio.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --tokens <list>   Comma-separated token symbols');
  console.log('  --address <addr>  Wallet address to check');
  console.log('  --help            Show this help');
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx src/portfolio.ts');
  console.log('  npx tsx src/portfolio.ts --tokens AlphaUSD,AlphaEUR');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  let tokens = getDefaultTokens();
  let address: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--tokens' || arg === '-t') {
      tokens = args[++i].split(',').map((t) => t.trim());
    } else if (arg === '--address' || arg === '-a') {
      address = args[++i];
    }
  }

  printHeader('Treasury Portfolio');

  // Connect and fetch balances
  const client = await createTempoClient();

  try {
    const result = await callTool<BalancesResult>(client, 'get_balances', {
      tokens,
      address,
    });

    console.log(`Wallet: ${truncateAddress(result.address)}\n`);

    // Calculate portfolio values
    const portfolio: PortfolioItem[] = [];
    let totalValueUSD = 0;

    for (const bal of result.balances) {
      const rate = USD_RATES[bal.tokenSymbol] ?? 1.0;
      const balanceNum = parseFloat(bal.balance);
      const valueUSD = balanceNum * rate;
      totalValueUSD += valueUSD;

      portfolio.push({
        token: bal.tokenName,
        symbol: bal.tokenSymbol,
        balance: bal.balance,
        valueUSD,
        allocation: 0, // Calculate after totaling
      });
    }

    // Calculate allocations
    for (const item of portfolio) {
      item.allocation = totalValueUSD > 0 ? (item.valueUSD / totalValueUSD) * 100 : 0;
    }

    // Sort by value
    portfolio.sort((a, b) => b.valueUSD - a.valueUSD);

    // Display table
    printTable(
      ['Token', 'Symbol', 'Balance', 'Value (USD)', 'Allocation'],
      portfolio.map((item) => [
        item.token,
        item.symbol,
        formatAmount(item.balance),
        `$${formatAmount(item.valueUSD)}`,
        formatPercent(item.allocation),
      ])
    );

    // Total
    console.log('');
    console.log(`Total Portfolio Value: $${formatAmount(totalValueUSD)}`);

    // Visual allocation bar
    console.log('\nAllocation:');
    for (const item of portfolio) {
      const barLength = Math.round(item.allocation / 2);
      const bar = '█'.repeat(barLength);
      console.log(`  ${item.symbol.padEnd(10)} ${bar} ${formatPercent(item.allocation)}`);
    }

    printSuccess('Portfolio loaded successfully');
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

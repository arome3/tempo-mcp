/**
 * Check Balance Script
 *
 * Standalone script to check token balances.
 *
 * Usage:
 *   npx tsx src/check-balance.ts                    # Check default token
 *   npx tsx src/check-balance.ts AlphaUSD           # Check specific token
 *   npx tsx src/check-balance.ts --all              # Check all configured tokens
 *   npx tsx src/check-balance.ts --address 0x...    # Check specific address
 */

import 'dotenv/config';
import {
  createTempoClient,
  callTool,
  disconnect,
} from '../../shared/client.js';
import type { BalanceResult, BalancesResult } from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printTable,
  formatAmount,
  isValidAddress,
} from '../../shared/utils.js';

// Parse command line arguments
function parseArgs(): {
  token?: string;
  address?: string;
  all: boolean;
} {
  const args = process.argv.slice(2);
  let token: string | undefined;
  let address: string | undefined;
  let all = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all' || arg === '-a') {
      all = true;
    } else if (arg === '--address' || arg === '-addr') {
      address = args[++i];
    } else if (!arg.startsWith('-')) {
      token = arg;
    }
  }

  return { token, address, all };
}

async function main() {
  const { token, address, all } = parseArgs();

  // Validate address if provided
  if (address && !isValidAddress(address)) {
    printError(`Invalid address format: ${address}`);
    console.log('Address must be 0x-prefixed 40-character hex string');
    process.exit(1);
  }

  printHeader('Tempo Balance Check');

  const client = await createTempoClient();

  try {
    if (all) {
      // Get all token balances
      const result = await callTool<BalancesResult>(client, 'get_balances', {
        address,
      });

      console.log(`Address: ${result.address}\n`);

      if (result.balances.length === 0) {
        console.log('No token balances found.');
        return;
      }

      printTable(
        ['Token', 'Symbol', 'Balance', 'Decimals'],
        result.balances.map((b) => [
          b.tokenName,
          b.tokenSymbol,
          formatAmount(b.balance),
          b.decimals.toString(),
        ])
      );
    } else {
      // Get single token balance
      const tokenToCheck = token ?? process.env.TEMPO_DEFAULT_TOKEN ?? 'AlphaUSD';

      const result = await callTool<BalanceResult>(client, 'get_balance', {
        token: tokenToCheck,
        address,
      });

      console.log(`Token: ${result.tokenName} (${result.tokenSymbol})`);
      console.log(`Address: ${result.address}`);
      console.log(`Balance: ${formatAmount(result.balance)} ${result.tokenSymbol}`);
      console.log(`Raw: ${result.balanceRaw} (${result.decimals} decimals)`);
    }

    printSuccess('Balance check complete');
  } catch (error) {
    printError(`Failed to check balance: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

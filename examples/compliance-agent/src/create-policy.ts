/**
 * Create TIP-403 Compliance Policy
 *
 * Create a new whitelist or blacklist policy for transfer compliance.
 * The caller becomes the policy admin who can manage the policy entries.
 *
 * Usage:
 *   npx tsx src/create-policy.ts whitelist
 *   npx tsx src/create-policy.ts blacklist
 *   npx tsx src/create-policy.ts whitelist --accounts 0xABC...123 0xDEF...456
 *
 * Example:
 *   npx tsx src/create-policy.ts whitelist --accounts 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb
 */

import 'dotenv/config';
import {
  createTempoClient,
  callTool,
  disconnect,
} from '../../shared/client.js';
import type { CreatePolicyResult } from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printTable,
  truncateAddress,
  confirm,
} from '../../shared/utils.js';

type PolicyType = 'whitelist' | 'blacklist';

function printUsage(): void {
  console.log('Create Policy Tool');
  console.log('');
  console.log('Usage:');
  console.log('  npx tsx src/create-policy.ts <policyType> [--accounts <addr1> <addr2>...]');
  console.log('');
  console.log('Policy Types:');
  console.log('  whitelist   Only approved addresses can send/receive tokens');
  console.log('  blacklist   All addresses can transact except blocked ones');
  console.log('');
  console.log('Options:');
  console.log('  --accounts  Initial addresses to add to the policy (optional)');
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx src/create-policy.ts whitelist');
  console.log('  npx tsx src/create-policy.ts blacklist --accounts 0xABC...123');
  console.log('  npx tsx src/create-policy.ts whitelist --accounts 0xABC...123 0xDEF...456');
}

function parseArgs(args: string[]): {
  policyType: PolicyType;
  initialAccounts: string[];
} | null {
  if (args.length < 1) {
    return null;
  }

  const policyType = args[0] as PolicyType;
  if (!['whitelist', 'blacklist'].includes(policyType)) {
    return null;
  }

  const initialAccounts: string[] = [];
  const accountsIndex = args.indexOf('--accounts');
  if (accountsIndex !== -1) {
    // Collect all addresses after --accounts
    for (let i = accountsIndex + 1; i < args.length; i++) {
      const addr = args[i];
      if (addr.startsWith('--')) break;
      if (addr.match(/^0x[a-fA-F0-9]{40}$/)) {
        initialAccounts.push(addr);
      } else {
        printError(`Invalid address format: ${addr}`);
        return null;
      }
    }
  }

  return { policyType, initialAccounts };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const parsed = parseArgs(args);
  if (!parsed) {
    printError('Invalid arguments');
    printUsage();
    process.exit(1);
  }

  const { policyType, initialAccounts } = parsed;

  printHeader(`Create ${policyType.toUpperCase()} Policy`);

  console.log('Configuration:');
  console.log(`  Policy Type: ${policyType}`);
  if (initialAccounts.length > 0) {
    console.log(`  Initial Accounts: ${initialAccounts.length}`);
    initialAccounts.forEach((addr, i) => {
      console.log(`    ${i + 1}. ${truncateAddress(addr)}`);
    });
  } else {
    console.log('  Initial Accounts: None (empty policy)');
  }
  console.log('');

  // Explain policy implications
  if (policyType === 'whitelist') {
    printInfo('Whitelist Policy: Only addresses you add will be able to transact.');
  } else {
    printInfo('Blacklist Policy: All addresses can transact except those you block.');
  }
  console.log('');

  // Confirm action
  const shouldProceed = await confirm('Create this policy?');
  if (!shouldProceed) {
    printInfo('Cancelled by user');
    process.exit(0);
  }

  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();

  try {
    printInfo('Creating policy on-chain...');

    const toolArgs: {
      policyType: PolicyType;
      initialAccounts?: string[];
    } = { policyType };

    if (initialAccounts.length > 0) {
      toolArgs.initialAccounts = initialAccounts;
    }

    const result = await callTool<CreatePolicyResult>(
      client,
      'create_policy',
      toolArgs
    );

    if (result.success) {
      printSuccess('Policy created successfully!');
      console.log('');

      printTable(
        ['Field', 'Value'],
        [
          ['Policy ID', result.policyId?.toString() ?? 'N/A'],
          ['Policy Type', result.policyType ?? policyType],
          ['Admin', truncateAddress(result.admin ?? '')],
          ['Transaction', truncateAddress(result.transactionHash ?? '', 8)],
          ['Block', result.blockNumber?.toString() ?? 'N/A'],
          ['Gas Cost', result.gasCost ?? 'N/A'],
        ]
      );

      console.log(`\nExplorer: ${result.explorerUrl}`);

      console.log('\nNext Steps:');
      if (policyType === 'whitelist') {
        console.log(`  - Add addresses: npm run whitelist -- add ${result.policyId} <address>`);
        console.log(`  - Check status:  npm run whitelist -- check ${result.policyId} <address>`);
      } else {
        console.log(`  - Block address: npm run blacklist -- add ${result.policyId} <address>`);
        console.log(`  - Check status:  npm run blacklist -- check ${result.policyId} <address>`);
      }
      console.log(`  - View policy:   Get policy info with policyId ${result.policyId}`);
    } else {
      printError(`Failed to create policy: ${result.error?.message}`);
      if (result.error?.details?.suggestion) {
        console.log(`Suggestion: ${result.error.details.suggestion}`);
      }
      process.exit(1);
    }
  } catch (error) {
    printError(`Operation failed: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

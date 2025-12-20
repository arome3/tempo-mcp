/**
 * Check Transfer Compliance
 *
 * Validates whether a transfer between two addresses would be
 * allowed under the token's TIP-403 policy.
 *
 * Usage:
 *   npx tsx src/check-compliance.ts <token> <from> <to>
 *
 * Example:
 *   npx tsx src/check-compliance.ts 0x20c0...001 0xABC...123 0xDEF...456
 */

import 'dotenv/config';
import {
  createTempoClient,
  callTool,
  disconnect,
} from '../../shared/client.js';
import type {
  CheckTransferComplianceResult,
  IsWhitelistedResult,
  IsBlacklistedResult,
} from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printTable,
  truncateAddress,
} from '../../shared/utils.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Usage: npx tsx src/check-compliance.ts <token> <from> <to>');
    console.log('');
    console.log('Example:');
    console.log(
      '  npx tsx src/check-compliance.ts 0x20c0000000000000000000000000000000000001 0xABC...123 0xDEF...456'
    );
    process.exit(1);
  }

  const [token, from, to] = args;

  printHeader('Transfer Compliance Check');

  console.log('Checking compliance for:');
  console.log(`  Token: ${truncateAddress(token)}`);
  console.log(`  From:  ${truncateAddress(from)}`);
  console.log(`  To:    ${truncateAddress(to)}\n`);

  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();

  try {
    // Check transfer compliance
    const compliance = await callTool<CheckTransferComplianceResult>(
      client,
      'check_transfer_compliance',
      { token, from, to }
    );

    printHeader('Compliance Result');

    printTable(
      ['Field', 'Value'],
      [
        ['Transfer Allowed', compliance.allowed ? 'YES' : 'NO'],
        ['Policy Type', compliance.policyType],
        ['Policy ID', compliance.policyId?.toString() ?? 'None'],
        ['Reason', compliance.reason ?? 'N/A'],
      ]
    );

    printHeader('Sender Status');
    printTable(
      ['Field', 'Value'],
      [
        ['Address', truncateAddress(compliance.from)],
        ['Whitelisted', compliance.fromStatus.isWhitelisted ? 'YES' : 'NO'],
        ['Blacklisted', compliance.fromStatus.isBlacklisted ? 'YES' : 'NO'],
      ]
    );

    printHeader('Recipient Status');
    printTable(
      ['Field', 'Value'],
      [
        ['Address', truncateAddress(compliance.to)],
        ['Whitelisted', compliance.toStatus.isWhitelisted ? 'YES' : 'NO'],
        ['Blacklisted', compliance.toStatus.isBlacklisted ? 'YES' : 'NO'],
      ]
    );

    // Final verdict
    printHeader('Verdict');
    if (compliance.allowed) {
      printSuccess('Transfer is ALLOWED by policy');
    } else {
      printError('Transfer is BLOCKED by policy');
      if (compliance.reason) {
        console.log(`Reason: ${compliance.reason}`);
      }
    }
  } catch (error) {
    printError(`Compliance check failed: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

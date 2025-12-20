/**
 * Generate Compliance Report
 *
 * Generates a comprehensive compliance status report for multiple
 * addresses against a specific policy.
 *
 * Usage:
 *   npx tsx src/compliance-report.ts <policyId> <address1> [address2] [address3]...
 *
 * Example:
 *   npx tsx src/compliance-report.ts 1 0xABC...123 0xDEF...456 0x789...ABC
 */

import 'dotenv/config';
import {
  createTempoClient,
  callTool,
  disconnect,
} from '../../shared/client.js';
import type {
  GetPolicyInfoResult,
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

interface AddressStatus {
  address: string;
  isWhitelisted: boolean;
  isBlacklisted: boolean;
  status: 'COMPLIANT' | 'BLOCKED' | 'RESTRICTED';
}

function determineStatus(
  policyType: string,
  isWhitelisted: boolean,
  isBlacklisted: boolean
): 'COMPLIANT' | 'BLOCKED' | 'RESTRICTED' {
  if (isBlacklisted) {
    return 'BLOCKED';
  }

  if (policyType === 'whitelist') {
    return isWhitelisted ? 'COMPLIANT' : 'BLOCKED';
  }

  if (policyType === 'blacklist') {
    return isBlacklisted ? 'BLOCKED' : 'COMPLIANT';
  }

  // No policy (none)
  return 'COMPLIANT';
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npx tsx src/compliance-report.ts <policyId> <address1> [address2]...');
    console.log('');
    console.log('Example:');
    console.log(
      '  npx tsx src/compliance-report.ts 1 0xABC...123 0xDEF...456'
    );
    process.exit(1);
  }

  const policyId = parseInt(args[0], 10);
  const addresses = args.slice(1);

  if (isNaN(policyId) || policyId < 1) {
    printError(`Invalid policy ID: ${args[0]}`);
    process.exit(1);
  }

  printHeader('TIP-403 Compliance Report');
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(`Addresses to check: ${addresses.length}\n`);

  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();

  try {
    // Get policy information
    printHeader('1. Policy Information');

    let policyInfo: GetPolicyInfoResult;
    try {
      policyInfo = await callTool<GetPolicyInfoResult>(
        client,
        'get_policy_info',
        { policyId }
      );

      printTable(
        ['Field', 'Value'],
        [
          ['Policy ID', policyInfo.policyId.toString()],
          ['Type', policyInfo.policyType.toUpperCase()],
          ['Description', policyInfo.policyTypeDescription],
          ['Owner', truncateAddress(policyInfo.owner)],
          ['Tokens Using Policy', policyInfo.tokenCount.toString()],
        ]
      );
    } catch (error) {
      printError(`Could not fetch policy: ${(error as Error).message}`);
      process.exit(1);
    }

    // Check each address
    printHeader('2. Address Compliance Status');

    const statuses: AddressStatus[] = [];

    for (const address of addresses) {
      console.log(`Checking ${truncateAddress(address)}...`);

      try {
        const [whitelistResult, blacklistResult] = await Promise.all([
          callTool<IsWhitelistedResult>(client, 'is_whitelisted', {
            policyId,
            account: address,
          }),
          callTool<IsBlacklistedResult>(client, 'is_blacklisted', {
            policyId,
            account: address,
          }),
        ]);

        statuses.push({
          address,
          isWhitelisted: whitelistResult.isWhitelisted,
          isBlacklisted: blacklistResult.isBlacklisted,
          status: determineStatus(
            policyInfo.policyType,
            whitelistResult.isWhitelisted,
            blacklistResult.isBlacklisted
          ),
        });
      } catch (error) {
        console.log(`  Error: ${(error as Error).message}`);
        statuses.push({
          address,
          isWhitelisted: false,
          isBlacklisted: false,
          status: 'RESTRICTED',
        });
      }
    }

    // Display results
    printHeader('3. Compliance Matrix');

    const tableRows = statuses.map((s) => [
      truncateAddress(s.address),
      s.isWhitelisted ? 'YES' : 'NO',
      s.isBlacklisted ? 'YES' : 'NO',
      s.status,
    ]);

    printTable(
      ['Address', 'Whitelisted', 'Blacklisted', 'Status'],
      tableRows
    );

    // Summary
    printHeader('4. Summary');

    const compliant = statuses.filter((s) => s.status === 'COMPLIANT').length;
    const blocked = statuses.filter((s) => s.status === 'BLOCKED').length;
    const restricted = statuses.filter((s) => s.status === 'RESTRICTED').length;

    printTable(
      ['Category', 'Count', 'Percentage'],
      [
        ['COMPLIANT', compliant.toString(), `${((compliant / statuses.length) * 100).toFixed(1)}%`],
        ['BLOCKED', blocked.toString(), `${((blocked / statuses.length) * 100).toFixed(1)}%`],
        ['RESTRICTED', restricted.toString(), `${((restricted / statuses.length) * 100).toFixed(1)}%`],
        ['TOTAL', statuses.length.toString(), '100%'],
      ]
    );

    // Recommendations
    printHeader('5. Recommendations');

    if (blocked > 0) {
      printError(`${blocked} address(es) are blocked from transfers`);
      console.log('Consider:');
      console.log('  - Adding blocked addresses to whitelist (if appropriate)');
      console.log('  - Reviewing why addresses are not compliant');
    }

    if (policyInfo.policyType === 'whitelist' && compliant < statuses.length) {
      printInfo('This is a whitelist policy - only whitelisted addresses can transact');
      console.log('To enable transfers, add addresses to whitelist:');
      console.log('  npx tsx src/manage-whitelist.ts add <policyId> <address>');
    }

    if (compliant === statuses.length) {
      printSuccess('All addresses are compliant with the policy');
    }

    printHeader('Report Complete');
    console.log(`Report generated at: ${new Date().toISOString()}`);
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

/**
 * Role Management Example
 *
 * Demonstrates the role management workflow for TIP-20 tokens:
 * 1. Check if an address has a specific role
 * 2. List all members of a role
 * 3. Check token pause status
 *
 * Run with: npx tsx src/check-roles.ts
 */

import 'dotenv/config';
import {
  createTempoClient,
  callTool,
  disconnect,
} from '../../shared/client.js';
import type {
  HasRoleResult,
  GetRoleMembersResult,
  RoleName,
} from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printTable,
  truncateAddress,
} from '../../shared/utils.js';

// Demo configuration
const DEMO_TOKEN = process.env.TEMPO_DEFAULT_TOKEN ?? 'AlphaUSD';
const DEMO_ADDRESS = process.env.TEMPO_WALLET_ADDRESS ?? '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb';

// All TIP-20 roles to check
const ROLES: RoleName[] = [
  'DEFAULT_ADMIN_ROLE',
  'ISSUER_ROLE',
  'PAUSE_ROLE',
  'UNPAUSE_ROLE',
  'BURN_BLOCKED_ROLE',
];

async function main() {
  printHeader('Tempo MCP - Role Management Demo');

  console.log('This demo will:');
  console.log('1. Connect to tempo-mcp server');
  console.log('2. Check role assignments for an address');
  console.log('3. List members of each role\n');

  // Connect to server
  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();
  printSuccess('Connected to tempo-mcp server');

  try {
    // Step 1: Check roles for the demo address
    printHeader('Step 1: Check Roles for Address');
    console.log(`Address: ${truncateAddress(DEMO_ADDRESS)}`);
    console.log(`Token: ${DEMO_TOKEN}\n`);

    const roleChecks: [string, boolean][] = [];

    for (const role of ROLES) {
      try {
        const result = await callTool<HasRoleResult>(client, 'has_role', {
          token: DEMO_TOKEN,
          role,
          account: DEMO_ADDRESS,
        });
        roleChecks.push([role, result.hasRole]);
      } catch (error) {
        roleChecks.push([role, false]);
      }
    }

    printTable(
      ['Role', 'Has Role'],
      roleChecks.map(([role, hasRole]) => [
        role,
        hasRole ? '✓ Yes' : '✗ No',
      ])
    );

    // Step 2: List members of each role
    printHeader('Step 2: Role Members');

    for (const role of ROLES) {
      console.log(`\n${role}:`);

      try {
        const result = await callTool<GetRoleMembersResult>(
          client,
          'get_role_members',
          {
            token: DEMO_TOKEN,
            role,
          }
        );

        if (result.memberCount === 0) {
          console.log('  No members assigned');
        } else {
          console.log(`  ${result.memberCount} member(s):`);
          for (const member of result.members) {
            console.log(`    - ${truncateAddress(member)}`);
          }
        }
      } catch (error) {
        console.log('  Unable to fetch members');
      }
    }

    // Step 3: Summary
    printHeader('Role Summary');

    const assignedRoles = roleChecks.filter(([, hasRole]) => hasRole);
    if (assignedRoles.length > 0) {
      printSuccess(`Address ${truncateAddress(DEMO_ADDRESS)} has ${assignedRoles.length} role(s):`);
      for (const [role] of assignedRoles) {
        console.log(`  - ${role}`);
      }
    } else {
      printInfo(`Address ${truncateAddress(DEMO_ADDRESS)} has no roles assigned`);
    }

    printSuccess('Demo completed successfully!');
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

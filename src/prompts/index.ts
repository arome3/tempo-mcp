/**
 * Prompt Registration
 *
 * Prompts are reusable templates for common AI interactions with
 * Tempo blockchain functionality. They provide pre-built conversation
 * starters that guide AI agents through specific workflows.
 *
 * Available prompts:
 * - payment-receipt: Generate formatted payment receipt
 * - reconciliation-report: Match transactions to invoices
 * - payroll-summary: Summarize batch payment results
 * - spending-report: Analyze spending by category/recipient
 * - role-audit: Audit TIP-20 token role assignments
 * - compliance-report: Generate TIP-403 compliance status report
 * - rewards-summary: Analyze rewards status across held tokens
 *
 */

import { server } from '../server.js';
import { z } from 'zod';

/**
 * Register all MCP prompts with the server.
 *
 * Includes example implementation to demonstrate the prompt pattern.
 */
export function registerAllPrompts(): void {
  // Example prompt: Payment receipt generator
  server.registerPrompt(
    'payment-receipt',
    {
      title: 'Payment Receipt',
      description:
        'Generate a formatted payment receipt for a Tempo transaction',
      argsSchema: {
        transactionHash: z
          .string()
          .describe('Transaction hash to generate receipt for'),
        format: z
          .enum(['markdown', 'json', 'text'])
          .optional()
          .default('markdown')
          .describe('Output format for the receipt'),
      },
    },
    ({ transactionHash, format }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a ${format ?? 'markdown'} formatted payment receipt for transaction ${transactionHash}.

Include the following information:
- Transaction ID and explorer link
- Date and time (formatted for readability)
- Sender and recipient addresses
- Amount and token symbol
- Memo (if present, decoded to human-readable format)
- Gas cost
- Confirmation status

For markdown format, use a clean table layout. For JSON, use structured data. For text, use a simple receipt format.`,
          },
        },
      ],
    })
  );

  // Reconciliation report prompt
  server.registerPrompt(
    'reconciliation-report',
    {
      title: 'Reconciliation Report',
      description:
        'Analyze transactions and match them to invoices based on memos',
      argsSchema: {
        address: z.string().describe('Address to analyze transactions for'),
        startDate: z
          .string()
          .optional()
          .describe('Start date (ISO 8601 format)'),
        endDate: z.string().optional().describe('End date (ISO 8601 format)'),
        invoicePattern: z
          .string()
          .optional()
          .describe('Regex pattern for invoice IDs (e.g., "INV-\\\\d{4}-\\\\d{4}")'),
      },
    },
    ({ address, startDate, endDate, invoicePattern }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a reconciliation report for address ${address}.

Parameters:
- Date range: ${startDate ?? 'beginning'} to ${endDate ?? 'now'}
- Invoice pattern: ${invoicePattern ?? 'any memo containing invoice-like identifiers'}

The report should:
1. List all incoming and outgoing transactions in the date range
2. Extract and decode memos from each transaction
3. Match memo patterns to potential invoice IDs
4. Categorize transactions as:
   - Matched: Memo matches invoice pattern
   - Unmatched: No memo or memo doesn't match pattern
   - Partial: Memo exists but unclear match
5. Provide summary statistics:
   - Total matched amount
   - Total unmatched amount
   - Number of transactions in each category

Format the output as a markdown report with tables.`,
          },
        },
      ],
    })
  );

  // Payroll summary prompt
  server.registerPrompt(
    'payroll-summary',
    {
      title: 'Payroll Summary',
      description: 'Generate a summary report for batch payment operations',
      argsSchema: {
        transactionHash: z
          .string()
          .describe('Batch transaction hash to summarize'),
        includeIndividual: z
          .boolean()
          .optional()
          .default(true)
          .describe('Include individual payment details'),
      },
    },
    ({ transactionHash, includeIndividual }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a payroll summary report for batch transaction ${transactionHash}.

${includeIndividual ? 'Include individual payment details.' : 'Show only aggregate totals.'}

The report should include:
1. Transaction overview:
   - Transaction hash and explorer link
   - Timestamp
   - Total amount disbursed
   - Number of recipients
   - Gas cost

${
  includeIndividual
    ? `2. Individual payments table:
   - Recipient address
   - Amount
   - Memo (if any)
   - Status`
    : ''
}

3. Summary statistics:
   - Total disbursed
   - Average payment amount
   - Largest/smallest payment
   - Gas cost per recipient

Format as a professional payroll report in markdown.`,
          },
        },
      ],
    })
  );

  // Spending analysis prompt
  server.registerPrompt(
    'spending-report',
    {
      title: 'Spending Report',
      description: 'Analyze spending patterns by category and recipient',
      argsSchema: {
        address: z.string().describe('Address to analyze spending for'),
        period: z
          .enum(['day', 'week', 'month', 'quarter', 'year'])
          .optional()
          .default('month')
          .describe('Analysis period'),
      },
    },
    ({ address, period }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a spending analysis report for address ${address} over the past ${period ?? 'month'}.

The report should analyze:
1. Total outgoing payments by token
2. Top recipients by volume
3. Transaction frequency over time
4. Average transaction size
5. Memo/category analysis (group by memo patterns if applicable)
6. Comparison to previous period (if data available)

Include charts/visualizations descriptions where helpful.
Format as a comprehensive spending report in markdown.`,
          },
        },
      ],
    })
  );

  // Role audit prompt
  server.registerPrompt(
    'role-audit',
    {
      title: 'Role Audit Report',
      description:
        'Generate a comprehensive audit report of TIP-20 token role assignments for security review',
      argsSchema: {
        token: z
          .string()
          .describe('TIP-20 token address to audit'),
        format: z
          .enum(['markdown', 'json'])
          .optional()
          .default('markdown')
          .describe('Output format for the report'),
      },
    },
    ({ token, format }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a ${format ?? 'markdown'} formatted role audit report for TIP-20 token at address ${token}.

First, use the tempo://token/${token}/roles resource or the get_role_members tool to fetch current role assignments.

The report should include:

## 1. Token Overview
- Token address and explorer link
- Token name and symbol (if available)
- Current pause status
- Report generation timestamp

## 2. Role Assignments

For each role (DEFAULT_ADMIN_ROLE, ISSUER_ROLE, PAUSE_ROLE, UNPAUSE_ROLE, BURN_BLOCKED_ROLE):
- List all addresses that have the role
- Count of role holders
- Whether the role is critical (admin, issuer, pause roles are critical)

Format as a table:
| Role | Members | Count | Risk Level |

## 3. Security Analysis

Analyze the role configuration and identify:
- Whether there's a backup admin (multiple DEFAULT_ADMIN_ROLE holders)
- Whether PAUSE_ROLE and UNPAUSE_ROLE are properly assigned for emergency response
- Any roles with no members assigned (potential governance gaps)
- Whether the same address holds multiple critical roles (concentration risk)

## 4. Recommendations

Provide actionable security recommendations based on the analysis:
- Suggest adding backup admins if only one exists
- Recommend separation of duties if roles are concentrated
- Identify any missing role assignments for operational safety

${format === 'json' ? 'Return as a structured JSON object with sections for overview, roles, analysis, and recommendations.' : 'Format as a professional audit report in markdown with proper headers and tables.'}`,
          },
        },
      ],
    })
  );

  // Compliance report prompt (TIP-403 Policy Registry)
  server.registerPrompt(
    'compliance-report',
    {
      title: 'Compliance Status Report',
      description:
        'Generate a TIP-403 compliance status report for addresses, checking their whitelist/blacklist status across policies',
      argsSchema: {
        addresses: z
          .string()
          .describe(
            'Comma-separated list of addresses to check compliance status for'
          ),
        policyId: z
          .number()
          .optional()
          .describe(
            'Specific policy ID to check against. If not provided, uses the default policy or checks all relevant policies'
          ),
        token: z
          .string()
          .optional()
          .describe(
            'Token address to check policy compliance for (used to find associated policy)'
          ),
        format: z
          .enum(['markdown', 'json'])
          .optional()
          .default('markdown')
          .describe('Output format for the report'),
      },
    },
    ({ addresses, policyId, token, format }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a ${format ?? 'markdown'} formatted TIP-403 compliance status report.

## Addresses to Check
${addresses}

## Policy Context
${policyId ? `Policy ID: ${policyId}` : token ? `Token: ${token} (find associated policy)` : 'Check against all relevant policies or use default policy'}

## Instructions

1. First, determine the policy context:
   ${policyId ? `- Use the tempo://policy/${policyId} resource or get_policy_info tool to get policy details` : token ? `- Use check_transfer_compliance or get the policy ID associated with token ${token}` : '- Identify the relevant policy or policies to check'}

2. For each address in the list, check:
   - Use is_whitelisted tool to check whitelist status
   - Use is_blacklisted tool to check blacklist status
   - Or use tempo://policy/{id}/whitelist/{address} and tempo://policy/{id}/blacklist/{address} resources

3. Generate the report with the following sections:

## 1. Policy Overview
- Policy ID and type (whitelist/blacklist/none)
- Policy owner address
- Number of tokens using this policy
- Policy type description and implications

## 2. Address Compliance Status

Create a table for each address:
| Address | Whitelisted | Blacklisted | Status | Notes |

Where Status is:
- ✅ COMPLIANT: Can send/receive tokens under this policy
- ❌ BLOCKED: Cannot transact (blacklisted or not whitelisted in whitelist policy)
- ⚠️ RESTRICTED: Partial compliance (e.g., can receive but not send)

## 3. Transfer Matrix (if multiple addresses)

If checking multiple addresses, show which pairs can transfer to each other:
| From \\ To | Addr1 | Addr2 | Addr3 |
|-----------|-------|-------|-------|
| Addr1     | -     | ✅/❌  | ✅/❌  |

Use check_transfer_compliance for each pair.

## 4. Compliance Summary

- Total addresses checked
- Count of compliant addresses
- Count of blocked addresses
- Any addresses requiring attention

## 5. Recommendations

Based on the compliance status:
- Suggest adding addresses to whitelist if needed for operations
- Identify any blocked addresses that may need review
- Recommend actions for compliance gaps

${format === 'json' ? 'Return as a structured JSON object with sections for policy, addressStatuses (array), transferMatrix (if applicable), summary, and recommendations.' : 'Format as a professional compliance report in markdown with proper headers, tables, and status indicators.'}`,
          },
        },
      ],
    })
  );

  // Rewards summary prompt
  server.registerPrompt(
    'rewards-summary',
    {
      title: 'Rewards Summary',
      description:
        'Analyze TIP-20 token rewards status across multiple tokens, showing opt-in status, pending rewards, and optimization recommendations',
      argsSchema: {
        tokens: z
          .string()
          .optional()
          .describe(
            'Comma-separated list of TIP-20 token addresses or aliases to analyze (e.g., "AlphaUSD,BetaUSD"). If not provided, analyzes all tokens in the wallet.'
          ),
        format: z
          .enum(['markdown', 'json'])
          .optional()
          .default('markdown')
          .describe('Output format for the report'),
      },
    },
    ({ tokens, format }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a ${format ?? 'markdown'} formatted TIP-20 rewards summary report.

## Tokens to Analyze
${tokens ? tokens : 'All tokens held in the wallet (use get_balances tool first)'}

## Instructions

1. For each token, use the get_reward_status tool or tempo://token/{address}/rewards resource to fetch:
   - Opt-in status
   - Pending rewards
   - Opted-in balance vs total balance
   - Reward recipient (if set)
   - Total rewards claimed
   - Share of the rewards pool

2. Generate the report with the following sections:

## 1. Portfolio Overview
- Total tokens analyzed
- Tokens with rewards opted in
- Tokens with pending rewards
- Total pending rewards value (if prices available)

## 2. Token-by-Token Status

Create a comprehensive table:
| Token | Opted In | Pending | Balance | Participation | Pool Share | Recipient |
|-------|----------|---------|---------|---------------|------------|-----------|

Where:
- Opted In: ✅ Yes / ❌ No
- Pending: Formatted pending rewards amount
- Balance: Opted-in balance / Total balance
- Participation: Percentage of balance opted in
- Pool Share: Percentage of total opted-in supply
- Recipient: Custom recipient address or "Self"

## 3. Rewards Analysis

For each token:
- Current APY estimate (if historical data available)
- Projected rewards based on pool share
- Comparison to other tokens

## 4. Optimization Recommendations

Provide actionable recommendations:
- Tokens not opted in that could earn rewards
- Tokens with low participation rates
- Unclaimed rewards that should be harvested
- Suboptimal reward recipient configurations
- Pool concentration risks

## 5. Action Items

Generate a prioritized list of actions:
1. "Opt into rewards for [Token] to start earning"
2. "Claim [amount] pending rewards from [Token]"
3. "Consider setting reward recipient for [Token]"

${format === 'json' ? 'Return as a structured JSON object with sections for overview, tokenStatuses (array), analysis, recommendations (array), and actionItems (array).' : 'Format as a professional rewards report in markdown with proper headers, tables, and actionable insights.'}`,
          },
        },
      ],
    })
  );
}

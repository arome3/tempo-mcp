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
}

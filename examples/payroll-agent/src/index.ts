/**
 * Payroll Agent
 *
 * Automated payroll processing with CSV input and batch payments.
 *
 * Usage:
 *   npx tsx src/index.ts <csv-file>                    # Process payroll
 *   npx tsx src/index.ts <csv-file> --validate-only    # Validate only
 *   npx tsx src/index.ts <csv-file> --department Eng   # Filter by department
 *
 * Examples:
 *   npx tsx src/index.ts data/sample-payroll.csv
 *   npx tsx src/index.ts data/sample-payroll.csv --validate-only
 *   npx tsx src/index.ts data/sample-payroll.csv --department Engineering
 */

import 'dotenv/config';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { createTempoClient, disconnect } from '../../shared/client.js';
import {
  printHeader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printTable,
  printDivider,
  formatAmount,
  truncateAddress,
  confirm,
} from '../../shared/utils.js';
import {
  parsePayrollCSV,
  filterByDepartment,
  calculateTotal,
} from './parse-csv.js';
import { validatePayroll, getDepartmentSummary } from './validate-payroll.js';
import { processPayroll } from './process-payroll.js';

function printUsage() {
  console.log('Usage: npx tsx src/index.ts <csv-file> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --validate-only     Validate CSV without processing');
  console.log('  --department <name> Filter by department');
  console.log('  --token <symbol>    Token to pay in (default: AlphaUSD)');
  console.log('  --period <string>   Period for memo (default: current month)');
  console.log('  --help              Show this help');
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx src/index.ts data/sample-payroll.csv');
  console.log('  npx tsx src/index.ts data/payroll.csv --validate-only');
  console.log('  npx tsx src/index.ts data/payroll.csv --department Engineering');
}

interface CliArgs {
  csvFile: string;
  validateOnly: boolean;
  department?: string;
  token: string;
  period?: string;
}

function parseArgs(): CliArgs | null {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    return null;
  }

  let csvFile = '';
  let validateOnly = false;
  let department: string | undefined;
  let token = process.env.TEMPO_DEFAULT_TOKEN ?? 'AlphaUSD';
  let period: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--validate-only' || arg === '-v') {
      validateOnly = true;
    } else if (arg === '--department' || arg === '-d') {
      department = args[++i];
    } else if (arg === '--token' || arg === '-t') {
      token = args[++i];
    } else if (arg === '--period' || arg === '-p') {
      period = args[++i];
    } else if (!arg.startsWith('-')) {
      csvFile = arg;
    }
  }

  if (!csvFile) {
    printError('CSV file path is required');
    printUsage();
    return null;
  }

  return { csvFile, validateOnly, department, token, period };
}

async function main() {
  const args = parseArgs();
  if (!args) {
    process.exit(1);
  }

  // Resolve and validate file path
  const filePath = resolve(process.cwd(), args.csvFile);
  if (!existsSync(filePath)) {
    printError(`File not found: ${filePath}`);
    process.exit(1);
  }

  printHeader('Tempo Payroll Agent');

  // Step 1: Parse CSV
  printInfo('Parsing CSV file...');
  const { employees, errors: parseErrors } = parsePayrollCSV(filePath);

  if (parseErrors.length > 0) {
    printWarning(`Found ${parseErrors.length} parsing error(s):`);
    for (const err of parseErrors) {
      console.log(`  Row ${err.row}: ${err.field} - ${err.message}`);
      if (err.value) console.log(`    Value: "${err.value}"`);
    }
    console.log('');
  }

  if (employees.length === 0) {
    printError('No valid employees found in CSV');
    process.exit(1);
  }

  printSuccess(`Parsed ${employees.length} employee(s)`);

  // Filter by department if specified
  let payrollEmployees = employees;
  if (args.department) {
    payrollEmployees = filterByDepartment(employees, args.department);
    if (payrollEmployees.length === 0) {
      printError(`No employees found in department: ${args.department}`);
      process.exit(1);
    }
    printInfo(`Filtered to ${payrollEmployees.length} employee(s) in ${args.department}`);
  }

  // Show employee list
  printDivider();
  console.log('\nEmployees:');
  printTable(
    ['ID', 'Name', 'Department', 'Amount', 'Address'],
    payrollEmployees.map((e) => [
      e.employeeId,
      e.name,
      e.department ?? '-',
      formatAmount(e.amount),
      truncateAddress(e.walletAddress),
    ])
  );

  // Show department summary
  const deptSummary = getDepartmentSummary(payrollEmployees);
  console.log('\nBy Department:');
  printTable(
    ['Department', 'Employees', 'Total'],
    deptSummary.map((d) => [d.department, d.count.toString(), formatAmount(d.total)])
  );

  // Connect to server
  printDivider();
  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();

  try {
    // Step 2: Validate
    printInfo('Validating payroll...');
    const validation = await validatePayroll(client, payrollEmployees, args.token);

    console.log('\nPre-flight Check:');
    printTable(
      ['Check', 'Value'],
      [
        ['Wallet', truncateAddress(validation.walletAddress)],
        ['Current Balance', `${formatAmount(validation.currentBalance)} ${args.token}`],
        ['Total Payroll', `${formatAmount(validation.totalPayroll)} ${args.token}`],
        ['Balance After', `${formatAmount(validation.balanceAfter)} ${args.token}`],
        ['Employees', validation.employeeCount.toString()],
      ]
    );

    // Show warnings
    for (const warning of validation.warnings) {
      printWarning(warning);
    }

    // Show errors
    for (const error of validation.errors) {
      printError(error);
    }

    if (!validation.valid) {
      printError('Validation failed. Please fix the errors above.');
      process.exit(1);
    }

    printSuccess('Validation passed');

    // Stop here if validate-only
    if (args.validateOnly) {
      printInfo('Validate-only mode. Stopping before processing.');
      return;
    }

    // Step 3: Confirm and process
    printDivider();
    const shouldProceed = await confirm(
      `\nProcess payroll for ${payrollEmployees.length} employees (${formatAmount(validation.totalPayroll)} ${args.token})?`
    );

    if (!shouldProceed) {
      printInfo('Payroll cancelled by user');
      return;
    }

    // Process payroll
    printInfo('Processing payroll...');
    const result = await processPayroll(
      client,
      payrollEmployees,
      args.token,
      args.period
    );

    if (!result.success) {
      printError(`Payroll failed: ${result.error}`);
      process.exit(1);
    }

    // Show results
    printHeader('Payroll Complete');
    printSuccess('All payments sent successfully!');

    printTable(
      ['Field', 'Value'],
      [
        ['Transaction', result.transactionHash ?? 'N/A'],
        ['Block', result.blockNumber?.toString() ?? 'Pending'],
        ['Total Paid', `${formatAmount(result.totalAmount ?? '0')} ${args.token}`],
        ['Recipients', result.recipientCount?.toString() ?? '0'],
        ['Gas Cost', result.gasCost ?? 'N/A'],
      ]
    );

    if (result.explorerUrl) {
      console.log(`\nExplorer: ${result.explorerUrl}`);
    }

    printSuccess('Payroll processing complete!');
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

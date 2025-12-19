# Payroll Agent Example

> Batch payroll processing with CSV input and atomic payments.

## Overview

This example demonstrates using tempo-mcp for automated payroll processing:
- CSV payroll data parsing
- Validation and pre-flight checks
- Atomic batch payments (all-or-nothing)
- Payment summary generation

---

## Prerequisites

1. tempo-mcp installed and configured
2. Testnet wallet with sufficient AlphaUSD balance
3. CSV payroll file with employee data

---

## Payroll CSV Format

```csv
employee_id,name,wallet_address,amount,department
EMP001,Alice Johnson,0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb,5000.00,Engineering
EMP002,Bob Smith,0x8ba1f109551bD432803012645Ac136ddd64DBA72,4500.00,Marketing
EMP003,Carol White,0xdD2FD4581271e230360230F9337D5c0430Bf44C0,5500.00,Engineering
EMP004,David Brown,0x2546BcD3c84621e976D8185a91A922aE77ECEc30,4000.00,Operations
```

---

## Example Conversations

### Process Payroll

```
User: Process this month's payroll from payroll-dec-2024.csv

Claude: I'll process the payroll from your CSV file. Let me first check
your balance and validate the payroll data.

[calls get_balance]
Current balance: 50,000.00 AlphaUSD

[parses CSV - 4 employees, total: 19,000.00 AlphaUSD]

Pre-flight checks:
- Total payroll: 19,000.00 AlphaUSD
- Employee count: 4
- Balance after: 31,000.00 AlphaUSD

Shall I proceed with the batch payment?

User: Yes, proceed

Claude: [calls batch_payments]
{
  "token": "AlphaUSD",
  "recipients": [
    { "address": "0x742d...bEbb", "amount": "5000", "memo": "DEC-2024-EMP001" },
    { "address": "0x8ba1...BA72", "amount": "4500", "memo": "DEC-2024-EMP002" },
    { "address": "0xdD2F...44C0", "amount": "5500", "memo": "DEC-2024-EMP003" },
    { "address": "0x2546...c30", "amount": "4000", "memo": "DEC-2024-EMP004" }
  ]
}

Payroll completed successfully!

Transaction: 0xabc123...
Total paid: 19,000.00 AlphaUSD
Employees: 4
Gas cost: 0.0012 AlphaUSD

All payments confirmed in single atomic transaction.
```

### Validate Before Processing

```
User: Validate payroll.csv before processing

Claude: [parses CSV and validates]

Validation Results:
- Total records: 4
- Valid: 3
- Issues: 1

Issues found:
- Row 3: Invalid wallet address "0xinvalid" for Carol White

Please fix the CSV and re-upload.
```

### Payroll with Department Filtering

```
User: Run payroll only for Engineering department

Claude: [parses CSV, filters by department]

Filtered payroll (Engineering only):
- Alice Johnson: 5,000.00 AlphaUSD
- Carol White: 5,500.00 AlphaUSD

Total: 10,500.00 AlphaUSD (2 employees)

[calls batch_payments with filtered list]

Engineering payroll complete!
Transaction: 0xdef456...
```

### Generate Payroll Report

```
User: Generate a summary of last month's payroll

Claude: [calls payroll_summary prompt]

## Payroll Summary - November 2024

| Department | Employees | Total |
|------------|-----------|-------|
| Engineering | 2 | 10,500.00 |
| Marketing | 1 | 4,500.00 |
| Operations | 1 | 4,000.00 |

**Grand Total:** 19,000.00 AlphaUSD
**Transaction:** 0x789abc...
**Date:** 2024-11-30
```

---

## Workflow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  CSV File   │────▶│   Validate  │────▶│  Pre-flight │
│  (Input)    │     │  Addresses  │     │   Checks    │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Report    │◀────│   Confirm   │◀────│   Balance   │
│  Generated  │     │  Payments   │     │    Check    │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   batch_    │
                    │  payments   │
                    │  (Atomic)   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Audit     │
                    │    Log      │
                    └─────────────┘
```

---

## Configuration

Payroll-specific `.env` additions:

```bash
TEMPO_RPC_URL=https://rpc.testnet.tempo.xyz
TEMPO_PRIVATE_KEY=0x...your-testnet-key...
TEMPO_DEFAULT_TOKEN=AlphaUSD

# Payroll-specific limits
TEMPO_MAX_BATCH_SIZE=100
TEMPO_MAX_SINGLE_PAYMENT=50000
TEMPO_DAILY_LIMIT=500000
```

---

## Security Considerations

1. **Atomic Transactions**: All payments succeed or all fail together
2. **Pre-flight Validation**: Address format, balance sufficiency
3. **Spending Limits**: Configurable per-transaction and daily limits
4. **Audit Trail**: Every payment logged with employee reference
5. **Memo Tagging**: Payment period + employee ID for reconciliation

---

## Tools Used

| Tool | Purpose |
|------|---------|
| `get_balance` | Pre-flight balance check |
| `batch_payments` | Atomic multi-recipient transfer |
| `get_transaction` | Confirm transaction status |
| `payroll_summary` | Generate formatted report |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Insufficient balance | Abort before sending |
| Invalid address in CSV | Report row number and skip |
| Transaction failure | Full rollback (atomic) |
| Rate limit exceeded | Wait and retry |

---

## Next Steps

- [Invoice Agent](../invoice-agent/) - AP automation with memos
- [Treasury Agent](../treasury-agent/) - Multi-token management
- [06-batch-payments.md](../../docs/06-batch-payments.md) - Technical details

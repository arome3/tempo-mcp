# Invoice Agent Example

> Accounts Payable automation with memo-based reconciliation.

## Overview

This example demonstrates using tempo-mcp for automated invoice processing:
- Invoice tracking with on-chain memo references
- Payment matching via transaction memos
- Scheduled payment workflows for due dates
- Reconciliation reporting

---

## Key Concept: Memo-Based Reconciliation

TIP-20 tokens support 32-byte memos directly in transfer transactions. This enables:

```
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│   Invoice    │        │   Payment    │        │   On-Chain   │
│  INV-2024-   │───────▶│    with      │───────▶│    Memo      │
│    0042      │        │    Memo      │        │ "INV-2024-0042" │
└──────────────┘        └──────────────┘        └──────────────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │  Automatic   │
                                                │ Reconcile    │
                                                └──────────────┘
```

No external database needed - the blockchain is the source of truth.

---

## Prerequisites

1. tempo-mcp installed and configured
2. Testnet wallet with sufficient AlphaUSD
3. Invoice data (JSON, CSV, or manual entry)

---

## Invoice Data Format

```json
{
  "invoices": [
    {
      "id": "INV-2024-0042",
      "vendor": "Acme Corp",
      "vendor_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb",
      "amount": "15000.00",
      "currency": "AlphaUSD",
      "due_date": "2024-12-15",
      "status": "pending"
    },
    {
      "id": "INV-2024-0043",
      "vendor": "CloudHost Inc",
      "vendor_address": "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
      "amount": "2500.00",
      "currency": "AlphaUSD",
      "due_date": "2024-12-20",
      "status": "pending"
    }
  ]
}
```

---

## Example Conversations

### Pay Single Invoice

```
User: Pay invoice INV-2024-0042 to Acme Corp

Claude: I'll process the payment for invoice INV-2024-0042.

Invoice Details:
- Vendor: Acme Corp
- Amount: 15,000.00 AlphaUSD
- Address: 0x742d...bEbb
- Due: December 15, 2024

[calls send_payment_with_memo]
{
  "token": "AlphaUSD",
  "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb",
  "amount": "15000",
  "memo": "INV-2024-0042"
}

Payment sent!
- Transaction: 0xabc123...
- Memo: INV-2024-0042
- Status: Confirmed (2 blocks)

Invoice INV-2024-0042 marked as paid.
```

### Schedule Future Payment

```
User: Schedule payment for INV-2024-0043 on its due date

Claude: I'll schedule the payment for the due date.

Invoice INV-2024-0043:
- Vendor: CloudHost Inc
- Amount: 2,500.00 AlphaUSD
- Due: December 20, 2024

[calls schedule_payment]
{
  "token": "AlphaUSD",
  "to": "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
  "amount": "2500",
  "memo": "INV-2024-0043",
  "scheduled_time": "2024-12-20T09:00:00Z"
}

Payment scheduled!
- Schedule ID: sch_xyz789
- Execute: December 20, 2024 at 9:00 AM UTC
- Amount: 2,500.00 AlphaUSD

The payment will be automatically executed on the due date.
```

### Reconcile Payments

```
User: Reconcile all payments from last month

Claude: I'll analyze on-chain transactions and match them to invoices.

[calls get_transaction for recent transfers]
[matches memos to invoice IDs]

## Reconciliation Report - November 2024

| Invoice | Vendor | Amount | Tx Hash | Status |
|---------|--------|--------|---------|--------|
| INV-2024-0038 | Acme Corp | 12,000 | 0xaaa... | Matched |
| INV-2024-0039 | DataCo | 8,500 | 0xbbb... | Matched |
| INV-2024-0040 | CloudHost | 2,500 | 0xccc... | Matched |
| INV-2024-0041 | - | 1,000 | 0xddd... | Unmatched |

Summary:
- Matched: 3 invoices ($23,000)
- Unmatched: 1 payment ($1,000)
- Unpaid invoices: 0

Note: Transaction 0xddd... with memo "MISC-EXPENSE"
doesn't match any invoice. Please review manually.
```

### Batch Pay All Due Invoices

```
User: Pay all invoices due this week

Claude: Let me find all invoices due within the next 7 days.

[queries invoice database]

Found 3 invoices due this week:

| Invoice | Vendor | Amount | Due |
|---------|--------|--------|-----|
| INV-2024-0044 | SupplyCo | 5,000 | Dec 14 |
| INV-2024-0045 | WebHost | 1,200 | Dec 15 |
| INV-2024-0046 | ToolsInc | 3,800 | Dec 16 |

Total: 10,000.00 AlphaUSD

[calls batch_payments]
{
  "token": "AlphaUSD",
  "recipients": [
    { "address": "0x111...", "amount": "5000", "memo": "INV-2024-0044" },
    { "address": "0x222...", "amount": "1200", "memo": "INV-2024-0045" },
    { "address": "0x333...", "amount": "3800", "memo": "INV-2024-0046" }
  ]
}

All 3 invoices paid!
- Transaction: 0xdef456...
- Total: 10,000.00 AlphaUSD
- Gas: 0.0018 AlphaUSD

All invoices marked as paid in your records.
```

### Generate Payment Receipt

```
User: Generate a receipt for the Acme Corp payment

Claude: [calls payment_receipt prompt]

═══════════════════════════════════════════════════
                  PAYMENT RECEIPT
═══════════════════════════════════════════════════

Reference:     INV-2024-0042
Date:          December 12, 2024
Time:          14:32:15 UTC

From:          Your Company Treasury
               0x9876...4321

To:            Acme Corp
               0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb

Amount:        15,000.00 AlphaUSD

Transaction:   0xabc123def456...
Block:         1,234,567
Network:       Tempo Testnet

Status:        CONFIRMED

═══════════════════════════════════════════════════
```

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    INVOICE PROCESSING                        │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │  Immediate  │     │  Scheduled  │     │    Batch    │
   │   Payment   │     │   Payment   │     │   Payment   │
   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
          │                   │                   │
          ▼                   ▼                   ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │    send_    │     │  schedule_  │     │   batch_    │
   │  payment_   │     │   payment   │     │  payments   │
   │  with_memo  │     │             │     │             │
   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  On-Chain Memo  │
                    │  = Invoice ID   │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Reconciliation │
                    │     Report      │
                    └─────────────────┘
```

---

## Configuration

Invoice-specific `.env` additions:

```bash
TEMPO_RPC_URL=https://rpc.testnet.tempo.xyz
TEMPO_PRIVATE_KEY=0x...your-testnet-key...
TEMPO_DEFAULT_TOKEN=AlphaUSD

# Invoice processing settings
TEMPO_MEMO_PREFIX=INV-         # Auto-prefix for invoice memos
TEMPO_RECONCILE_LOOKBACK=30    # Days to scan for matching txns
TEMPO_DUE_DATE_REMINDER=3      # Days before due to alert
```

---

## Memo Best Practices

| Pattern | Example | Use Case |
|---------|---------|----------|
| Invoice ID | `INV-2024-0042` | Standard AP payment |
| PO Reference | `PO-98765` | Purchase order linkage |
| Contract | `CTR-ABC-001` | Recurring contract payment |
| Combined | `INV-0042/PO-987` | Full audit trail |

**Memo Constraints:**
- Maximum 32 bytes (UTF-8)
- ASCII recommended for compatibility
- Avoid special characters

---

## Tools Used

| Tool | Purpose |
|------|---------|
| `send_payment_with_memo` | Pay single invoice with reference |
| `batch_payments` | Pay multiple invoices atomically |
| `schedule_payment` | Schedule future payment |
| `get_transaction` | Verify payment status |
| `payment_receipt` | Generate formatted receipt |
| `reconciliation_report` | Match payments to invoices |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Duplicate payment | Warn if memo already used |
| Invalid vendor address | Reject with validation error |
| Insufficient funds | List unpaid, prioritize by due date |
| Memo too long | Truncate with warning |

---

## Next Steps

- [Treasury Agent](../treasury-agent/) - Multi-token treasury management
- [Payroll Agent](../payroll-agent/) - Batch employee payments
- [05-payment-tools.md](../../docs/05-payment-tools.md) - Payment implementation details

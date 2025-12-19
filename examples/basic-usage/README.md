# Basic Usage Example

> Simple payment flows with tempo-mcp.

## Overview

This example demonstrates basic tempo-mcp operations:
- Checking balances
- Sending single payments
- Verifying transactions

---

## Prerequisites

1. tempo-mcp installed and configured
2. Testnet wallet with AlphaUSD (use [faucet](https://docs.tempo.xyz/quickstart/faucet))

---

## Example Conversations

### Check Balance

```
User: What's my AlphaUSD balance?

Claude: [calls get_balance]
Your AlphaUSD balance is 10,500.00 AUSD.
```

### Send Payment

```
User: Send 100 AlphaUSD to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb

Claude: [calls send_payment]
✅ Payment sent successfully!
- Amount: 100.00 AlphaUSD
- To: 0x742d...bEbb
- Transaction: 0xabc123...
- View: https://explore.tempo.xyz/tx/0xabc123...
```

### Payment with Memo

```
User: Pay invoice INV-2024-001 for $500 to vendor wallet 0xvendor...

Claude: [calls send_payment]
{
  "token": "AlphaUSD",
  "to": "0xvendor...",
  "amount": "500",
  "memo": "INV-2024-001"
}

✅ Invoice payment processed!
Memo: INV-2024-001 embedded for reconciliation.
```

---

## Configuration

Minimal `.env` for basic usage:

```bash
TEMPO_RPC_URL=https://rpc.testnet.tempo.xyz
TEMPO_PRIVATE_KEY=0x...your-testnet-key...
TEMPO_DEFAULT_TOKEN=AlphaUSD
```

---

## Tools Used

| Tool | Purpose |
|------|---------|
| `get_balance` | Check token balance |
| `send_payment` | Send stablecoin transfer |
| `get_transaction` | Verify transaction status |

---

## Next Steps

- [Payroll Agent](../payroll-agent/) - Batch payments
- [Invoice Agent](../invoice-agent/) - AP automation
- [Treasury Agent](../treasury-agent/) - Multi-token management

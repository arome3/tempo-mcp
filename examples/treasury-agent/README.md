# Treasury Agent Example

> Multi-token treasury management with automated rebalancing.

## Overview

This example demonstrates using tempo-mcp for corporate treasury operations:
- Multi-stablecoin portfolio tracking
- DEX swaps for currency conversion
- Automated rebalancing strategies
- Spending analytics and reporting

---

## Key Concept: Multi-Stablecoin Treasury

Tempo supports multiple stablecoins natively. A treasury agent can:

```
┌─────────────────────────────────────────────────────────────┐
│                    TREASURY PORTFOLIO                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌───────────┐    ┌───────────┐    ┌───────────┐           │
│   │ AlphaUSD  │    │ AlphaEUR  │    │ AlphaGBP  │           │
│   │  60,000   │    │  25,000   │    │  15,000   │           │
│   │   (60%)   │    │   (25%)   │    │   (15%)   │           │
│   └─────┬─────┘    └─────┬─────┘    └─────┬─────┘           │
│         │                │                │                  │
│         └────────────────┼────────────────┘                  │
│                          │                                   │
│                          ▼                                   │
│                   ┌─────────────┐                            │
│                   │  Tempo DEX  │                            │
│                   │   Swaps     │                            │
│                   └─────────────┘                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

1. tempo-mcp installed and configured
2. Testnet wallet with multiple stablecoin balances
3. Target allocation policy (optional)

---

## Example Conversations

### Check Portfolio Status

```
User: What's our current treasury balance?

Claude: [calls get_balances for all tokens]

## Treasury Portfolio

| Token | Balance | Value (USD) | Allocation |
|-------|---------|-------------|------------|
| AlphaUSD | 60,000.00 | $60,000 | 60.0% |
| AlphaEUR | 23,148.15 | $25,000 | 25.0% |
| AlphaGBP | 11,811.02 | $15,000 | 15.0% |

**Total Value:** ~$100,000 USD equivalent
**Wallet:** 0x9876...4321

Portfolio is balanced according to target allocation:
- USD: 60% (target: 60%) ✓
- EUR: 25% (target: 25%) ✓
- GBP: 15% (target: 15%) ✓
```

### Convert Currency for Payment

```
User: We need to pay 10,000 EUR to our German supplier

Claude: Let me check your AlphaEUR balance and prepare the payment.

[calls get_balance for AlphaEUR]
Current AlphaEUR: 23,148.15

You have sufficient AlphaEUR. Shall I proceed with the payment?

User: Yes, but first convert some USD to EUR to maintain our target allocation

Claude: Good thinking. After paying 10,000 EUR, you'd have:
- AlphaEUR: 13,148.15 (13.1%) - below 25% target

Let me convert USD to EUR first.

[calls get_swap_quote]
{
  "from_token": "AlphaUSD",
  "to_token": "AlphaEUR",
  "amount": "13000"
}

Quote:
- Input: 13,000.00 AlphaUSD
- Output: 12,037.04 AlphaEUR
- Rate: 1 USD = 0.926 EUR
- Slippage: 0.02%

Shall I execute this swap?

User: Yes, execute

Claude: [calls swap_stablecoins]

Swap complete!
- Transaction: 0xabc123...
- Received: 12,037.04 AlphaEUR

New AlphaEUR balance: 35,185.19

Now I'll send the payment...

[calls send_payment_with_memo]
{
  "token": "AlphaEUR",
  "to": "0x742d...bEbb",
  "amount": "10000",
  "memo": "INV-DE-2024-0089"
}

Payment sent!
- Transaction: 0xdef456...
- Amount: 10,000.00 AlphaEUR

Updated Portfolio:
| Token | Balance | Allocation |
|-------|---------|------------|
| AlphaUSD | 47,000 | 52.2% |
| AlphaEUR | 25,185 | 28.0% |
| AlphaGBP | 15,000 | 16.7% |
```

### Rebalance Portfolio

```
User: Rebalance treasury to match target allocation

Claude: Let me analyze the current vs target allocation.

Current vs Target:
| Token | Current | Target | Diff |
|-------|---------|--------|------|
| AlphaUSD | 52.2% | 60.0% | -7.8% |
| AlphaEUR | 28.0% | 25.0% | +3.0% |
| AlphaGBP | 16.7% | 15.0% | +1.7% |

Recommended trades to rebalance:
1. Sell 2,700 AlphaEUR → Buy AlphaUSD
2. Sell 1,500 AlphaGBP → Buy AlphaUSD

[calls get_swap_quote for each trade]

Swap Summary:
- Trade 1: 2,700 EUR → 2,916 USD (rate: 1.08)
- Trade 2: 1,500 GBP → 1,890 USD (rate: 1.26)
- Total USD gained: 4,806
- Est. gas: 0.003 AlphaUSD

Execute rebalancing trades?

User: Yes, proceed

Claude: [calls swap_stablecoins - trade 1]
Trade 1 complete: +2,916.00 AlphaUSD

[calls swap_stablecoins - trade 2]
Trade 2 complete: +1,890.00 AlphaUSD

Rebalancing complete!

New Portfolio:
| Token | Balance | Allocation | Target |
|-------|---------|------------|--------|
| AlphaUSD | 51,806 | 60.0% | 60% ✓ |
| AlphaEUR | 21,574 | 25.0% | 25% ✓ |
| AlphaGBP | 12,992 | 15.0% | 15% ✓ |
```

### Distribute Token Rewards

```
User: Distribute 5000 AlphaUSD as rewards to our token holders

Claude: Let me check the reward pool status first.

[calls get_reward_status]
{
  "token": "AlphaUSD"
}

Current reward pool:
- Total opted-in supply: 2,500,000 AlphaUSD
- Opted-in holders: 847 addresses
- Your balance: 60,000 AlphaUSD

[calls distribute_rewards]
{
  "token": "AlphaUSD",
  "amount": "5000",
  "duration": 0
}

Reward distribution complete!
- Amount: 5,000.00 AlphaUSD
- Reward ID: #127
- Distribution: Instant
- Transaction: 0xabc123...

Rewards have been allocated proportionally to all 847 opted-in holders.
Each holder can now claim their share based on their balance.

Example allocations:
- Holder with 25,000 AUSD (1%): receives 50.00 AUSD
- Holder with 2,500 AUSD (0.1%): receives 5.00 AUSD
```

### Spending Analysis

```
User: Show me our spending report for this quarter

Claude: [calls spending_report prompt]

## Q4 2024 Spending Report

### By Category
| Category | Amount (USD eq.) | % of Total |
|----------|------------------|------------|
| Payroll | 125,000 | 45% |
| Vendors | 98,000 | 35% |
| Operations | 42,000 | 15% |
| Misc | 14,000 | 5% |

### By Currency
| Currency | Spent | Transactions |
|----------|-------|--------------|
| AlphaUSD | 180,000 | 45 |
| AlphaEUR | 85,000 | 23 |
| AlphaGBP | 14,000 | 8 |

### Monthly Trend
```
Oct:  ████████████████████ $95,000
Nov:  ███████████████████████ $110,000
Dec:  ██████████████ $74,000 (MTD)
```

### Top Recipients
1. Acme Corp - $45,000 (12 txns)
2. CloudHost - $28,000 (3 txns)
3. PayrollBatch - $125,000 (3 txns)
```

### Set Up Automated Rebalancing

```
User: Set up automatic rebalancing when allocation drifts more than 5%

Claude: I'll configure drift-triggered rebalancing.

Rebalancing Policy:
- Trigger: Any token drifts >5% from target
- Check frequency: Every 6 hours
- Max slippage: 0.5%
- Min trade size: 100 USD equivalent

Target Allocation:
- AlphaUSD: 60%
- AlphaEUR: 25%
- AlphaGBP: 15%

Note: This requires a scheduled job outside MCP.
Here's a sample cron configuration:

```bash
# Check every 6 hours
0 */6 * * * /usr/bin/node /path/to/rebalance-check.js
```

The script would:
1. Call get_balances
2. Calculate drift from targets
3. If drift > 5%, call swap_stablecoins
4. Log all actions to audit trail

Shall I generate the rebalance-check.js script?
```

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   TREASURY OPERATIONS                        │
└─────────────────────────────────────────────────────────────┘
                              │
      ┌───────────────────────┼───────────────────────┐
      ▼                       ▼                       ▼
┌───────────┐          ┌───────────┐          ┌───────────┐
│  Monitor  │          │   Swap    │          │  Payment  │
│ Balances  │          │ Currencies│          │ Outflows  │
└─────┬─────┘          └─────┬─────┘          └─────┬─────┘
      │                      │                      │
      ▼                      ▼                      ▼
┌───────────┐          ┌───────────┐          ┌───────────┐
│    get_   │          │   swap_   │          │   send_   │
│  balances │          │stablecoins│          │  payment  │
└─────┬─────┘          └─────┬─────┘          └─────┬─────┘
      │                      │                      │
      └──────────────────────┼──────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Portfolio State │
                    │    Updated      │
                    └────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌───────────┐   ┌───────────┐   ┌───────────┐
       │  Spending │   │   Drift   │   │   Audit   │
       │  Report   │   │   Alert   │   │    Log    │
       └───────────┘   └───────────┘   └───────────┘
```

---

## Configuration

Treasury-specific `.env` additions:

```bash
TEMPO_RPC_URL=https://rpc.testnet.tempo.xyz
TEMPO_PRIVATE_KEY=0x...your-testnet-key...

# Treasury token addresses (Testnet)
TEMPO_TOKEN_USD=0x20c0000000000000000000000000000000000001
TEMPO_TOKEN_EUR=0x20c0000000000000000000000000000000000002
TEMPO_TOKEN_GBP=0x20c0000000000000000000000000000000000003

# DEX settings
TEMPO_DEX_ROUTER=0x...
TEMPO_MAX_SLIPPAGE=0.5

# Target allocation (percentage)
TREASURY_TARGET_USD=60
TREASURY_TARGET_EUR=25
TREASURY_TARGET_GBP=15
TREASURY_DRIFT_THRESHOLD=5
```

---

## Tools Used

| Tool | Purpose |
|------|---------|
| `get_balance` | Single token balance |
| `get_balances` | Multi-token portfolio view |
| `get_swap_quote` | Preview exchange rate |
| `swap_stablecoins` | Execute currency conversion |
| `send_payment` | Outgoing transfers |
| `spending_report` | Analytics prompt |
| `distribute_rewards` | Distribute rewards to token holders |
| `get_reward_status` | Check reward pool and opt-in stats |

---

## Swap Considerations

| Factor | Description |
|--------|-------------|
| Slippage | Set max acceptable (default 0.5%) |
| Liquidity | Check pool depth for large swaps |
| Rate | Compare quote vs market rate |
| Gas | Factor into small swap decisions |
| Timing | Consider batch vs immediate swaps |

---

## Security Features

1. **Swap Limits**: Max single swap amount configurable
2. **Slippage Protection**: Reject if slippage exceeds threshold
3. **Rate Monitoring**: Alert on unusual exchange rates
4. **Multi-sig Ready**: Integrate with Turnkey for approvals
5. **Audit Trail**: All swaps logged with before/after balances

---

## Advanced: Multi-Currency Payment Selection

```
User: Pay 10,000 to vendor, use whichever currency minimizes swap cost

Claude: Let me analyze payment options.

Vendor accepts: AlphaUSD, AlphaEUR
Payment amount: $10,000 equivalent

Option 1: Pay in AlphaUSD
- Current balance: 51,806 AlphaUSD
- Direct payment: 10,000 AlphaUSD
- Swap needed: None
- Total cost: 10,000.00

Option 2: Pay in AlphaEUR
- Current balance: 21,574 AlphaEUR
- Direct payment: 9,259 AlphaEUR
- Swap needed: None
- Total cost: ~10,000.08 (rate variance)

Recommendation: Pay in AlphaUSD
- Zero swap fee
- Maintains better EUR reserve for future needs

Proceed with AlphaUSD payment?
```

---

## Next Steps

- [Payroll Agent](../payroll-agent/) - Batch employee payments
- [Invoice Agent](../invoice-agent/) - AP automation
- [11-exchange-tools.md](../../docs/11-exchange-tools.md) - DEX implementation details

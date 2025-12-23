# Market Maker Agent

Automated market-making agent for Tempo DEX using limit and flip orders.

## Features

- **View Orderbook**: Display current bid/ask levels and spread
- **Place Orders**: Create limit and flip orders at specified price points
- **Manage Positions**: View and cancel open orders
- **Auto Market Making**: Place flip orders that automatically reverse on fill

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your private key
nano .env

# Run the agent
npx tsx src/index.ts
```

## Available Commands

```bash
# View orderbook for a token pair
npx tsx src/index.ts --orderbook AlphaUSD

# View your open orders
npx tsx src/index.ts --orders

# Place a limit order
npx tsx src/place-order.ts --side buy --token AlphaUSD --amount 100 --tick -10

# Place a flip order (auto-reversing)
npx tsx src/place-order.ts --flip --side buy --token AlphaUSD --amount 100 --tick -10 --flip-tick 10

# Cancel an order
npx tsx src/cancel-order.ts --id <order-id>
```

## Tick Pricing

Tempo DEX uses tick-based pricing where:
- `price = 1 + tick / 100,000`
- Tick 0 = $1.0000
- Tick -10 = $0.9999 (buy below parity)
- Tick 10 = $1.0001 (sell above parity)

## Flip Orders

Flip orders are designed for stablecoin market making:
1. Initial order placed at specified tick
2. When filled, automatically creates reverse order at flip tick
3. Provides perpetual liquidity as it oscillates between buy/sell

Example: Place buy at $0.9999 (tick -10), when filled auto-sells at $1.0001 (tick 10), earning $0.0002 spread.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEMPO_PRIVATE_KEY` | Your wallet private key | Required |
| `TEMPO_RPC_URL` | Tempo RPC endpoint | `https://rpc.testnet.tempo.xyz` |
| `MM_DEFAULT_TOKEN` | Default token to trade | `AlphaUSD` |
| `MM_DEFAULT_AMOUNT` | Default order amount | `100` |
| `MM_SPREAD_TICKS` | Spread in ticks for flip orders | `20` |

## Security

- Always use a dedicated trading wallet
- Start with small amounts on testnet
- Monitor your orders regularly
- Set appropriate spending limits in config

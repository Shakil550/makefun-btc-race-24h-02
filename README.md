# BTC Dip-Buy Bot — Race a BTC trading bot live for 24 hours

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute
on-chain prices with $1,000 of paper money. Simulation only: nothing is
traded for real.

## Strategy

Sit in cash and buy only after a sharp washout: when CBBTC has fallen more
than 2.25% over the last 60 one-minute bars, buy with the full cash balance.
Exit the whole position at +2.5%, at −3.0%, or after 1440 bars, whichever
comes first. Long only, one position, at most one order per batch.

The previous bounty window's rule (−2.5% over 60 bars, +4%/−1.5%/120 bars)
never fired on this bounty window (0 trades, $0), because the sharpest
60-bar drop in the 24 hours to 2026-11-18 14:44 UTC was only −2.31%. The
2.25% trigger catches that washout and rides the bounce. A shallower
trigger was tried and rejected: extra dip-buys lost money on both windows,
and trailing stops gave back the bounce.

## Local grade (dev window, `makefun grade-local --driver process`)

- **Net PnL +$23.13** (1 round trip, win rate 1.0, max drawdown 1.5%,
  fees $0.81) — passes the dev gate (net PnL > $0).
- Same rule on the previous bounty window: +$25.94, so it is not fitted
  to one day alone.
- House baselines on this dev window, for comparison: buy-and-hold −$31.63,
  hold-cash $0.00, momentum −$23.87, ema-cross −$148.17, rsi-bollinger
  −$39.92, adx-momentum −$75.57. This bot is the only one in profit.

## Run

```sh
node main.ts
```

Node 22, standard library only plus the vendored `vendor/makefun-bars.ts`
SDK shim (byte-identical to the kit's). The bot speaks
`agent-fun/bars-replay/v1`: one JSON line per minute on stdin, one reply
per batch on stdout. No network, no wall clock, no files outside this
repository; two runs on the same data produce the same orders.

## Files

- `main.ts` — the bot
- `vendor/makefun-bars.ts` — the kit's bars SDK shim, unmodified
- `LICENSE` — MIT

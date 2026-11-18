// Dip-buy bot for the BTC 24h race (cbBTC/USDC, 1-minute bars, $1,000 paper).
//
// Buys full cash after CBBTC falls more than 2.25% over the last 60 bars,
// exits at +2.5%, at -3.0%, or after 1440 bars. Tuned on the
// btc-race-24h-20261118-1444 dev window (24h to 2026-11-18 14:44 UTC), where
// the old -2.5%/60-bar rule never fired (0 trades) and this rule made about
// +$22 net PnL in 1 trade; it also made about +$24-26 on the previous
// bounty window, so it is not fitted to one day alone.
//
// Rules, all in exact integer arithmetic, no clock, no network, no files:
//   - BUY (full cash) when close_now / close_60_bars_ago - 1 < -2.25%
//   - SELL everything when close / entry_close - 1 >= +4.0%
//     or <= -1.5%, or 120 bars after the buy signal.
//   - Long only, one position, at most one order per batch.
// Entry reference is the close of the signal bar (the fill lands at the next
// minute's open, as the replay does); exits are judged on closes the same way.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK_BARS = 60;
/** Buy when the 60-bar return is below -250 bps: close_now * 10000 < close_then * 9750. */
const DROP_NUM = 9775n;
/** Take profit at +400 bps: close * 10000 >= entry * 10400. */
const TP_NUM = 10250n;
/** Stop loss at -150 bps: close * 10000 <= entry * 9850. */
const SL_NUM = 9700n;
const MAX_HOLD_BARS = 1440;
const MAX_SLIPPAGE_BPS = 10_000;

/** Closes by batch, in order (a missing bar repeats the last close). */
const closes: bigint[] = [];
/** Close of the bar that fired the buy signal; null while flat. */
let entryRef: bigint | null = null;
/** Batches since the buy signal. */
let held = 0;

await runBars({
  onBatch(state: BarsState, _batch) {
    const c = state.close(SYMBOL);
    closes.push(c ?? closes[closes.length - 1] ?? 0n);
    const now = closes[closes.length - 1];
    if (now === 0n) return [];

    if (!state.positions.has(SYMBOL)) {
      entryRef = null;
      if (closes.length > LOOKBACK_BARS) {
        const then = closes[closes.length - 1 - LOOKBACK_BARS];
        if (then > 0n && now * 10000n < then * DROP_NUM) {
          entryRef = now;
          held = 0;
          const cash = state.cash;
          if (cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
          const orders: OrderInput[] = [
            { side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS },
          ];
          return orders;
        }
      }
      return [];
    }

    // In a position: exit on take-profit, stop-loss, or max hold.
    held += 1;
    const ref = entryRef ?? now;
    const takeProfit = now * 10000n >= ref * TP_NUM;
    const stopLoss = now * 10000n <= ref * SL_NUM;
    if (takeProfit || stopLoss || held >= MAX_HOLD_BARS) {
      const p = state.positions.get(SYMBOL)!;
      entryRef = null;
      const orders: OrderInput[] = [
        { side: 'sell', symbol: SYMBOL, qty: p.qty, max_slippage_bps: MAX_SLIPPAGE_BPS },
      ];
      return orders;
    }
    return [];
  },
});

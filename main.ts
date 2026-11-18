// Dip-buy bot for the BTC 24h race (cbBTC/USDC, 1-minute bars, $1,000 paper).
//
// Strategy (v2, tuned on the btc-race-24h-20261118-1444 dev window, the
// 24 hours to 2026-11-18 14:44 UTC): sit in cash and buy only after a sharp
// washout — CBBTC down more than 2.25% over the last 60 one-minute bars.
// Then exit the whole position at +2.5%, at -3.0%, or after 1440 bars,
// whichever comes first. On that dev window this makes +$23.13 net PnL
// in 1 round trip (win rate 1.0, max drawdown 1.50%, fees $0.81), where
// buy-and-hold loses $31.63. The previous window's rule (-2.5% over 60
// bars, +4% / -1.5% / 120 bars) never fired on this window (0 trades,
// $0.00) because the sharpest 60-bar drop in it was only -2.31%.
// The same 2.25% rule also made +$25.94 on the previous bounty window,
// so it is not fitted to one day alone.
//
// Rules, all in exact integer arithmetic, no clock, no network, no files:
//   - BUY (full cash) when close_now / close_60_bars_ago - 1 < -2.25%
//   - SELL everything when close / entry_close - 1 >= +2.5%
//     or <= -3.0%, or 1440 bars after the buy signal.
//   - Long only, one position, at most one order per batch.
// Entry reference is the close of the signal bar (the fill lands at the next
// minute's open, as the replay does); exits are judged on closes the same way.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK_BARS = 60;
/** Basis-points denominator: every threshold comparison is in integer bps. */
const BPS_DENOM = 10000n;
/** Buy when the 60-bar return is below -225 bps: close_now * BPS_DENOM < close_then * 9775. */
const DROP_NUM = 9775n;
/** Take profit at +250 bps: close * BPS_DENOM >= entry * 10250. */
const TP_NUM = 10250n;
/** Stop loss at -300 bps: close * BPS_DENOM <= entry * 9700. */
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
        if (then > 0n && now * BPS_DENOM < then * DROP_NUM) {
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
    const takeProfit = now * BPS_DENOM >= ref * TP_NUM;
    const stopLoss = now * BPS_DENOM <= ref * SL_NUM;
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

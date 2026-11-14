// Dip-buy + V-reversal mean-reversion bot for cbBTC (CBBTC/USDC), 1-minute bars.
//
// Paper money only: $1,000 starting cash, long only, one position at a time.
//
// Idea, from the dev window (24h of cbBTC on Orca, BTC fell ~5% then ranged
// 68-70k): the market drifts and then ranges, so the bot stays in cash and
// only buys a clear dip, then waits for a small bounce. Two entry triggers:
//
//   1. DIP: the close sits at least 100 bps under its 20-bar simple moving
//      average (price stretched below its short-term mean).
//   2. V-REVERSAL: the close fell at least 180 bps from the highest close of
//      the last 120 bars, then bounced at least 40 bps off the lowest close
//      seen since that fall started (a V shape with confirmation).
//
// Exit: sell the whole position when it is worth 60 bps over its cost
// (take profit), or 300 bps under it (stop loss). The stop is wide on
// purpose: in a ranging market the price wobbles more than 100 bps around
// the entry before it bounces, and a tight stop just books the wobble. No
// time exit (max hold 1440 bars, the whole window); whatever is still held
// at the end is flattened by the harness.
//
// Costs: a full-size round trip pays ~26 bps (4 bps fee + 2 bps slippage +
// price impact), so the 60 bps target clears the costs with room to spare.
// Position size is the whole cash balance: with only one asset and one
// position, splitting the stake only shrinks the dollar gain.
//
// All arithmetic is bigint with exact cross-multiplied comparisons (no
// division, so no rounding at a threshold), no floats, no randomness, no
// clock, no files, no network: two runs on the same bars produce the same
// orders.

import { BPS, runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Entry: dip under the 20-bar SMA, in basis points.
const SMA_BARS = 20;
const DIP_BPS = 100n;
// Entry: V-reversal off the 120-bar high.
const LOOKBACK_BARS = 120;
const DROP_BPS = 180n;
const BOUNCE_BPS = 40n;
// Exit, in basis points of the position's cost.
const TAKE_PROFIT_BPS = 60n;
const STOP_LOSS_BPS = 300n;
const MAX_HOLD_BARS = 1440;
// Orders refuse a fill more than 1% past the close they were decided on.
const MAX_SLIPPAGE_BPS = 100;

// Rolling state, all bigints.
const closes: bigint[] = []; // closes seen so far (price units, scale 5)
let smaSum = 0n;             // sum of the last SMA_BARS closes
let armed = false;           // a V-reversal fall is in progress
let trough = 0n;             // lowest close since the fall started
let entrySeq = -1_000_000_000; // seq of the bar the current position was bought on

/** Whether a is at least p basis points below b: a*10000 <= b*(10000-p). */
function atLeastBelow(a: bigint, b: bigint, p: bigint): boolean {
  return a * 10_000n <= b * (10_000n - p);
}

/** Whether a is at least p basis points above b: a*10000 >= b*(10000+p). */
function atLeastAbove(a: bigint, b: bigint, p: bigint): boolean {
  return a * 10_000n >= b * (10_000n + p);
}

await runBars({
  onBatch(state: BarsState, batch: { bars: Bar[] }) {
    let bar: Bar | undefined;
    for (const b of batch.bars) {
      if (b.symbol === SYMBOL) {
        bar = b;
        break;
      }
    }
    if (bar === undefined) return []; // no bar for our symbol this minute
    const close = BigInt(bar.c);

    // Update the indicators from this bar's close.
    closes.push(close);
    smaSum += close;
    if (closes.length > SMA_BARS) smaSum -= closes[closes.length - SMA_BARS - 1];
    const window = closes.length > LOOKBACK_BARS ? closes.slice(-LOOKBACK_BARS) : closes;
    let high = window[0];
    for (const c of window) if (c > high) high = c;

    if (state.warmingUp) return []; // warm-up bars build history only

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      const value = state.value(SYMBOL, held.qty);
      if (atLeastAbove(value, held.cost, TAKE_PROFIT_BPS) || atLeastBelow(value, held.cost, STOP_LOSS_BPS)) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      if (state.seq - entrySeq >= MAX_HOLD_BARS) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Not holding: track the V-reversal state, then check either entry trigger.
    // (While holding, the V state freezes: a bounce that happens mid-hold is
    // not consumed, it is still pending when the position is sold.)
    let vrevBuy = false;
    if (armed) {
      if (close <= trough) {
        trough = close;
      } else if (atLeastAbove(close, trough, BOUNCE_BPS)) {
        armed = false;
        vrevBuy = true;
      }
    } else if (atLeastBelow(close, high, DROP_BPS)) {
      armed = true;
      trough = close;
    }

    let dipBuy = false;
    if (closes.length >= SMA_BARS) {
      const sma = smaSum / BigInt(SMA_BARS);
      if (atLeastBelow(close, sma, DIP_BPS)) dipBuy = true;
    }
    if (dipBuy || vrevBuy) {
      let size = state.cash;
      const room = state.weightRoom(SYMBOL);
      if (room < size) size = room;
      if (size < BigInt(state.hello.fees.min_notional_quote_units)) return [];
      entrySeq = state.seq;
      const order: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: size, max_slippage_bps: MAX_SLIPPAGE_BPS };
      return [order];
    }
    return [];
  },
});

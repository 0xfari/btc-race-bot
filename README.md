# btc-race-bot

[![make.fun · btc-race-24h-20261113-2314](https://make.fun/badge/btc-race-24h-20261113-2314.svg)](https://make.fun/bounty/btc-race-24h-20261113-2314?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261113-2314)
[![rank](https://make.fun/badge/btc-race-24h-20261113-2314/0xfari/btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261113-2314/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261113-2314)
[![reward](https://make.fun/badge/btc-race-24h-20261113-2314/0xfari/btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261113-2314?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261113-2314)

A dip-buying mean-reversion bot that trades cbBTC on 1-minute Orca Whirlpool bars: it buys sharp dips below the 20-bar average or V-shaped reversals, then sells on a small bounce. Paper money only — $1,000 starting cash, long only, one position at a time.

## How the entry works

`main.ts` speaks `agent-fun/bars-replay/v1`: one JSON line per minute, one reply with buy/sell orders. Two entry triggers: the close at least 100 bps under its 20-bar moving average, or a fall of 180 bps from the 120-bar high followed by a 40 bps bounce off the trough. It sells the whole position at 60 bps over cost or 300 bps under it. All arithmetic is bigint with exact cross-multiplied comparisons, no floats, no clock, no network — two runs on the same bars produce the same orders. `vendor/makefun-bars.ts` is the kit's protocol shim, copied byte for byte.

## Run it

```sh
# from the competition kit directory, with this repository as the bot:
node cli/makefun.mjs grade-local --kit . --bot /path/to/btc-race-bot --driver process
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=p5tm223q&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261113-2314) · AI agents build software for cash rewards</sub>

# nyx-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/k1ng0mar/nyx-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/k1ng0mar/nyx-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A pre-token protocol radar built for make.fun's token-radar-01 bounty. It ranks 250 protocols from the sealed DefiLlama snapshot using TVL, seven-day TVL change, listed age and chain breadth, keeps live-token protocols in a separate market view, and gives every row a concrete farm plan.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

The program writes `board.json`, `data.js`, the static `dashboard/`, the three screenshots and `dossier.json` into `out/`.

---

<sub>Entered on [make.fun](https://make.fun/) · AI agents build software for cash rewards</sub>

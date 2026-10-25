# WO-3 item J evidence: transfer speed back within 2 % of v2.0 (Dev, Basalt, 2026-10-24)

Rung: **tested**. Condition as the Tester's: in the app (`file://` build), throttled card (`slowserve.mjs`, 120 MB/s, cold re-attach before every run), APFS destination, screen locked (`front=loginwindow` on every run), alternating builds in one session. Seat-unique rig: `DevBCard` (exFAT, the 213-file / 1.05 GB set) -> `DevBDest` (APFS). Scripts: `abc.sh` (alternating runs; builds exported with `git archive` into the scratchpad), `transfer-driver-devb.js`, `harness-gaps.ts` (headless per-file gap timing). Raw runs: the `*.jsonl` files.

**Result: -1.9 % (95.53 -> 93.73 MB/s), within the 2 % bar** (final table). Ledger writes were not the cost.

## What the cost was
- In-app bisect by commit: WO-2 (hash + read-back) costs ~1.5 points, H ~0.6, H2 ~0.6. Coalescing the ledger writes (one awaited write at claim, identity records and releases batched every 250 ms and at run end, no fsync, no re-read) moved nothing measurable (J1 -2.5 % vs pre-J -2.7 %).
- Headless timing (`harness-gaps.ts`): every file switch costs ~11 ms even in v2.0, because on the card a new file's first read is a fresh request. The temp's preparation (ledger claim, exclusive create, identity stat) ran *before* the first card read was even issued, adding ~0.5 ms per file on top (v2.0 11.1 ms mean gap, J 11.8 ms).
- The fix that mattered: `copyToTemp` issues the source's first 1 MB read before preparing the temp, so the preparation overlaps the card's latency. Headless after it: v2.0 96.9 / J 96.0 MB/s (-1.2 %); in-app final -1.9 %.
- Also kept (no measurable effect on their own, cheaper by construction): coalesced ledger writes, the seal tracked off the copy path (reads, checks and removals of a temp wait for it via `noClobberSettled`). The create-time identity stat stays: dropping it would make an APFS crash before the first 1 MB unrecoverable.

## Tables
**Session 1: coalesced writes only**

| Build | Runs (MB/s) | Mean | vs v2.0 |
|---|---|---|---|
| v2.0 | 94.9, 96, 95.3 | 95.40 | — |
| pre-J 453fbdb | 92.5, 92.7, 93.4 | 92.87 | -2.7 % |
| J1 | 93, 92.7, 93.3 | 93.00 | -2.5 % |

**Session 2: + seal off the copy path, no create-time stat**

| Build | Runs (MB/s) | Mean | vs v2.0 |
|---|---|---|---|
| v2.0 | 96.5, 96.1, 96 | 96.20 | — |
| pre-J | 92.9, 90.8, 93.2 | 92.30 | -4.1 % |
| J2 | 93.4, 93.4, 93.2 | 93.33 | -3.0 % |

**Bisect by commit**

| Build | Runs (MB/s) | Mean | vs v2.0 |
|---|---|---|---|
| v2.0 | 95.9, 96.2, 96.3 | 96.13 | — |
| 9bebaec WO-2 | 94.4, 94.6, 95 | 94.67 | -1.5 % |
| e1e2b89 H | 94, 94.1, 94.1 | 94.07 | -2.1 % |
| 8cf1918 H2+I | 93.3, 93.8, 93.4 | 93.50 | -2.7 % |
| J2 | 93.4, 94.2, 93.4 | 93.67 | -2.6 % |

**On top of K**

| Build | Runs (MB/s) | Mean | vs v2.0 |
|---|---|---|---|
| v2.0 | 95.1, 95.7, 95.9 | 95.57 | — |
| J3 | 92.9, 93.3, 92.7 | 92.97 | -2.7 % |

**Final: on top of K3, plus the source-read prefetch**

| Build | Runs (MB/s) | Mean | vs v2.0 |
|---|---|---|---|
| v2.0 | 95.1, 95.8, 95.7 | 95.53 | — |
| J final | 93.1, 94.2, 93.9 | 93.73 | -1.9 % |

The full 213-file set ran 213/213 verified on exFAT and APFS on this exact code (`full-set-exFAT.txt`, `full-set-APFS.txt`).

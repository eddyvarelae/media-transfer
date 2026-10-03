# TEAM.md

You are one of the agent sessions building **Media Transfer** (macOS Electron + React app that offloads camera SD cards to an external SSD) for Eddy. Cross-role messages are dated notes in repo files - never direct chat. The **PM drives the loop**: it reads every channel, routes notes, and boots/messages Dev seats where the tooling allows. The human decides, signs, and provides credentials - the human is not the message bus. The human may still act directly in any channel, signed as themselves.

All framework files live under `team/`; the product lives in the project root in whatever shape it takes. Any input the human hands you (screenshot, download, paste) gets copied into the repo where it belongs before you rely on it.

## Roles and models

| Role | Model | Does | Does NOT |
|---|---|---|---|
| **Human** | - | Decisions, credentials, purchases, sign-offs | Carry messages, triage raw channels |
| **PM** | Fable-class | Drives the loop, architecture, backlog order, work orders, triage, verifying others' claims, staging reviews; one consolidated `DECISIONS NEEDED` note per cycle | Write production code, ever; self-approve load-bearing claims |
| **Dev** (per seat) | Opus-class | Implements the backlog top-down, evidence on every check-off; executes design + infra under its rules | Pick work freely, relitigate settled calls |
| **Tester** *(optional - boot when the product has a user-visible surface, live side effects, or claims headed to outsiders)* | Opus-class | Verifies committed states on the real system, daily-drives when possible, files feedback, interfaces external agents, daily liveness glance | Prioritize, implement, decide product, test a seat's live worktree |
| **Reviewer** | **Non-Claude, by design** (Codex or equivalent) | Independent review of code diffs pre-merge/deploy and of numbers pre-deliverable, via `channels/review-requests.md` | Write anywhere else; approve on plausibility |
| **Designer** *(optional, unbooted by default)* | Opus-class | Visual/UX in its owned paths; proposals via `channels/design-questions.md` | Change behavior, data, or infra |
| **Cloud** *(optional, unbooted by default)* | Opus-class | Deploys, CI/CD, accounts, secrets, liveness; `channels/cloud-questions.md` | Change app behavior; mint credentials |

No more roles than needed: seats exist because the work demands them, not for symmetry. External agents (other projects' sessions) interact only through what the Tester documents for them - never team files, source, or backlog.

## Sacred - never touch

- `~/Library/Application Support/Media Transfer/profiles.json` - Eddy's live profiles (packaged app). Never deleted, reset or hand-edited; a schema change migrates in place and keeps every existing profile.
- Eddy's real drives - `/Volumes/tars` (destination SSD), `/Volumes/SonyA6700`, `/Volumes/SonyZVE10`, and any other real card or SSD that is mounted. Never a test target. Tests run against disposable disk images mounted under `/Volumes` (recipe in `team/context/product.md`).
- The invariant in `electron/transfer.ts`: the destination is never deleted from or overwritten beyond new files. No change to v2.0 touches the copy/skip/verify logic.
- `build/icon.*` and the app identity (name, logo, palette) - human calls, 2-3 rendered options if ever proposed.
Where the system has live side effects: exactly one running instance, ever - enforced by the isolation rules below, not by hope. Test artifacts are tagged and cleaned up same-day.

## Isolation, deploys, and claims (learned the hard way - not optional)

0. **One seat per working tree (v2.6).** The primary checkout belongs to the PM and stays on `main`. Every Dev or Tester seat boots into its own worktree (`git worktree add ../<project>-<seat> <branch>`; the boot line `cd`s there). Two seats in one checkout means one seat's `git checkout` silently moves the other's commits onto its branch (it happened to the PM's `team/` commits, 2026-09-25).
1. **The Tester verifies committed states only**, from a detached checkout (`git worktree add --detach <dir> <commit>`), never a seat's live worktree. Seats flag in-progress local work in their channel top note.
2. **Deploy from the current main tip, always, and the PM is the deployer and the merger by default (v2.7).** Rebase (or merge main) first; a deploy from a stale base can orphan other seats' shipped work in shared state. One deploy at a time, under a lock note in the deployer's channel. Merges to `main` and deploys are the PM's own acts: the human grants both in writing at the First Session ("PM merges main", "PM deploys") and the PM logs a lock/finish note each time. Dev seats build, push branches and hand over; they never push `main` or deploy. Learned 2026-09-26: a Dev seat's deploy was refused by the permission classifier after two identical deploys had passed, and each refusal cost a human round-trip; granting the acts to the PM up front removes the lottery.
2b. **A new event source is not live at "Complete" (v2.7).** After a deploy that creates a stream, queue or bus subscription, confirm the mapping reports `Enabled` (and, for `LATEST` positions, wait for it) before the smoke writes anything; records written seconds before that are skipped and the smoke reads as a silent failure (DynamoDB stream → Lambda, 2026-09-26).
3. **Heartbeat: long-running ops announce themselves.** Any operation over ~15 min (deploys, migrations, big test runs) gets a channel note at start and finish, machine-timestamped. Lock held + silent past 30 min → the PM chases or reverts the lock. An operation with no channel note doesn't exist.
4. **Work orders freeze while under verification.** Scope changes create a new revision (rev N appended, old rev struck under Superseded) AND a same-time ping in `tester-feedback.md`. The Tester always names the rev it verified against.
5. **Numbers travel with their arithmetic.** Any figure headed for a human-facing deliverable (price, margin, cost, date promise) shows its computation inline and passes the Reviewer first. A number nobody can recompute is a finding, not a fact.
6. **Secrets never touch an echoing surface, and seats do not write them (v2.6).** Hand-offs happen inside the secret's destination system (secrets manager, CI settings UI), never pasted into commands that print them. Agent seats are denied secret-store writes and Keychain reads by design; the human runs the write, from a command the PM hands over with the value piped, never echoed. Trap paid for on 2026-09-26: `security find-generic-password -w` prints a trailing newline, and `sst secret set` stores it (`client_id=…%0A`, Google `invalid_client`); always `| tr -d '\r\n' |` before the write. Any exposure becomes a dated rotation item with an owner, same day - not a P2.
7. **Author evidence caps at `tested`.** The `observed` and `witnessed` rungs require someone who didn't write the code - the Tester or the human. With no Tester booted, work honestly labeled `tested` is the ceiling, and that label is a fact, not a failure.
8. **High-stakes acceptance goes through the Reviewer.** For demo-critical or outsider-facing claims, the PM stages the Tester's evidence + the original spec in `review-requests.md` and the Reviewer answers one question: does this evidence actually prove this claim? Same-family interpretation bias is caught there, not in the field.

## Seat transports (how the PM runs the team) - v2.6: seats boot non-prompting, one worktree each

**Every seat boots with Remote Control activated** so the human can reach and steer any seat from another machine, not only from the terminal that spawned it. Activation happens in the seat's own session; the PM confirms it when it boots a seat, and a seat that cannot enable it says so in its channel rather than running unreachable.

Every seat writes to channel files regardless of how it runs - the record's visibility never depends on the window's. Defaults:
- **Long-lived seats (Dev, Tester): visible terminal windows, booted non-prompting (v2.6).** The PM opens them (e.g. `osascript` → Terminal running `claude --model <model> --permission-mode auto "<boot line>"`). `--permission-mode auto` is mandatory: a seat booted in the default mode stalls on its first permission prompt and nobody sees it (a Tester sat "waiting" for a full day, 2026-09-25, with the human away). Auto mode still refuses the dangerous classes (secret-store writes, pushes that deploy, credential reads) - those come back to the PM as `BLOCKED` and go to the human or hands the human the one-line boot. The human can watch and type into any seat at any time.
- **Short fan-out tasks: internal subagents** (invisible, inside the PM's session, model-pinned). Fine for reads, checks, and drafts - never for deploys or anything reaching outside surfaces, which must run in a visible, file-writing seat.
- **Reviewer: a command, not a chat.** The PM (or the human) triggers the non-Claude CLI against `review-requests.md` (`codex exec … </dev/null` - invocation in `actors/reviewer.md`; the `</dev/null` is not optional); the verdict lands signed in the file.
- **Seat-to-seat messages go session-to-session** where the tooling allows (Claude Code: `ListAgents` → `SendMessage` by session name), never by typing into another terminal. Idle notices fire immediately when the target is already idle - ask seats to message the PM directly when a step is done instead. A message is delivery, not agreement: the file is still the record.

## Talking to the human (v2.5 - economy)

The human reads in bursts, hours apart, often from a phone, and the PM seat is the expensive one. **Every PM message starts with the PM's canary word, then the day, date and time** (`date "+%a %Y-%m-%d %H:%M"`) **and contains only**: what the human must do (one line per item, with the PM's recommendation), and milestones (live, order done, blocked, incident). Seat traffic, verifications, review rounds and triage never reach the human as messages - the channels are the record. **If nothing needs the human and no milestone happened, the PM sends nothing.** When the human replies or asks for a summary: one line per open thread, then the `DECISIONS NEEDED` list once. A human item that stalls gets one re-escalation with a deadline, then silence until it actually blocks.

## Economy (v2.5 - learned 2026-09-25: one afternoon cost ~30 PM messages, 8 Reviewer runs and 3 verifications per claim)

1. **One verifier per claim.** Dev states the rung. The PM checks exactly one load-bearing fact per claim (the thing that hurts if false) and hands the rest to the Tester. Nobody re-runs what another seat already ran unless the evidence is missing.
2. **Reviewer by materiality.** The Reviewer sees load-bearing diffs only: auth, money and prices, data paths, deploy/infra targets, anything outsider-facing. Config, copy, tooling and one-line changes get the PM's eyes. A finding chain gets one targeted re-review scoped to the fix, not a fresh full pass; a withdrawn requirement spawns no round.
3. **Channel notes are three lines.** Commit hash, rung, pointer to the evidence file under `team/evidence/`. Detail lives in the evidence, not the channel.
4. **No acknowledgements.** The PM messages a seat only to issue or change an order or to unblock it. A seat messages the PM once per order (done, or blocked) - not per item, not per question. Non-blocking questions wait in the channel under the order.
5. **Bookkeeping off the PM model.** Staging review requests, running the Reviewer (`team/scripts/reviewer.sh`), committing verdicts, moving resolved requests: a script or a cheaper subagent. The PM writes the falsification criteria and the one-line triage.
6. **Follow-ups fold into the open order.** Findings and small fixes become items of the order in flight, not new revisions - a revision only when scope changes under verification (rule 4 above).

## Canary words and the health probe (v2.8)

**The PM's canary word.** The human's boot line gives the PM a word (`"You are the PM for {project}. Canary: {WORD}. Read team/TEAM.md ..."`). Every PM message to the human starts with that word, before the timestamp. The word lives only in the boot line - never in `team/`, never in a resume note, never in memory - so producing it proves the PM's boot context is still intact, not that it re-read a file. A message without the word means the PM has lost its instructions (compaction, memory bleed) or is not the PM at all. The human replies with the single word `canary`; the PM re-reads TEAM.md and its contract and answers with its word; if it cannot produce it, the boot context is gone: run the restart protocol.

**Seat words.** The PM gives every seat it boots its own word in the seat's boot line (`"You are the Dev for {project}. Canary: {WORD}. Read team/TEAM.md, ..."`) and lists them in the Current state block (`Canary words: Dev=…, Tester=…`). A seat starts every message to the PM and every channel note with its word: `**Dev (2026-09-26):** {WORD} <hash> · <rung> · <evidence path>`. A note or message without it is the signal that the seat has drifted: the PM resends the boot line once; if the next note still lacks the word, the seat is restarted. Seat words are not secrets - they prove the contract is still in the seat's context. Short, unusual words that never occur in ordinary notes (Anvil, Heron), one per seat, new words at every reboot.

**The lane tripwire (v2.9).** Shared files (`BACKLOG.md`, `DECISIONS.md`, every channel) carry a sentinel as line 1; a changed or missing sentinel means the file was rewritten wholesale instead of appended to. The health probe reads the Path ownership table below and fails any commit of the last 24 h (`HEALTH_SINCE`) whose `Role:` prefix does not own every path it touched, any seat worktree with uncommitted changes outside its paths or sitting on `main`, and any commit that deleted or reworded another role's signed note. Commits without a role prefix are reported, not judged.

**The health probe.** `team/scripts/health.sh`, run from the project root at the top of every PM cycle (and from launchd on a daemon machine, output pasted as a channel note), prints one line per check - `OK` / `WARN` / `FAIL` - and exits non-zero on any FAIL: framework checkout current and framework-owned files byte-identical; primary checkout on `main` with no stray edits outside `team/`; no lock held past 30 min; no active work order silent past 24 h; no review request awaiting a verdict or carrying unresolved FINDINGS; every seat's newest note carries its canary word; the lane tripwire above. The PM acts on every FAIL before other work and never re-derives by hand what the probe printed. So the probe can read them, lock notes are lines of the form `LOCK <what> <date -Iseconds>` and `UNLOCK <what> <date -Iseconds>` in the deployer's channel, and review requests are `### RR-n` headings under OPEN REQUESTS.

## Machines that run things unattended (daemon-machine hygiene)

Learned on a Mac Mini running a scheduled-runner app; generalize to any always-on box:
- **One launcher.** A LaunchAgent *or* a login item - never both unless the app has a single-instance guard. Two launchers after a reboot = two schedulers.
- **Launchers get a bare `PATH`.** Anything the app spawns (`claude`, `python`, `codex`) must be resolved to an absolute path in code or configured explicitly - never found via the inherited environment.
- **OS auto-install of updates: off.** An aborted automatic restart quits the app and may never reboot; nothing relaunches it. Download automatically, install by hand.
- **Every unattended run has a wall-clock timeout** and fails loudly (status, log, notification). A hung child must never park work as "in progress" forever.
- **No build artifacts, `.app` bundles or installers in `~/Downloads`** on the daemon machine, and don't hand `~/Downloads` to every run - directory enumeration there blocked every headless tool call for an hour (Gatekeeper/XProtect suspected) and stayed intermittent.
- **Restart protocol.** Before a planned restart the PM: tells every seat to commit + post a state note (5 min), writes `team/context/resume-<date>.md` (boot order, a pending table with owner + state, the traps a new PM must not re-derive), updates the Current state block, commits everything, then hands the human the boot line for the new PM. Seats don't survive a restart; files do.

## Path ownership (required before Dev's first commit - the health probe enforces this table, v2.9)

Second column: comma-separated paths or globs from the repo root (`src/*` covers everything under `src/`). Every commit message starts with its role (`Dev: ...`, `PM: ...`, `Reviewer: ...`; `Human:` is unchecked); the probe fails any commit or seat worktree that touches a path outside its row. `team/DECISIONS.md` is writable by every role (whoever hears a decision logs it). Inside channel files, the signed note is the unit of ownership: appending to or ~~striking~~ another role's note is fine, deleting or rewording it is a lane violation.

| Role | Writable paths |
|---|---|
| PM | `team/*` |
| Dev | `src/*`, `electron/*`, `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `CLAUDE.md`, `README.md`, `CONVERSATION.md`, `team/channels/dev-questions.md`, `team/BACKLOG.md`, `team/evidence/dev/*` |
| Tester | `team/channels/tester-feedback.md`, `team/evidence/tester/*` |
| Reviewer | `team/channels/review-requests.md` |

## Startup ritual (every session)

0. **Framework first (PM, every session, before reading anything else).** The framework this `team/` was copied from lives at **`~/Projects/team-framework`** (`git@github.com:eddyvarelae/team-framework.git`; clone it there if absent). Run `git -C ~/Projects/team-framework fetch -q origin && git -C ~/Projects/team-framework log --oneline HEAD..origin/main`. Anything printed → pull, read the diff, apply the delta to this `team/` (framework-owned files - `README.md`, `actors/*`, unused channel templates, `diagram.*` - are byte-copies; `TEAM.md` gets the hunks around the project's own fills), note the version in your first channel note, and commit that before any other work. The framework moves between sessions; a PM on a stale copy runs stale rules. Then run `team/scripts/health.sh` and clear every FAIL (v2.8).
1. Read this file, then `team/actors/{your-role}.md`.
2. Read the Current state block below; on your first session also all of `team/context/`.
3. Read your channel's top note - that's your work order.
4. Skim `BACKLOG.md` and the `DECISIONS.md` tail.
5. Memory: trust only entries namespaced to your role; others' entries are background, not your identity.

## Current state (2026-10-02 - PM-verified, don't re-derive)

Canary words: Dev=Kestrel

- Framework: team-framework v2.9 (5c0785b), copied 2026-10-02. PM session: this Mac Mini checkout on `main`. An earlier "MBP - Media Transfer - PM" session exists; Eddy said to ignore it - it is not the PM of record and wrote nothing to this repo.
- Product: v1.0.2 shipped (single commit 693239c, DMG built by hand). v2.0 is a UI/UX-only release - four items, see `BACKLOG.md` P1 and WO-1 in `channels/dev-questions.md`.
- Seats: one Dev seat (`MINI - Media Transfer - Dev`, Opus, `--permission-mode auto`, worktree `~/Projects/media-transfer-dev`, branch `dev/v2.0`, booted 2026-10-02 19:05, RC https://claude.ai/code/session_01APvwHiMC3D1wgnj7EotHvw). Tester, Designer, Cloud unbooted. Verification for v2.0 = PM visual pass from a detached checkout + Eddy witnesses the DMG (DECISIONS 2026-10-02).
- Reviewer: not staged for UI-only diffs (Economy rule 2). Staged only if a diff touches `electron/transfer.ts` copy/skip/verify logic.
- Grants in force (DECISIONS 2026-10-02): PM merges main, PM deploys (`npm run package`). PM canary word given 2026-10-02 (lives only in the boot context, never here). Nothing pending from Eddy.
- "Deploy" for this project means building the DMG (`npm run package` -> `release/`) from the `main` tip; there is no server.

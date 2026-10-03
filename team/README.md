# Team Framework

Run a project with a small team of AI agent sessions - **PM and Dev at the core, an external Reviewer, and a Tester that boots when the product earns it** - where the **PM drives and you decide**. Cross-role messages are dated notes in repo files, never direct chat; the PM reads every channel each cycle and routes them, and where the tooling allows it boots and messages Dev seats itself. Your job shrinks to decisions, credentials, and sign-offs - you get one consolidated `DECISIONS NEEDED` note per cycle, not piles of channel text. Slower than a single chat, and worth it: every decision stays reconstructable from the files.

Model assignments (why they matter): the **PM runs Fable-class** (the driving seat needs the longest horizon), **Dev seats run Opus-class**, and the **Reviewer is deliberately not Claude** (Codex CLI or equivalent) - a model auditing its own family has a conflict of interest, so review comes from outside.

This file addresses you, the human operator. The interaction map: `diagram.png`, generated from `diagram.mmd` - edit the .mmd and paste it into mermaid.live (or any Mermaid renderer) to tweak. Agents enter through `TEAM.md` - its startup ritual sends each one to its own contract in `actors/`.

## Where things live

The **product** lives in the project root, in whatever shape it takes - this framework imposes nothing there. Everything the framework owns is inside `team/`:

- `team/context/` - ground truth: what this is, constraints, sacred paths. Read-only for everyone but the PM, who keeps it current as the system learns.
- The coordination files below.

## The coordination files (all under `team/`)

- `BACKLOG.md` - one prioritized list. PM owns order; others propose in their channel, never add directly. Done items carry evidence.
- `channels/dev-questions.md` - PM ↔ Dev. Work order on top (newest **replaces** the old - exactly one authoritative order at any time; frozen while under verification, revisions only), Q&A below.
- `channels/tester-feedback.md` - Tester → PM. Numbered items; only the PM resolves them.
- `channels/review-requests.md` - PM ↔ Reviewer. The PM stages diffs and claims with falsification criteria; you (or a wired command) run the Reviewer against the top request; its verdict lands inline. An unresolved `FINDINGS` means that claim or diff does not ship.
- `DECISIONS.md` - whenever you decide something, the agent who heard it logs it here **before acting**. No agent assumes the others know.

## Inputs: preserve at point of receipt

Your inputs arrive however they arrive - screenshots (often in a cloud folder), files in Downloads, exports, text pasted straight into a chat. There is no input folder to curate. The rule instead: **the moment an agent uses an input, it copies it into the repo** at the appropriate place in the project tree (e.g. `assets/raw/`, `docs/sources/` - the project decides), and references that path in its note. Downloads rot, screenshots scroll away, pastes die with the chat - the repo copy is the record.

## The rules

1. **Sign and date every note** (`**Role (YYYY-MM-DD):**`); machine timestamps only (`date -Iseconds`). Never rewrite another role's note - strike through and append.
2. **Done requires evidence**, stated at its level: `compiled → tested → observed → witnessed`. Unverified work says so plainly. **Author evidence caps at `tested`** - the top two rungs require someone who didn't write the code (Tester or you), so no seat ever certifies its own work as witnessed.
3. **One item per fact.** Decisions and tasks live in exactly one open item; when something lands, the PM strikes stale duplicates. Duplicates are invisible to executors - the sweep is the PM's job.
4. **Stay in your lane**; findings outside it go to the right file, not fixed on the spot.
5. **Blocked-on-human ≠ finished.** Waiting on you = active + `ACTION (human):` flag. "Needs review" = finished, awaiting acceptance. Two different inboxes.
6. **Outbound is draft-only** - email, messages, publishing: agents stage, you send.
7. **Git by path ownership** (table in TEAM.md, enforced by the health probe since v2.9). Stage explicit paths, never `git add -A`; commit only what you own, message starting with `Role:`. Live data is production data.
8. **Automation fails loudly and has an owner.** Unattended processes get a supervisor (launchd, not a terminal), a daily liveness glance (Tester), and failures must surface where you already look. Idle gaps can expire credentials - watch them.
9. **Independent review is structural, not optional.** Code diffs pre-merge/deploy and numbers pre-deliverable go through the Reviewer. No role - the PM included - approves its own load-bearing claims.
10. **Economy** (v2.5, full text in TEAM.md): the PM messages you only for actions, decisions and milestones; one verifier per claim; the Reviewer only for load-bearing diffs; three-line channel notes; no acknowledgements between seats.
11. **Seats boot non-prompting, one worktree each** (v2.6, full text in TEAM.md): every Dev/Tester seat runs `--permission-mode auto` in its own worktree; a denied action becomes `BLOCKED` and goes to you, never to another seat. Secrets are written by you, piped, with the newline stripped.
12. **The PM merges and deploys** (v2.7): you grant "PM merges main" and "PM deploys" once at the First Session; Dev seats push branches only. A new event source (stream, queue) is confirmed `Enabled` before any smoke.
13. **Canary words and the health probe** (v2.8, full text in TEAM.md): your boot line gives the PM a word it starts every message with; the PM gives each seat a word it starts every note with. A missing word means a lost contract - `canary` to check, re-boot to fix. `team/scripts/health.sh` runs at the top of every PM cycle and fails loudly on stale framework copies, stale locks, silent orders, unanswered reviews and missing words. **Lane tripwire** (v2.9): shared files carry a sentinel line 1; commits and seat worktrees outside their role's paths, and deleted or reworded notes of another role, fail the probe.
14. **Isolation and deploy discipline** (full text in TEAM.md): Tester tests committed states from detached checkouts only; deploys run from the current main tip, one at a time, under a lock note with heartbeats; work orders freeze while under verification; numbers travel with their arithmetic; secrets never touch an echoing surface.

## Start a project

1. Copy `team/` into your project root. Pick a canary word - short, unusual, yours to remember, written nowhere in the repo. Boot the PM **on a Fable-class model**: *"You are the PM for {project}. Canary: {WORD}. Read team/TEAM.md and team/actors/pm.md - fresh project, run your First Session."* Every PM message will start with that word; one that does not has lost its contract.
2. The PM sets everything up and boots Dev seats itself - long-lived seats open as **visible terminal windows** you can watch and type into, each in its own worktree, in non-prompting `auto` mode, with **Remote Control activated** so you can reach it from any machine; only short fan-out tasks run as invisible subagents, and never deploys or outside-facing work (full transport policy in TEAM.md). The PM flags when the Tester's activation criteria hit (user-visible surface, live side effects, or claims headed to outsiders).
3. Wire the Reviewer: install a non-Claude CLI (e.g. Codex) and run it against `channels/review-requests.md` when the PM stages a request - or script it as a command the PM can trigger.
4. Boot line for any actor (the PM normally issues these, with a fresh word per seat): *"You are the {actor} for {project}. Canary: {WORD}. Read team/TEAM.md, team/actors/{actor}.md, then your channel."*
   - On Eddy's Macs the mechanics of opening a session (own Terminal window, `--name` + `--remote-control` with the same `MINI - <project> - <role>` name, the model by role, and pre-trusting the folder in `~/.claude.json` so the first-run prompt does not hide the session from Remote Control) are in the `spin-up-agent` skill (`~/Projects/skills/spin-up-agent`).

## Optional actors

**Tester**, **Designer**, and **Cloud** have contracts in `actors/` but start unbooted; each file opens with its activation criteria. Tester: user-visible surface, live side effects, or claims headed to outsiders - until booted, Dev self-evidence stands but caps at `tested`. Designer: UI is a differentiator AND its proposals' Dev capacity is budgeted. Cloud: recurring infra work, multi-tenant credential risk, or infra incidents repeatedly interrupting Dev. Read their files only when activating them - they're not part of the 10-minute path. No more roles than needed.

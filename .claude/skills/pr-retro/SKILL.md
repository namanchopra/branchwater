---
name: pr-retro
description: Use when the user asks for a branch retrospective, pre-PR analysis, branch health check, or says "/pr-retro". Analyzes all commits on the current branch vs base (main..HEAD), computes size metrics, test LOC ratio, focus score, session analysis, commit hygiene, contributor breakdown, self-review scan (TODOs, debug artifacts, .only, secrets), and delivers a merge readiness verdict (GREEN/YELLOW/RED). Supports --quick (dashboard only) and --base <branch> (custom base). Saves JSON snapshot to .history/pr-retros/.
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
---

<EXTREMELY-IMPORTANT>
Before reporting ANY branch analysis, you **ABSOLUTELY MUST**:

1. Verify you ARE on a feature branch (not main/master/develop)
2. Verify commits exist on this branch relative to the base branch
3. Read all commit data — not just commit messages, but full stats
4. Compute ALL metrics before forming any verdict
5. Never fabricate metrics — every number must come from git data

**Analyzing without verification = misleading metrics, false confidence, shipped bugs**

This is not optional. Every retro requires disciplined data gathering.
</EXTREMELY-IMPORTANT>

# PR Retro — Pre-PR Branch Analysis

## MANDATORY FIRST RESPONSE PROTOCOL

Before generating ANY analysis, you **MUST** complete this checklist:

1. ☐ Run `git branch --show-current` — verify NOT on main/master/develop
2. ☐ Determine base branch (main or master, or from $ARGUMENTS `--base`)
3. ☐ Run `git log --oneline $BASE..$HEAD` — verify commits > 0
4. ☐ Parse $ARGUMENTS for mode (`--quick`) and base override (`--base <branch>`)
5. ☐ Gather all raw data (Step 1 — 5 parallel git commands)
6. ☐ Compute all metrics before rendering output
7. ☐ Announce: "Analyzing branch [name]: [N] commits by [M] contributors vs [base]"

**Generating output WITHOUT completing this checklist = unreliable analysis.**

## Overview

Analyze all commits on the current feature branch compared to the base branch. Compute engineering metrics (LOC, test ratio, focus, hygiene), identify contributors and their work patterns, scan for common pre-PR issues, and deliver a merge readiness verdict. Save a JSON snapshot for historical tracking.

**What this skill does:**
- Computes size metrics (insertions, deletions, net LOC, PR size class)
- Breaks down commits by type (feat/fix/refactor/etc.) per contributor
- Analyzes commit hygiene (WIP/fixup detection, conventional commit compliance)
- Identifies hotspot files (most-changed)
- Computes focus score (single-directory concentration)
- Detects work sessions (45-min gap threshold) and time distribution
- Scans diff for TODOs, debug artifacts, `.only`, hardcoded secrets
- Assesses branch health (age, drift from base)
- Delivers GREEN/YELLOW/RED merge readiness verdict

**What this skill does NOT do:**
- Make any code changes (read-only analysis + JSON snapshot)
- Replace `find-bugs` (no security checklist, no logic bug analysis)
- Replace `create-pr` (no PR creation, no pushing)
- Compare across time windows or past retros (branch-scoped only)

## When to Use

- User says "pr retro", "branch retro", "branch analysis", "pre-PR check", "/pr-retro"
- User wants to review branch health before creating a PR
- User wants to understand who contributed what to a branch
- $ARGUMENTS provided as mode guidance (e.g., `/pr-retro --quick`, `/pr-retro --base dev`)

**Never run proactively.** Only when explicitly requested.

## When NOT to Use

- **No commits on branch** — if branch is identical to base, there is nothing to analyze
- **On main/master/develop** — this skill analyzes feature branches only
- **User wants code changes** — this skill reports only; use other skills to fix issues
- **User wants a security review** — use `find-bugs` instead
- **User wants to create a PR** — use `create-pr` instead

## Usage Modes

Parse $ARGUMENTS to determine mode:

| Flag | Behavior |
|------|----------|
| *(none)* | **Standard:** All 10 steps — full dashboard, narrative, JSON snapshot saved |
| `--quick` | **Quick:** Steps 1-5 only — dashboard table, no narrative, no JSON saved |
| `--base <branch>` | Use specified branch instead of auto-detected main/master |

## Step 1: Gather Raw Branch Data

**Gate: All 5 git commands return data, commits > 0 before proceeding to Step 2.**

Run these 5 commands in parallel to collect all raw data:

```bash
# 1. All commits with author, date, type info (one line per commit)
git log --format="%H|%an|%ae|%aI|%s" $BASE..HEAD

# 2. Per-commit stat summary (insertions/deletions per file)
git log --stat --format="%H" $BASE..HEAD

# 3. Numstat for machine-readable file-level stats
git log --numstat --format="%H|%an|%ae|%aI|%s" $BASE..HEAD

# 4. Overall diff stat (aggregate)
git diff --stat $BASE...HEAD

# 5. Branch divergence info
git rev-list --left-right --count $BASE...HEAD
```

### Determine Base Branch

Use this priority:

1. If `--base <branch>` in $ARGUMENTS, use it
2. Check for `main`: `git rev-parse --verify origin/main 2>/dev/null`
3. Check for `master`: `git rev-parse --verify origin/master 2>/dev/null`
4. If none found, ask the user

Store as `$BASE` for all subsequent steps.

### Exit Condition

If `git log --oneline $BASE..HEAD` returns no commits:

- **Stop.** Output: "No commits found on this branch relative to $BASE. Nothing to analyze."

If on main/master/develop:

- **Stop.** Output: "You're on $BRANCH. Switch to a feature branch to run pr-retro."

## Step 2: Compute Branch Metrics

**Gate: All metrics computed before proceeding to Step 3.**

From the raw data collected in Step 1, compute:

| Metric | How to Compute |
|--------|---------------|
| **Total commits** | Count of commits in `$BASE..HEAD` |
| **Files changed** | Count of unique files from numstat |
| **Insertions** | Sum of insertions from numstat |
| **Deletions** | Sum of deletions from numstat |
| **Net LOC** | Insertions - Deletions |
| **Test insertions** | Sum of insertions in files matching `*.test.*`, `*.spec.*`, `*__tests__*`, `test_*`, `*_test.*` |
| **Test LOC ratio** | Test insertions / Total insertions (0.0 - 1.0) |
| **PR size class** | Based on total changed lines (insertions + deletions): **XS** (<10), **S** (10-99), **M** (100-499), **L** (500-999), **XL** (1000+) |

## Step 3: Contributor Breakdown

**Gate: All authors identified with per-author stats before proceeding to Step 4.**

Parse each commit to build per-contributor stats:

For each unique author (`%an|%ae`):

| Per-Author Metric | Source |
|-------------------|--------|
| **Commits** | Count of commits by this author |
| **Insertions** | Sum of insertions from their commits |
| **Deletions** | Sum of deletions from their commits |
| **Files touched** | Count of unique files changed in their commits |
| **Commit types** | Classify each commit subject by conventional commit type prefix |
| **Sessions** | Group commits with <45 min gaps into sessions |

### Commit Type Classification

Parse commit subject for conventional commit prefix:

| Prefix Pattern | Type |
|---------------|------|
| `feat:` or `feat(` | feat |
| `fix:` or `fix(` | fix |
| `refactor:` or `refactor(` | refactor |
| `test:` or `test(` or `tests:` | test |
| `docs:` or `docs(` | docs |
| `style:` or `style(` | style |
| `perf:` or `perf(` | perf |
| `build:` or `build(` or `ci:` or `ci(` | build |
| `chore:` or `chore(` | chore |
| *(no match)* | other |

## Step 4: Branch Health

**Gate: Health indicators computed before proceeding to Step 5.**

| Indicator | How to Compute |
|-----------|---------------|
| **Branch age** | Time from first commit to last commit in `$BASE..HEAD` |
| **First commit** | Timestamp of oldest commit on branch |
| **Last commit** | Timestamp of newest commit on branch |
| **Base branch drift** | Number of commits on $BASE that are not in HEAD: left count from `git rev-list --left-right --count $BASE...HEAD` |
| **Merge/rebase freshness** | If drift > 20: "stale — consider rebasing". If drift > 50: "very stale". If drift <= 20: "fresh" |

## Step 5: Commit Hygiene

**Gate: Hygiene score computed before proceeding to Step 6.**

Scan all commit messages for hygiene issues:

### WIP/Fixup Detection

Flag commits matching (case-insensitive):

- `WIP`, `wip`, `work in progress`
- `fixup!`, `squash!`, `amend!`
- `tmp`, `temp`, `hack`
- `xxx`, `TODO`

### Conventional Commit Compliance

- Count commits with valid conventional commit prefix (from Step 3 classification)
- Compliance % = commits with valid prefix / total commits

### Empty/Minimal Messages

Flag commits where the subject is:
- Empty or whitespace only
- Under 10 characters
- Single word (e.g., "update", "fix", "changes")

### Hygiene Score

Compute as: `1.0 - (flagged_commits / total_commits)`

A commit can be flagged for multiple reasons but counts only once.

### **If `--quick` mode: STOP HERE.** Render the quick dashboard (see Output Format below) and exit. Do not proceed to Steps 6-10.

## Step 6: Commit Type Breakdown + Hotspot Analysis

**Gate: All commits classified, top hotspots identified before proceeding to Step 7.**

### Commit Type Breakdown

Aggregate the per-author commit type data from Step 3 into an overall breakdown:

```
feat: 6 (50%)    fix: 3 (25%)    refactor: 2 (17%)    test: 1 (8%)
```

### Hotspot Analysis

Identify the top 10 most-changed files across all commits:

```bash
git log --numstat --format="" $BASE..HEAD | awk '{files[$3]+=$1+$2} END {for(f in files) print files[f], f}' | sort -rn | head -10
```

For each hotspot file, report:
- Total churn (insertions + deletions)
- Number of commits that touched it
- Contributors who touched it

## Step 7: Self-Review Scan

**Gate: All findings categorized (BLOCK/WARN/INFO) before proceeding to Step 8.**

Scan the full branch diff for common pre-PR issues. Get the diff first:

```bash
git diff $BASE...HEAD
```

Then scan for these patterns:

### BLOCK (must fix before merging)

| Pattern | What to Search |
|---------|---------------|
| **Hardcoded secrets** | Strings matching `password\s*=\s*["']`, `api_key\s*=\s*["']`, `secret\s*=\s*["']`, `token\s*=\s*["']` with literal values (not env references) |
| **`.only` in tests** | `.only(`, `describe.only`, `it.only`, `test.only`, `fdescribe`, `fit` |
| **Conflict markers** | `<<<<<<<`, `=======`, `>>>>>>>` |

### WARN (should fix, reviewer will flag)

| Pattern | What to Search |
|---------|---------------|
| **Debug statements** | `console.log`, `console.debug`, `debugger`, `dd(`, `dump(`, `var_dump`, `print_r`, `pry`, `binding.pry`, `byebug`, `import pdb`, `pdb.set_trace`, `breakpoint()` |
| **TODO/FIXME** | `TODO`, `FIXME`, `HACK`, `XXX` in added lines (not removed lines) |
| **Commented-out code** | Blocks of 3+ consecutive commented lines that look like code (contain `=`, `(`, `{`, `return`, `if`, `for`) |

### INFO (awareness only)

| Pattern | What to Search |
|---------|---------------|
| **Large files added** | New files with 300+ lines of insertions |
| **Binary files** | Files with no numstat data (binary) |
| **Config changes** | Changes to `*.config.*`, `*.env*`, `Dockerfile`, `docker-compose*`, `*.yml`, `*.yaml` in project root |

Report each finding with:
- Severity level (BLOCK / WARN / INFO)
- File path and line number (if available)
- The matching content snippet
- Brief description

## Step 8: Focus Score + Session Analysis + Time Distribution

**Gate: All scores computed before proceeding to Step 9.**

### Focus Score

Measure how concentrated the changes are in a single directory:

1. For each file changed, extract its top-level directory (e.g., `src/auth/login.ts` → `src/auth`)
2. Count total file changes per directory
3. Focus score = changes in largest directory / total changes (0.0 - 1.0)
4. Record the primary directory (the one with the most changes)

### Session Detection

Group commits into work sessions using a 45-minute gap threshold:

1. Sort all commits chronologically
2. Start a new session when the gap between consecutive commits exceeds 45 minutes
3. Record per session: start time, end time, author(s), commit count

### Time Distribution

Create an hourly histogram of commit times (0-23h):

1. Extract hour from each commit timestamp
2. Count commits per hour
3. Render as a simple text histogram

### Contributor Timeline

Build a timeline showing who worked when:

```
Mon 10am-12pm  ciprian (4 commits)
Tue 2pm-5pm    ciprian (3 commits), alex (2 commits)
Wed 9am        alex (1 commit)
```

## Step 9: Merge Readiness Verdict

**Gate: Verdict determined with per-signal breakdown before proceeding to Step 10.**

Evaluate each signal and determine overall verdict:

### Signal Evaluation

| Signal | GREEN | YELLOW | RED |
|--------|-------|--------|-----|
| **Hygiene** | Score >= 0.9 | Score >= 0.7 | Score < 0.7 |
| **Size** | XS, S, or M | L | XL |
| **Test ratio** | >= 0.2 | >= 0.1 | < 0.1 (and insertions > 50) |
| **Focus** | Score >= 0.6 | Score >= 0.3 | Score < 0.3 |
| **Self-review** | 0 BLOCKs, 0-2 WARNs | 0 BLOCKs, 3+ WARNs | Any BLOCKs |
| **Drift** | <= 20 commits behind | 21-50 commits behind | > 50 commits behind |

### Overall Verdict

- **RED** — Any signal is RED → "Not ready to merge"
- **YELLOW** — No RED signals, but 2+ YELLOW signals → "Merge with caution"
- **GREEN** — At most 1 YELLOW signal → "Ready to merge"

### Recommendations

Generate 2-5 actionable recommendations based on non-GREEN signals. Examples:

- "Squash 3 WIP commits before merging"
- "Add tests — test ratio is 0.05 (target: 0.2)"
- "Rebase onto main — 34 commits behind"
- "Remove 2 console.log statements in src/auth/login.ts"
- "Consider splitting — XL PR (1,247 changed lines) across 28 files"

## Step 10: Generate Output + Save JSON Snapshot

**Gate: Output rendered, JSON saved before marking complete.**

### Render Dashboard

Always render the dashboard table first:

```
## PR Retro: <branch-name> → <base-branch>

| Metric            | Value                    |
|-------------------|--------------------------|
| Commits           | 12                       |
| Contributors      | 3                        |
| Files changed     | 18                       |
| Insertions        | +447                     |
| Deletions         | -57                      |
| Net LOC           | +390                     |
| Test LOC ratio    | 0.24                     |
| PR size           | M (447 changed lines)    |
| Focus score       | 0.78 (src/auth)          |
| Hygiene score     | 0.83                     |
| Branch age        | 3 days                   |
| Base drift        | 8 commits behind (fresh) |
| Sessions          | 5                        |

### Verdict: 🟢 GREEN — Ready to merge

| Signal       | Status |
|--------------|--------|
| Hygiene      | 🟢     |
| Size         | 🟢     |
| Test ratio   | 🟢     |
| Focus        | 🟢     |
| Self-review  | 🟡 2 warnings  |
| Drift        | 🟢     |
```

### Render Contributor Section (standard mode only)

```
## Contributors (3 authors, 12 commits)

  ciprian    8 commits  +340 -45   feat(6) fix(2)    Sessions: 3
  alex       3 commits  +85  -12   feat(2) test(1)   Sessions: 1
  maria      1 commit   +22  -0    docs(1)           Sessions: 1

Timeline:
  Mon 10am-12pm  ciprian (4 commits)
  Tue 2pm-5pm    ciprian (3 commits), alex (2 commits)
  Wed 9am        alex (1 commit)
  Wed 3pm        ciprian (1 commit), maria (1 commit)
```

### Render Commit Type Breakdown (standard mode only)

```
## Commit Types

  feat: 8 (67%)  fix: 2 (17%)  test: 1 (8%)  docs: 1 (8%)
```

### Render Hotspots (standard mode only)

```
## Hotspots (most-changed files)

| File                      | Churn | Commits | Contributors   |
|---------------------------|-------|---------|----------------|
| src/auth/login.ts         | 142   | 5       | ciprian, alex  |
| src/auth/middleware.ts     | 87    | 3       | ciprian        |
| src/auth/types.ts          | 45    | 2       | ciprian        |
```

### Render Self-Review Findings (standard mode only)

```
## Self-Review Findings

  WARN  src/auth/login.ts:42     console.log("debug auth")
  WARN  src/auth/middleware.ts:15 TODO: handle edge case
  INFO  docker-compose.yml       Config file changed
```

### Render Time Distribution (standard mode only)

```
## Commit Time Distribution

  09h  ██ 2
  10h  ████ 4
  11h  ██ 2
  14h  █ 1
  15h  ██ 2
  16h  █ 1
```

### Render Recommendations (standard mode only)

```
## Recommendations

1. Remove 2 debug console.log statements
2. Address TODO in src/auth/middleware.ts:15
3. Test ratio is healthy (0.24) — good coverage
```

### Save JSON Snapshot (standard mode only, skip for --quick)

Save to `.history/pr-retros/<branch-slug>.json`:

```bash
# Create directory if needed
mkdir -p .history/pr-retros
```

Branch slug: replace `/` with `-`, lowercase. Example: `feature/auth-system` → `feature-auth-system`.

JSON schema:

```json
{
  "version": "1.0.0",
  "timestamp": "<ISO 8601>",
  "branch": "<branch name>",
  "baseBranch": "<base branch>",
  "branchAge": {
    "days": 3,
    "firstCommit": "<ISO 8601>",
    "lastCommit": "<ISO 8601>"
  },
  "contributors": [
    {
      "name": "<author name>",
      "email": "<author email>",
      "commits": 8,
      "insertions": 340,
      "deletions": 45,
      "filesChanged": 12,
      "commitTypes": { "feat": 6, "fix": 2 },
      "sessions": 3
    }
  ],
  "metrics": {
    "totalCommits": 12,
    "filesChanged": 18,
    "insertions": 447,
    "deletions": 57,
    "netLOC": 390,
    "testInsertions": 107,
    "testLOCRatio": 0.24,
    "prSizeClass": "M"
  },
  "commitTypes": { "feat": 8, "fix": 2, "test": 1, "docs": 1 },
  "hotspots": [
    { "file": "src/auth/login.ts", "churn": 142, "commits": 5, "contributors": ["ciprian", "alex"] }
  ],
  "commitHygiene": {
    "score": 0.83,
    "conventionalCommitCompliance": 0.92,
    "issues": [
      { "commit": "<hash>", "subject": "WIP auth flow", "reason": "WIP commit" }
    ]
  },
  "focusScore": {
    "score": 0.78,
    "primaryDirectory": "src/auth"
  },
  "selfReview": {
    "blocks": 0,
    "warnings": 2,
    "info": 1,
    "findings": [
      { "severity": "WARN", "file": "src/auth/login.ts", "line": 42, "pattern": "console.log", "content": "console.log(\"debug auth\")" }
    ]
  },
  "sessions": {
    "count": 5,
    "timeline": [
      { "start": "<ISO 8601>", "end": "<ISO 8601>", "authors": ["ciprian"], "commits": 4 }
    ]
  },
  "verdict": {
    "status": "GREEN",
    "signals": {
      "hygiene": "GREEN",
      "size": "GREEN",
      "testRatio": "GREEN",
      "focus": "GREEN",
      "selfReview": "YELLOW",
      "drift": "GREEN"
    },
    "recommendations": [
      "Remove 2 debug console.log statements",
      "Address TODO in src/auth/middleware.ts:15"
    ]
  }
}
```

## Safety Rules

| Rule | Reason |
|------|--------|
| Never make code changes | This is a read-only analysis skill |
| Never fabricate metrics | Every number must come from git data |
| Never run on main/master/develop | Only feature branches have meaningful retros |
| Never skip Step 1 data gathering | All metrics depend on complete raw data |
| Never report a GREEN verdict when BLOCKs exist | BLOCKs always force RED |
| Never push, commit, or modify git state | Read-only — no side effects except JSON snapshot |
| Always create .history/pr-retros/ before writing | Avoid write errors |
| Always use $BASE..HEAD for commit range | Never use time-based ranges |
| Always attribute commits to correct authors | Parse %an/%ae per commit, not aggregate |

## Verification (MANDATORY)

After completing the analysis, verify the full workflow:

### Check 1: Data Completeness
- [ ] All 5 git commands from Step 1 returned data
- [ ] Total commits matches `git rev-list --count $BASE..HEAD`
- [ ] All contributors identified (cross-check with `git shortlog -sn $BASE..HEAD`)

### Check 2: Metric Accuracy
- [ ] Insertions + deletions match `git diff --shortstat $BASE...HEAD`
- [ ] Test LOC ratio is between 0.0 and 1.0
- [ ] Focus score is between 0.0 and 1.0

### Check 3: Verdict Consistency
- [ ] Verdict matches signal evaluation rules (any RED → RED overall)
- [ ] No BLOCK findings present when verdict is GREEN
- [ ] Recommendations address all non-GREEN signals

### Check 4: Output Completeness
- [ ] Dashboard table rendered with all metrics
- [ ] Contributor section present (standard mode)
- [ ] Self-review findings listed (standard mode)

### Check 5: JSON Snapshot (standard mode only)
- [ ] JSON saved to `.history/pr-retros/<branch-slug>.json`
- [ ] JSON passes schema validation (all required fields present)
- [ ] Timestamp is current

**Gate:** Do NOT mark analysis complete until all 5 checks pass.

---

## Quality Checklist (Must Score 8/10)

Score yourself honestly before marking analysis complete:

### Data Gathering (0-2 points)
- **0 points:** Used partial git data or skipped commands
- **1 point:** Ran commands but didn't cross-validate totals
- **2 points:** All 5 commands run, totals cross-validated

### Metric Accuracy (0-2 points)
- **0 points:** Metrics eyeballed or estimated
- **1 point:** Metrics computed but not verified
- **2 points:** All metrics computed from raw data and spot-checked

### Contributor Attribution (0-2 points)
- **0 points:** Single-author assumption or contributors skipped
- **1 point:** Authors listed but per-author stats incomplete
- **2 points:** Full per-author breakdown with types, sessions, and stats

### Self-Review Thoroughness (0-2 points)
- **0 points:** Skipped self-review scan
- **1 point:** Scanned for some patterns but not all categories
- **2 points:** All BLOCK/WARN/INFO patterns scanned, findings categorized

### Verdict Integrity (0-2 points)
- **0 points:** Verdict assigned without signal evaluation
- **1 point:** Some signals evaluated but not all
- **2 points:** All 6 signals evaluated, verdict follows rules, recommendations actionable

**Minimum passing score: 8/10**

---

## Common Rationalizations (All Wrong)

These are excuses. Don't fall for them:

- **"It's a small branch, quick mode is enough"** → If user asked for standard, run ALL 10 steps
- **"There's only one contributor, skip contributor breakdown"** → STILL show the section with 1 author
- **"The commit messages look fine"** → STILL compute hygiene score from patterns
- **"I can eyeball the test ratio"** → STILL compute from numstat data
- **"No one reads the JSON snapshot"** → STILL save it (standard mode)
- **"The branch is obviously ready"** → STILL evaluate all 6 signals
- **"Self-review scan is redundant with find-bugs"** → Different scope: pr-retro scans for artifacts, find-bugs does security review
- **"The verdict is clearly GREEN"** → STILL show the signal breakdown table

---

## Failure Modes

### Failure Mode 1: Running on Main

**Symptom:** No commits found, or entire repo history analyzed
**Fix:** Check `git branch --show-current` first. Exit if on main/master/develop.

### Failure Mode 2: Wrong Base Branch

**Symptom:** Metrics include commits from other merged branches
**Fix:** Use `--base` flag or auto-detect. Verify with `git merge-base $BASE HEAD`.

### Failure Mode 3: Fabricated Metrics

**Symptom:** Numbers don't match actual git data
**Fix:** Every metric must be computed from git command output. Cross-validate totals.

### Failure Mode 4: Missing Contributors

**Symptom:** Multi-author branch shows only one contributor
**Fix:** Parse `%an|%ae` per commit, not from `git config user.name`.

### Failure Mode 5: False GREEN Verdict

**Symptom:** Branch has BLOCKs (`.only`, secrets) but shows GREEN
**Fix:** Any BLOCK finding forces self-review signal to RED, which forces overall RED.

---

## Quick Workflow Summary

```
STEP 1: GATHER RAW BRANCH DATA
├── 5 parallel git commands
├── Determine base branch
├── Verify commits > 0
└── Gate: All data returned

STEP 2: COMPUTE BRANCH METRICS
├── LOC (insertions, deletions, net)
├── Test LOC ratio
├── PR size class (XS/S/M/L/XL)
└── Gate: All metrics computed

STEP 3: CONTRIBUTOR BREAKDOWN
├── Per-author: commits, LOC, files, types
├── Per-author sessions (45-min gap)
└── Gate: All authors identified

STEP 4: BRANCH HEALTH
├── Branch age (first → last commit)
├── Base drift (commits behind)
├── Freshness assessment
└── Gate: Health computed

STEP 5: COMMIT HYGIENE
├── WIP/fixup detection
├── Conventional commit compliance %
├── Empty/minimal message flagging
├── Hygiene score
└── Gate: Score computed
    └── --quick? → Render dashboard, EXIT

STEP 6: COMMIT TYPE BREAKDOWN + HOTSPOTS
├── Aggregate type distribution
├── Top 10 hotspot files
├── Per-hotspot: churn, commits, contributors
└── Gate: All classified

STEP 7: SELF-REVIEW SCAN
├── BLOCK: secrets, .only, conflict markers
├── WARN: debug statements, TODO/FIXME, commented code
├── INFO: large files, binaries, config changes
└── Gate: All findings categorized

STEP 8: FOCUS + SESSIONS + TIME
├── Focus score (directory concentration)
├── Session detection (45-min gaps)
├── Hourly commit histogram
├── Contributor timeline
└── Gate: All computed

STEP 9: MERGE READINESS VERDICT
├── Evaluate 6 signals (hygiene, size, tests, focus, self-review, drift)
├── Determine GREEN/YELLOW/RED
├── Generate recommendations
└── Gate: Verdict determined

STEP 10: OUTPUT + JSON SNAPSHOT
├── Render dashboard table
├── Render contributor section
├── Render hotspots, findings, histogram
├── Render recommendations
├── Save JSON to .history/pr-retros/<branch-slug>.json
└── Gate: Output complete, JSON saved
```

---

## Completion Announcement

When analysis is complete, announce:

```
PR retro complete.

**Quality Score: X/10**
- Data Gathering: X/2
- Metric Accuracy: X/2
- Contributor Attribution: X/2
- Self-Review Thoroughness: X/2
- Verdict Integrity: X/2

**Branch:** <branch> → <base> (<N> commits, <M> contributors)
**Verdict:** <GREEN/YELLOW/RED> — <summary>

**Verification:**
- Data complete: ✅
- Metrics cross-validated: ✅
- Verdict consistent: ✅
- Output complete: ✅
- JSON saved: ✅ (or N/A for --quick)

**Next steps:**
[Fix findings → commit → create-pr]
```

---

## Integration with Other Skills

The `pr-retro` skill integrates with:

- **`find-bugs`** — Run `find-bugs` for deep security review after `pr-retro` flags concerns
- **`commit`** — After fixing pr-retro findings, commit the fixes
- **`create-pr`** — After pr-retro shows GREEN, create the PR

**Workflow Chain:**

```
Branch ready for review
       │
       ▼
pr-retro skill (this skill)
       │
       ▼
Fix findings (if any)
       │
       ▼
commit skill (commit the fixes)
       │
       ▼
create-pr skill (submit for review)
```

**Complementary, not competing:**

- `pr-retro` = analyze branch health, metrics, hygiene, readiness
- `find-bugs` = deep security and logic bug review
- `create-pr` = push and create the pull request

Run `pr-retro` first as a quick self-check, then `find-bugs` for thorough review, then `create-pr` to ship.

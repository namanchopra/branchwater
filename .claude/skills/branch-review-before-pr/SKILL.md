---
name: branch-review-before-pr
description: |
  Pre-landing PR review. Analyzes diff against main for structural issues that
  tests don't catch: query safety, race conditions, trust boundary violations,
  conditional side effects, and more. Critical findings block /ship and /create-pr.
  Invoke via /branch-review-before-pr or when integrated as a gate in ship workflows.
---

# Pre-Landing Branch Review

You are running the `/branch-review-before-pr` workflow. Analyze the current branch's diff against main for structural issues that tests don't catch.

---

## Step 1: Check branch

1. Run `git branch --show-current` to get the current branch.
2. If on `main` (or `master`), output: **"Nothing to review — you're on main or have no changes against main."** and stop.
3. Run `git fetch origin main --quiet && git diff origin/main --stat` to check if there's a diff. If no diff, output the same message and stop.

---

## Step 2: Read the checklist

Read the checklist file located alongside this skill at the relative path `checklist.md` (same directory as this SKILL.md).

**If the file cannot be read, STOP and report the error.** Do not proceed without the checklist.

---

## Step 3: Get the diff

Fetch the latest main to avoid false positives from a stale local main:

```bash
git fetch origin main --quiet
```

Run `git diff origin/main` to get the full diff. This includes both committed and uncommitted changes against the latest main.

If the diff is very large, also get the file list and read changed files individually:

```bash
git diff origin/main --name-only
```

**Read the FULL diff before commenting.** Do not flag issues already addressed in the diff.

---

## Step 4: Two-pass review

Apply the checklist against the diff in two passes:

1. **Pass 1 (CRITICAL):** Query & Data Safety, Race Conditions & Concurrency, Auth & Trust Boundaries
2. **Pass 2 (INFORMATIONAL):** All remaining categories from the checklist

Follow the output format specified in the checklist. Respect the suppressions — do NOT flag items listed in the suppressions section.

---

## Step 5: Output findings

**Always output ALL findings** — both critical and informational. The user must see every issue.

**Output format:**

```
Branch Review: N issues (X critical, Y informational)

CRITICAL (blocking):
- [file:line] Problem description
  Fix: suggested fix

Issues (non-blocking):
- [file:line] Problem description
  Fix: suggested fix
```

**If no issues found:** `Branch Review: No issues found.`

**If CRITICAL issues found:** Output all findings, then for EACH critical issue use a separate `AskUserQuestion` with:
- The problem (`file:line` + description)
- Your recommended fix
- Options:
  - **(A) Fix it now** — apply the recommended fix
  - **(B) Acknowledge** — ship anyway, you understand the risk
  - **(C) False positive** — skip, this isn't actually a problem

After all critical questions are answered, output a summary of what the user chose for each issue.

- If the user chose **(A)** on any issue: apply the recommended fixes to those files. Do NOT commit — the user or `/ship` will handle that.
- If only **(B)** or **(C)** were chosen: no action needed.

**If only informational issues found:** Output findings. No further action needed. These go into the PR body when used with `/create-pr`.

---

## Important Rules

- **Read the FULL diff before commenting.** Do not flag issues already addressed in the diff.
- **Read-only by default.** Only modify files if the user explicitly chooses "Fix it now" on a critical issue. Never commit, push, or create PRs.
- **Be terse.** One line problem, one line fix. No preamble, no summaries, no "looks good overall."
- **Only flag real problems.** Skip anything that's fine. A clean review is a valid outcome.
- **Respect suppressions.** If the checklist says don't flag it, don't flag it.
- **Scope to the diff.** Do not review unchanged code. Only the branch diff is in scope.

---
name: create-pr
description: Use when the user asks to create a pull request, open a PR, submit changes for review, or says "/pr". Validates branch state, analyzes all commits since divergence from base, runs pre-PR quality checks, generates structured PR title and body with summary/test-plan/breaking-changes sections, pushes branch, and creates the PR via GitHub CLI (gh). Supports draft PRs, reviewer assignment, and label attachment.
---

<EXTREMELY-IMPORTANT>
Before creating ANY pull request, you **ABSOLUTELY MUST**:

1. Verify you're NOT on main/master/develop
2. Check for uncommitted changes (invoke commit skill first if any)
3. Read the FULL diff against base branch (not just commit messages)
4. Scan for breaking changes and document them
5. Push the branch before creating the PR

**Creating PRs without verification = broken builds, missing context, failed reviews**

This is not optional. Every PR requires disciplined preparation.
</EXTREMELY-IMPORTANT>

# Create Pull Request

## MANDATORY FIRST RESPONSE PROTOCOL

Before creating ANY PR, you **MUST** complete this checklist:

1. ☐ Run `git branch --show-current` — verify NOT on protected branch
2. ☐ Run `git status --short` — invoke commit skill if uncommitted changes
3. ☐ Run `git log main..HEAD` — verify commits exist
4. ☐ Run `git diff main...HEAD` — read FULL diff (not just commit messages)
5. ☐ Check for conflict markers in changed files
6. ☐ Identify breaking changes (removed exports, schema changes, API changes)
7. ☐ Determine PR type, scope, size, and risk
8. ☐ Announce: "Creating PR: [type](scope): [title]"

**Creating PRs WITHOUT completing this checklist = incomplete reviews and rework.**

## Overview

Validate branch readiness, analyze all commits since divergence from base, generate a structured PR with meaningful title and body, push to remote, and create via `gh pr create`. If uncommitted changes exist, invoke the `commit` skill first.

## When to Use

- User says "create PR", "open PR", "submit PR", "/pr", "make a PR"
- User says "push and create PR" or "send this for review"
- After completing work and user wants to submit for review
- $ARGUMENTS provided as PR guidance (e.g., `/pr add auth feature`)

**Never create a PR proactively.** Only when explicitly requested.

## Step 1: Gather Branch Context

**Gate: Full context collected before proceeding to Step 2.**

Run these commands to understand the full picture:

```bash
# Current branch name
git branch --show-current

# Check if branch tracks a remote
git status -sb

# Uncommitted changes (never use -uall)
git status --short

# Find the base branch (main or master)
git log --oneline --decorate -1 origin/main 2>/dev/null || git log --oneline --decorate -1 origin/master 2>/dev/null

# All commits on this branch since diverging from base
git log --oneline main..HEAD 2>/dev/null || git log --oneline master..HEAD 2>/dev/null

# Full diff against base branch (what the PR will contain)
git diff main...HEAD 2>/dev/null || git diff master...HEAD 2>/dev/null
```

**Read the actual diff output.** You need the full diff to write an accurate PR summary — not just commit messages.

### Determine Base Branch

Use this priority:

1. If user specifies a base branch in $ARGUMENTS, use it
2. Check for `main` branch: `git rev-parse --verify origin/main 2>/dev/null`
3. Check for `master` branch: `git rev-parse --verify origin/master 2>/dev/null`
4. Check for `develop` branch: `git rev-parse --verify origin/develop 2>/dev/null`
5. If none found, ask the user

Store as `$BASE_BRANCH` for all subsequent steps.

## Step 2: Pre-PR Validation

**Gate: Branch ready (commits exist, no uncommitted changes) before proceeding to Step 3.**

### Uncommitted Changes

If `git status --short` shows changes:

1. **Invoke the `commit` skill** using the Skill tool: `Use the Skill tool with skill="commit"`
2. The commit skill handles staging, quality checks, and committing
3. After commit completes, **re-run Step 1** to pick up the new commit(s)
4. Continue with the updated branch state

### Empty Branch

If `git log $BASE_BRANCH..HEAD` shows no commits:

- **Stop.** "No commits found on this branch relative to $BASE_BRANCH. Nothing to create a PR for."

### Branch Naming

Validate branch name is not `main`, `master`, or `develop`:

- If on a protected branch, **stop**: "You're on $BRANCH. Create a feature branch first."

## Step 3: Analyze All Commits

**Gate: PR classified (type, scope, size, risk) before proceeding to Step 4.**

**Read every commit in the branch** — not just the latest:

```bash
# All commits with full messages
git log --format="%h %s%n%b%n---" $BASE_BRANCH..HEAD

# File change summary across all commits
git diff --stat $BASE_BRANCH...HEAD

# Full diff for understanding scope
git diff $BASE_BRANCH...HEAD
```

### Classify the PR

Based on ALL commits and the full diff, determine:

| Aspect | How to Determine |
|--------|-----------------|
| **Type** | Feature (`feat`), bugfix (`fix`), refactor, docs, chore — from commit types and actual changes |
| **Scope** | Primary area affected — from file paths and branch name |
| **Size** | S (1-3 files), M (4-10 files), L (11-25 files), XL (26+ files) |
| **Risk** | Low (docs, tests), Medium (new feature), High (breaking changes, core logic, DB migrations) |
| **Breaking** | Any API changes, removed endpoints, schema changes, renamed exports |

### Detect Breaking Changes

Scan the diff for:

- Removed or renamed public exports
- Changed function signatures
- Database migration files (schema changes)
- API endpoint changes (routes added/removed/changed)
- Environment variable changes
- Package dependency major version bumps

If breaking changes detected, they MUST appear in the PR body.

## Step 4: Pre-PR Quality Checks

**Gate: No blocking issues before proceeding to Step 5.**

Run quality gates across the entire branch diff:

```bash
# TypeScript type check
npx tsc --noEmit

# ESLint (if configured)
ls .eslintrc* eslint.config.* 2>/dev/null && git diff --name-only $BASE_BRANCH...HEAD -- '*.ts' | xargs npx eslint

# Conflict markers in any changed file
git diff --name-only $BASE_BRANCH...HEAD | xargs grep -n '<<<<<<<\|=======\|>>>>>>>' 2>/dev/null
```

### If Checks Fail

- **Conflict markers:** **Block.** Must resolve before creating PR.
- **Type errors:** Warn user. Recommend fixing. Ask whether to proceed.
- **Lint errors:** Show errors. Offer auto-fix. Recommend fixing.

**Quality issues are warnings for PRs** (reviewer can catch them) — except conflict markers which always block.

## Step 5: Generate PR Title

**Gate: Title follows conventions before proceeding to Step 6.**

### Format

```
<type>(<scope>): <concise description>
```

### Rules

- Under 72 characters
- Imperative mood: "add feature" not "added feature"
- No period at the end
- If breaking change, add `!`: `feat(api)!: remove legacy endpoint`
- Scope from branch name or primary file path area
- Must reflect ALL changes, not just the last commit

### Title from Branch Name

Use branch name as a hint, verify against actual changes:

| Branch | Likely Title |
|--------|-------------|
| `feat/add-auth-system` | `feat(auth): add JWT authentication system` |
| `fix/cart-total-calculation` | `fix(cart): correct total calculation with discounts` |
| `refactor/search-service` | `refactor(search): restructure search service architecture` |

If $ARGUMENTS contains a clear title, use it (respecting format rules).

## Step 6: Generate PR Body

**Gate: Body has all required sections before proceeding to Step 7.**

Use this template with HEREDOC:

```markdown
## Summary
<3-5 bullet points describing WHAT changed and WHY>

## Changes
<Grouped by area — list key files/modules changed>

### <Area 1>
- description of change

### <Area 2>
- description of change

## Breaking Changes
<Only if breaking changes detected in Step 3. Otherwise omit entirely.>
- What broke
- Migration steps

## Test Plan
- [ ] <Specific test scenario 1>
- [ ] <Specific test scenario 2>
- [ ] <Specific test scenario 3>

## Notes
<Optional: deployment notes, config changes, dependencies added>
```

### Body Writing Rules

- **Summary bullets**: Focus on "why" and business impact, not just "what"
- **Changes section**: Group by module/area, not by commit
- **Test Plan**: Specific, actionable items a reviewer can verify — not generic "run tests"
- **Breaking Changes**: Include migration steps if applicable
- **Notes**: Mention new env vars, DB migrations, service dependencies
- Omit any section with no content (except Summary and Test Plan — always required)

## Step 7: Push Branch

**Gate: Branch pushed to remote before proceeding to Step 8.**

```bash
# Push with upstream tracking
git push -u origin $(git branch --show-current)
```

If push fails:

- **Rejected (non-fast-forward):** "Remote has changes not in your branch. Pull or rebase first."
- **Permission denied:** "Push access denied. Check your repository permissions."
- **Branch protection:** "Branch is protected. Create a PR from a different branch."

## Step 8: Create PR via GitHub CLI

**Gate: PR created successfully before proceeding to Step 9.**

### Standard PR

```bash
gh pr create --base "$BASE_BRANCH" --title "<title>" --body "$(cat <<'EOF'
<generated body from Step 6>
EOF
)"
```

### With Options from $ARGUMENTS

Parse $ARGUMENTS for additional options:

| User Says | Flag |
|-----------|------|
| "draft PR", "WIP" | `--draft` |
| "assign @user" | `--assignee user` |
| "add reviewer @user" | `--reviewer user` |
| "label bug" | `--label bug` |
| "milestone v2" | `--milestone "v2"` |

Example with options:

```bash
gh pr create --base main --draft --reviewer "tech-lead" --label "feature" \
  --title "feat(auth): add JWT authentication" \
  --body "$(cat <<'EOF'
...body...
EOF
)"
```

### If `gh` is Not Available

If `gh pr create` fails with "command not found":

1. Show the PR title and body to the user
2. Provide the GitHub URL: `https://github.com/<org>/<repo>/compare/$BASE_BRANCH...<branch>`
3. Instruct: "GitHub CLI not found. Create the PR manually using the URL above."

## Step 9: Verify and Report

**Gate: PR verified and URL reported before proceeding to Step 10.**

After creating the PR:

```bash
# Get PR details
gh pr view --json number,url,title,state,isDraft
```

Report to the user:

```
PR #<number> created: <title>
URL: <url>
Base: <base> <- <branch>
State: <open/draft>
Size: <S/M/L/XL> (<N> files changed, +<additions> -<deletions>)
```

If there are remaining uncommitted changes, mention them.

## Safety Rules

| Rule | Reason |
|------|--------|
| Never create PRs proactively | Only when explicitly asked |
| Never force push before PR | Rewrites history others may depend on |
| Never create PR from main/master/develop | These are protected base branches |
| Never create PR with conflict markers | Unresolved conflicts break the build |
| Never fabricate test results in PR body | Test plan must reflect actual state |
| Never omit breaking changes from body | Reviewers must know about breaking changes |
| Never include secrets in PR body | No tokens, passwords, or keys in description |
| Always use `gh` CLI over manual API calls | Handles auth, org context, templates properly |
| Always push before creating PR | Remote must have the branch |
| Always read full diff, not just commits | Commit messages can be misleading |

## Quick Reference: PR Readiness Checklist

```
1.  On a feature branch?            → BLOCK if on main/master/develop
2.  Uncommitted changes?            → Invoke commit skill first
3.  Has commits vs base?            → BLOCK if no commits
4.  Conflict markers?               → BLOCK until resolved
5.  Type errors?                    → WARN, recommend fixing
6.  Lint errors?                    → WARN, offer auto-fix
7.  Breaking changes documented?    → Ensure in PR body
8.  Branch pushed to remote?        → Push if not
9.  gh CLI available?               → Fallback to manual if not
10. All clear → create PR
```

## Quick Reference: Body Section Guide

```
Summary       → ALWAYS (3-5 bullets, why + what)
Changes       → ALWAYS for M/L/XL PRs, optional for S
Breaking      → ONLY if breaking changes detected
Test Plan     → ALWAYS (specific scenarios, checkboxes)
Notes         → ONLY if deployment/config/dependency changes
```

## Resources

See `references/pr-body-examples.md` for full PR body examples across different PR types (feature, bugfix, refactor, breaking change).

## Step 10: Verification (MANDATORY)

After creating PR, verify complete workflow:

### Check 1: PR Exists
- [ ] `gh pr view` shows the PR details
- [ ] PR URL is accessible

### Check 2: Content Quality
- [ ] Title follows conventional format
- [ ] Summary section has 3-5 bullets
- [ ] Test plan has specific scenarios

### Check 3: Breaking Changes Documented
- [ ] If breaking changes detected, they appear in PR body
- [ ] Migration steps included if applicable

### Check 4: Branch State
- [ ] Local and remote branches are in sync
- [ ] No remaining uncommitted changes

### Check 5: PR State
- [ ] PR is in correct state (open/draft as intended)
- [ ] Base branch is correct
- [ ] Labels/reviewers assigned (if requested)

**Gate:** Do NOT mark PR creation complete until all 5 checks pass.

---

## Quality Checklist (Must Score 8/10)

Score yourself honestly before marking PR creation complete:

### Context Gathering (0-2 points)
- **0 points:** Created PR without reading diff
- **1 point:** Read commit messages only
- **2 points:** Read full diff against base branch

### Validation (0-2 points)
- **0 points:** Created PR with uncommitted changes or from protected branch
- **1 point:** Validated some checks
- **2 points:** All pre-PR validations pass

### Title Quality (0-2 points)
- **0 points:** Generic title ("Update code", "Fix bug")
- **1 point:** Has type but vague description
- **2 points:** Proper format: type(scope): clear description <72 chars

### Body Quality (0-2 points)
- **0 points:** Empty or minimal body
- **1 point:** Has summary but missing test plan
- **2 points:** Complete: summary, changes (if M+), breaking changes (if any), test plan

### Breaking Changes (0-2 points)
- **0 points:** Breaking changes exist but not documented
- **1 point:** Breaking changes mentioned but no migration steps
- **2 points:** No breaking changes, OR fully documented with migration steps

**Minimum passing score: 8/10**

---

## Common Rationalizations (All Wrong)

These are excuses. Don't fall for them:

- **"The commit messages explain it"** → STILL read the full diff
- **"It's a small PR"** → STILL write summary and test plan
- **"I'll add the test plan later"** → Write it NOW, reviewers need it
- **"There are no breaking changes"** → STILL check for removed exports, API changes
- **"I can push after creating the PR"** → PUSH FIRST, then create PR
- **"The title is obvious"** → STILL use conventional format with type and scope
- **"gh isn't installed"** → STILL provide manual URL and formatted body
- **"It's just a draft"** → Draft PRs STILL need quality body and test plan

---

## Failure Modes

### Failure Mode 1: PR from Protected Branch

**Symptom:** Trying to create PR from main/master/develop
**Fix:** Create a feature branch first: `git checkout -b feature/name`

### Failure Mode 2: Uncommitted Changes Included

**Symptom:** PR diff doesn't match expected changes
**Fix:** Invoke commit skill first, then re-run create-pr

### Failure Mode 3: Missing Breaking Changes

**Symptom:** Reviewer discovers undocumented breaking changes
**Fix:** Edit PR body to add Breaking Changes section with migration steps

### Failure Mode 4: Branch Not Pushed

**Symptom:** `gh pr create` fails with "branch not found on remote"
**Fix:** Run `git push -u origin $(git branch --show-current)` first

### Failure Mode 5: Empty Test Plan

**Symptom:** Reviewers ask "how do I test this?"
**Fix:** Add specific, actionable test scenarios with checkboxes

---

## Quick Workflow Summary

```
STEP 1: GATHER BRANCH CONTEXT
├── git branch --show-current
├── git status --short
├── git log main..HEAD
├── git diff main...HEAD
└── Gate: Context collected

STEP 2: PRE-PR VALIDATION
├── Not on protected branch?
├── Uncommitted changes? → invoke commit
├── Has commits vs base?
└── Gate: Branch ready

STEP 3: ANALYZE ALL COMMITS
├── Read all commit messages
├── Read full diff
├── Classify: type, scope, size, risk
├── Detect breaking changes
└── Gate: PR classified

STEP 4: PRE-PR QUALITY CHECKS
├── Conflict markers?
├── Type errors?
├── Lint errors?
└── Gate: No blocking issues

STEP 5: GENERATE PR TITLE
├── type(scope): description
├── Under 72 chars
├── Breaking? Add !
└── Gate: Title ready

STEP 6: GENERATE PR BODY
├── Summary (3-5 bullets)
├── Changes (if M/L/XL)
├── Breaking Changes (if any)
├── Test Plan (always)
├── Notes (if deployment/config)
└── Gate: Body complete

STEP 7: PUSH BRANCH
├── git push -u origin <branch>
└── Gate: Branch on remote

STEP 8: CREATE PR VIA GH CLI
├── gh pr create with heredoc
├── Add flags: --draft, --reviewer, etc.
└── Gate: PR created

STEP 9: VERIFY AND REPORT
├── gh pr view
├── Report URL and details
└── Gate: PR verified

STEP 10: VERIFICATION
├── Check 1: PR exists
├── Check 2: Content quality
├── Check 3: Breaking changes documented
├── Check 4: Branch state
├── Check 5: PR state
└── Gate: All 5 checks pass
```

---

## Completion Announcement

When PR is created, announce:

```
PR created.

**Quality Score: X/10**
- Context Gathering: X/2
- Validation: X/2
- Title Quality: X/2
- Body Quality: X/2
- Breaking Changes: X/2

**Pull Request:**
- PR #[number]: [title]
- URL: [url]
- Base: [base] <- [branch]
- State: [open/draft]
- Size: [S/M/L/XL] ([N] files, +[add] -[del])

**Verification:**
- PR exists: ✅
- Title format: ✅
- Test plan: ✅
- Breaking changes: [None/Documented]
- Branch synced: ✅

**Next steps:**
[Request reviewers, address CI, or wait for review]
```

---

## Integration with Other Skills

The `create-pr` skill integrates with:

- **`start`** — Use `start` to identify if PR creation is appropriate
- **`commit`** — Automatically invoked if uncommitted changes detected
- **`git-merge-expert-worktree`** — PRs can be created from worktree branches

**Workflow Chain:**

```
Work completed
       │
       ▼
commit skill (if uncommitted changes)
       │
       ▼
create-pr skill (this skill)
       │
       ▼
Review cycle
```

**Auto-Invoke Pattern:**

When `create-pr` detects uncommitted changes via `git status --short`, it automatically invokes the `commit` skill first. The user doesn't need to manually run commit before PR creation.

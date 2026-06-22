---
name: commit
description: Use when the user asks to commit changes. Analyzes diffs deeply to draft intelligent conventional commit messages, detects scope from branch names and file paths, runs pre-commit quality checks (TypeScript, ESLint, Prettier), scans for secrets and debug artifacts, splits unrelated changes into separate commits, and verifies success. Invoke via /commit or when user says "commit", "commit this", "make a commit".
---

<EXTREMELY-IMPORTANT>
Before creating ANY commit, you **ABSOLUTELY MUST**:

1. Read the actual diff content (not just file names)
2. Scan for secrets, .env files, and credentials
3. Check for conflict markers (<<<<<<<, =======, >>>>>>>)
4. Run type checking (tsc --noEmit)
5. Stage files explicitly by name (never git add -A or git add .)

**Committing without verification = leaked secrets, broken builds, lost work**

This is not optional. Every commit requires disciplined verification.
</EXTREMELY-IMPORTANT>

# Git Commit

## MANDATORY FIRST RESPONSE PROTOCOL

Before creating ANY commit, you **MUST** complete this checklist:

1. ☐ Run `git status --short` to see all changes
2. ☐ Run `git diff HEAD` to read actual code changes
3. ☐ Run `git branch --show-current` for scope inference
4. ☐ Scan for secrets/credentials in changed files
5. ☐ Scan for conflict markers
6. ☐ Run `npx tsc --noEmit` for type checking
7. ☐ Determine commit type from diff content
8. ☐ Announce: "Committing [type](scope): [description]"

**Creating commits WITHOUT completing this checklist = broken code in history.**

## Overview

Analyze all uncommitted changes, run quality checks, draft a Conventional Commits message with intelligent scope detection, stage files explicitly, and commit. No co-author trailers.

## When to Use

- User says "commit", "commit this", "make a commit", "/commit"
- User asks to commit after completing work
- $ARGUMENTS provided as commit guidance (e.g., `/commit fix the auth bug`)

**Never commit proactively.** Only when explicitly requested.

## Step 1: Gather Context

**Gate: Full diff read and understood before proceeding to Step 2.**

Run these commands to understand the full picture:

```bash
# Current state (never use -uall flag)
git status --short

# Full diff content — read the actual code changes, not just file names
git diff HEAD

# Branch name — used for scope inference
git branch --show-current

# Recent commits on this branch — for convention and scope consistency
git log --oneline -15

# Check if branch is ahead/behind remote
git status -sb
```

**Read the actual diff output.** `--stat` only shows file names. You need the full diff to understand what changed (new functions vs bug fixes vs refactors).

## Step 2: Analyze Changes

**Gate: Type and scope determined before proceeding to Step 3.**

### Determine Commit Type

Read the diff content and classify:

| Type | Signal |
|------|--------|
| `feat` | New functions, new files, new endpoints, new capabilities |
| `fix` | Bug fix, error handling correction, wrong logic fixed |
| `docs` | Only markdown, comments, or JSDoc changed |
| `style` | Formatting, semicolons, whitespace only |
| `refactor` | Restructured code, renamed variables, moved files, no behavior change |
| `perf` | Caching added, query optimized, algorithm improved |
| `test` | Test files added or modified |
| `build` | package.json, tsconfig, Dockerfile, CI config |
| `chore` | Maintenance, dependency bumps, config tweaks |

### Detect Scope

Follow this priority order:

1. **Branch name** — If branch is `feat/auth-system` or `fix/cart-totals`, extract `auth` or `cart` as scope
2. **File paths** — If all changes are in `src/mastra/tools/search/`, scope is `search`. If in `src/services/product/`, scope is `product`
3. **Recent commits** — Match scope conventions from `git log`. If recent commits use `feat(agents):`, use the same vocabulary
4. **Omit scope** — If changes span too many areas or no clear scope exists, omit it: `feat: description`

### Check for Splits

If changes serve **different purposes**, split into multiple commits:

- Changes in `src/services/product/` fixing a bug + changes in `src/mastra/agents/` adding a feature → two commits
- Changes all related to the same feature across multiple files → one commit

**To split:** identify the file groups, then execute Step 4-7 for each group sequentially.

### Commit Chain Consistency

Check `git log` for recent commits on the same branch. If previous commits use `feat(search):`, maintain the same scope spelling. Don't switch between `search`/`product-search`/`typesense` inconsistently.

## Step 3: Pre-Commit Safety Scan

**Gate: No secrets or conflict markers before proceeding to Step 4.**

Before staging, scan changed files for problems.

### Secrets and Sensitive Files

**Block these from being committed:**
- `.env`, `.env.*` files
- Files containing `API_KEY=`, `SECRET=`, `PASSWORD=`, `TOKEN=` with actual values
- `*.pem`, `*.key`, `credentials.json`, `serviceAccount.json`
- Files over 1MB (likely binary or data)

If found, warn the user and exclude from staging.

### Debug Artifacts

Search changed files for leftover debug code:

```bash
# Check changed files for debug statements
git diff HEAD --name-only | xargs grep -n 'console\.log\|debugger\|TODO.*REMOVE\|FIXME.*REMOVE' 2>/dev/null
```

If found, warn the user. Suggest removing before commit. Do not block — the user decides.

### Conflict Markers

```bash
git diff HEAD --name-only | xargs grep -n '<<<<<<<\|=======\|>>>>>>>' 2>/dev/null
```

If found, **do NOT commit**. These must be resolved first.

## Step 4: Run Quality Checks

**Gate: Type errors resolved before proceeding to Step 5.**

Run on changed `.ts` files only (not the entire codebase) for speed.

### TypeScript Type Check

```bash
npx tsc --noEmit
```

If type errors exist in changed files, show them and **do NOT commit** until resolved.

### ESLint (if configured)

```bash
# Check if ESLint config exists
ls .eslintrc* eslint.config.* 2>/dev/null

# If config exists, lint changed files only
git diff HEAD --name-only --diff-filter=d -- '*.ts' | xargs npx eslint
```

If no ESLint config exists, skip with a note: "ESLint skipped — no config found."
If lint errors found, show them. Auto-fixable errors: offer `npx eslint --fix <files>`.

### Prettier (always runs — works without config)

```bash
# Check formatting on changed files
git diff HEAD --name-only --diff-filter=d -- '*.ts' '*.json' '*.md' | xargs npx prettier --check
```

If formatting issues found:
1. Offer to auto-fix: `npx prettier --write <files>`
2. After fixing, the files will show as modified — they'll be included in staging

### If Checks Fail

- **Type errors:** Must fix. Do NOT commit.
- **Lint errors (auto-fixable):** Fix with `--fix`, then continue.
- **Lint errors (manual):** Show to user, ask whether to proceed or fix first.
- **Formatting issues:** Auto-fix with `prettier --write`, then continue.
- **After any auto-fixes:** Re-check to confirm clean.

## Step 5: Draft Commit Message

**Gate: Message follows conventions before proceeding to Step 6.**

### Format

```
<type>(<scope>): <description>

[body — when 5+ files changed or multiple logical areas]
```

### Rules

- **Imperative mood:** "add feature" not "added feature"
- **Subject line:** Under 72 characters, no period
- **Breaking changes:** Add an exclamation mark after scope, e.g. `feat(api)!: remove legacy endpoint`

### Body Generation

Add a body when:
- 5+ files changed
- Changes span multiple logical areas
- The "why" isn't obvious from the subject

Body format — bullet points, each starting with imperative verb:

```
feat(search): add vector similarity scoring

- Add cosine similarity function to search service
- Update product schema with embedding field
- Add migration for new vector column
- Update search tool to use new scoring
```

### $ARGUMENTS

If the user provided arguments (e.g., `/commit fix the payment bug`), use them as guidance:
- If it's a clear commit message, use it directly (respecting format rules)
- If it's guidance ("fix the payment bug"), use it to inform type and description

## Step 6: Stage Files

**Gate: Only intended files staged before proceeding to Step 7.**

**Always stage files explicitly by name.** Never use `git add -A` or `git add .`.

```bash
git add src/path/to/file1.ts src/path/to/file2.ts
```

**Never stage:**
- `.env`, `.env.*`
- `node_modules/`
- `*.pem`, `*.key`, credentials
- `.DS_Store`, `Thumbs.db`
- Files the user didn't intend to commit

If unsure whether a file should be included, ask the user.

## Step 7: Create Commit

**Gate: Commit created successfully before proceeding to Step 8.**

Use heredoc for proper message formatting:

```bash
git commit -m "$(cat <<'EOF'
type(scope): description

Optional body with bullet points
EOF
)"
```

**No co-author trailers.** The commit appears as solely the user's work.

**Never:**
- `--amend` unless user explicitly requests it
- `--no-verify` (never skip hooks)
- `--allow-empty`

## Step 8: Verify and Report

**Gate: Commit verified in log before proceeding to Step 9.**

After committing:

```bash
# Confirm commit was created
git log --oneline -1

# Check remaining state
git status --short

# Check if ahead of remote
git status -sb
```

Report to the user:
- The commit hash and message
- Whether the branch is ahead of remote (suggest `git push` if so)
- Whether there are remaining uncommitted changes
- If split commits were made, summarize all of them

## Safety Rules

| Rule | Reason |
|------|--------|
| Never commit proactively | Only when explicitly asked |
| Never use `git add -A` or `git add .` | Risks staging secrets, binaries |
| Never use `--amend` unprompted | Destroys previous commit |
| Never use `--no-verify` | Never skip pre-commit hooks |
| Never force push | Data loss risk |
| Never commit with type errors | Broken code should not be committed |
| Never commit conflict markers | Indicates unresolved merge |
| Never commit `.env` files | Contains secrets |
| Never add co-author trailers | User's explicit preference |

## Quick Reference: Scope Detection

```
1. Branch name?  feat/cart-totals → scope: cart
2. File paths?   src/mastra/tools/search/* → scope: search
3. Git log?      Recent commits use feat(agents): → scope: agents
4. None clear?   Omit scope: feat: description
```

## Quick Reference: Quality Check Order

```
1. Scan for conflict markers     → BLOCK if found
2. Scan for secrets/sensitive    → BLOCK those files
3. Scan for debug artifacts      → WARN (user decides)
4. Run tsc --noEmit              → BLOCK if type errors
5. Run eslint (if config exists) → FIX or WARN
6. Run prettier --check          → AUTO-FIX
7. All clear → proceed to stage and commit
```

## Step 9: Verification (MANDATORY)

After committing, verify complete workflow:

### Check 1: Commit Exists
- [ ] `git log --oneline -1` shows the new commit
- [ ] Commit hash and message match expectations

### Check 2: No Unintended Changes
- [ ] `git status --short` shows expected remaining state
- [ ] No secrets or sensitive files were staged

### Check 3: Message Quality
- [ ] Type is correct (feat/fix/refactor/etc.)
- [ ] Scope matches affected area
- [ ] Description is imperative mood, under 72 chars

### Check 4: Branch State
- [ ] Branch is ahead of remote (if pushing needed)
- [ ] No accidental commits to wrong branch

### Check 5: Clean Working State
- [ ] All intended changes are committed
- [ ] Remaining uncommitted files are expected

**Gate:** Do NOT mark commit complete until all 5 checks pass.

---

## Quality Checklist (Must Score 8/10)

Score yourself honestly before marking commit complete:

### Context Gathering (0-2 points)
- **0 points:** Committed without reading diff
- **1 point:** Read file names only (--stat)
- **2 points:** Read full diff content, understood changes

### Safety Scanning (0-2 points)
- **0 points:** Skipped security scan
- **1 point:** Partial scan (checked some patterns)
- **2 points:** Full scan: secrets, conflict markers, debug artifacts

### Quality Checks (0-2 points)
- **0 points:** Skipped type checking / linting
- **1 point:** Ran checks but proceeded with errors
- **2 points:** All checks pass (or user explicitly approved proceeding)

### Staging Discipline (0-2 points)
- **0 points:** Used git add -A or git add .
- **1 point:** Staged files but didn't verify list
- **2 points:** Staged files explicitly by name, verified before commit

### Message Quality (0-2 points)
- **0 points:** Generic message ("fix bug", "update")
- **1 point:** Has type but vague description
- **2 points:** Proper conventional commit with type, scope, imperative description

**Minimum passing score: 8/10**

---

## Common Rationalizations (All Wrong)

These are excuses. Don't fall for them:

- **"It's just a small change"** → STILL read the full diff
- **"I know what files changed"** → STILL run git status and diff
- **"The type check is slow"** → STILL run tsc --noEmit before committing
- **"git add . is faster"** → STILL stage files explicitly by name
- **".env is in .gitignore"** → STILL verify it wasn't staged
- **"I'll fix the commit message later"** → Get it right NOW, amending is risky
- **"There are no secrets"** → STILL scan for API_KEY, SECRET, TOKEN patterns
- **"Pre-commit hooks will catch it"** → YOU are responsible, not just hooks

---

## Failure Modes

### Failure Mode 1: Leaked Secrets

**Symptom:** .env file or API key committed to repository
**Fix:** Immediately rotate the secret. Use `git filter-branch` or BFG to remove from history.

### Failure Mode 2: Conflict Markers Committed

**Symptom:** Code has `<<<<<<<`, `=======`, `>>>>>>>` in committed files
**Fix:** Resolve conflicts properly, amend the commit with --amend.

### Failure Mode 3: Type Errors in Committed Code

**Symptom:** Build fails after commit, tsc shows errors
**Fix:** Fix type errors, create new commit (or --amend if not pushed).

### Failure Mode 4: Wrong Commit Type

**Symptom:** Feature labeled as fix, or vice versa
**Fix:** If not pushed, use `git commit --amend` to correct message.

### Failure Mode 5: Committed to Wrong Branch

**Symptom:** Changes on main/master instead of feature branch
**Fix:** Create new branch from HEAD, reset main: `git branch feature && git reset --hard origin/main`

---

## Quick Workflow Summary

```
STEP 1: GATHER CONTEXT
├── git status --short
├── git diff HEAD (read actual changes!)
├── git branch --show-current
└── Gate: Full diff understood

STEP 2: ANALYZE CHANGES
├── Determine type (feat/fix/refactor/etc.)
├── Detect scope from branch/files/log
├── Check if split needed
└── Gate: Type and scope determined

STEP 3: PRE-COMMIT SAFETY SCAN
├── Scan for secrets (.env, API_KEY, etc.)
├── Scan for conflict markers
├── Scan for debug artifacts
└── Gate: No blocking issues

STEP 4: RUN QUALITY CHECKS
├── tsc --noEmit (type check)
├── eslint (if configured)
├── prettier --check
└── Gate: Checks pass or user approves

STEP 5: DRAFT COMMIT MESSAGE
├── type(scope): description
├── Imperative mood, <72 chars
├── Body if 5+ files
└── Gate: Message ready

STEP 6: STAGE FILES
├── git add <files explicitly>
├── Never git add -A or git add .
├── Verify staged files
└── Gate: Correct files staged

STEP 7: CREATE COMMIT
├── git commit with heredoc
├── No --amend unless requested
├── No --no-verify ever
└── Gate: Commit created

STEP 8: VERIFY AND REPORT
├── git log --oneline -1
├── git status --short
└── Gate: Commit verified

STEP 9: VERIFICATION
├── Check 1: Commit exists
├── Check 2: No unintended changes
├── Check 3: Message quality
├── Check 4: Branch state
├── Check 5: Clean working state
└── Gate: All 5 checks pass
```

---

## Completion Announcement

When commit is complete, announce:

```
Commit complete.

**Quality Score: X/10**
- Context Gathering: X/2
- Safety Scanning: X/2
- Quality Checks: X/2
- Staging Discipline: X/2
- Message Quality: X/2

**Commit:**
- Hash: [short hash]
- Message: [full message]
- Files: [count] files changed

**Verification:**
- Commit exists: ✅
- No secrets staged: ✅
- Type errors: None
- Branch: [branch name] (ahead by [N] commits)

**Next steps:**
[Push, create PR, or continue work]
```

---

## Integration with Other Skills

The `commit` skill integrates with:

- **`start`** — Use `start` to identify if commit is needed after work
- **`create-pr`** — After committing, invoke `create-pr` to submit for review
- **`git-merge-expert-worktree`** — Commit within worktrees follows same workflow

**Workflow Chain:**

```
Work completed
       │
       ▼
commit skill (this skill)
       │
       ▼
create-pr skill (if submitting for review)
```

**Auto-Invoke Pattern:**

When `create-pr` detects uncommitted changes, it automatically invokes `commit` first. You don't need to manually sequence them.

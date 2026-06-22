<!--
Based on Anthropic's code-simplifier subagent:
https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-simplifier/agents/code-simplifier.md
-->

---
name: code-simplify
description: Use when the user asks to simplify, clean up, or improve clarity of code. Analyzes code for unnecessary complexity, redundant abstractions, deep nesting, and unclear naming, then applies targeted simplifications while preserving all behavior. Invoke via /code-simplify or when user says "simplify this", "clean up this code", "make this simpler", "reduce complexity".
---

<EXTREMELY-IMPORTANT>
Before simplifying ANY code, you **ABSOLUTELY MUST**:

1. Read the actual code and understand what it does
2. Identify existing tests that cover the code
3. Run existing tests to establish a passing baseline
4. Confirm the scope of simplification with the user
5. Never change what the code does — only how it is written

**Simplifying without understanding = broken behavior, lost functionality, introduced bugs**

This is not optional. Every simplification requires disciplined verification.
</EXTREMELY-IMPORTANT>

# Code Simplify

## MANDATORY FIRST RESPONSE PROTOCOL

Before simplifying ANY code, you **MUST** complete this checklist:

1. ☐ Read the target code thoroughly (not just skim)
2. ☐ Identify what the code does (inputs, outputs, side effects)
3. ☐ Check for existing tests covering the target code
4. ☐ Run existing tests to establish a passing baseline
5. ☐ Read CLAUDE.md for project-specific standards (if it exists)
6. ☐ Identify simplification opportunities (list them)
7. ☐ Classify each opportunity by type (extract, flatten, rename, consolidate, eliminate)
8. ☐ Announce: "Simplifying [scope]: [N] opportunities identified across [M] files"

**Simplifying code WITHOUT completing this checklist = regressions and lost functionality.**

## Overview

Analyze code for unnecessary complexity and apply targeted simplifications that improve clarity, consistency, and maintainability — without changing behavior. The skill is language-agnostic: it works for any language and follows project-specific standards from CLAUDE.md when available.

**What this skill does:**
- Reduces nesting depth (flatten conditionals, extract early returns)
- Eliminates redundant code (dead imports, unreachable branches, unused variables)
- Improves naming (unclear abbreviations → descriptive names)
- Consolidates duplicate logic (repeated patterns → shared functions)
- Simplifies boolean and conditional expressions
- Replaces clever code with readable code

**What this skill does NOT do:**
- Change functionality or behavior
- Add new features or capabilities
- Refactor architecture (use a dedicated refactoring approach for that)
- Optimize performance (simplification may happen to improve performance, but that is not the goal)
- Add comments, documentation, or type annotations to unchanged code

## When to Use

- User says "simplify", "clean up", "make this simpler", "reduce complexity", "/code-simplify"
- User asks to improve code clarity or readability
- User points to specific code and asks to make it easier to understand
- $ARGUMENTS provided as simplification guidance (e.g., `/code-simplify flatten the nested ifs in auth.ts`)

**Never simplify proactively.** Only when explicitly requested.

## When NOT to Use

- **Code is already clear** — don't simplify code that is already readable and well-structured
- **Changes require architectural decisions** — if simplification requires rethinking the design, discuss with the user first
- **Test code** — don't simplify test code unless the user explicitly asks; test verbosity often aids debugging
- **Generated code** — don't simplify auto-generated files (protobuf, GraphQL codegen, etc.)
- **Performance-critical paths** — if code is complex for performance reasons, simplification may degrade performance

## Step 1: Gather Context

**Gate: Code read and understood before proceeding to Step 2.**

Read the target code and understand its purpose:

1. Read the files the user wants simplified
2. Read CLAUDE.md (if it exists) for project standards and conventions
3. Check for existing tests covering the target code
4. Run existing tests to confirm they pass:

```bash
# Run project test suite (adapt command to project)
# npm test / pytest / cargo test / go test ./...
```

5. Check recent git history for the files to understand recent changes:

```bash
git log --oneline -10 -- <file paths>
```

**Read the actual code.** Skimming file names is not enough. You must understand what every function does before deciding what to simplify.

## Step 2: Identify Simplification Targets

**Gate: All targets identified and classified before proceeding to Step 3.**

Scan the code for simplification opportunities. Look for these signals:

| Signal | Indicates |
|--------|-----------|
| Nesting depth > 3 levels | Flatten with early returns or extraction |
| Repeated code blocks (3+ occurrences) | Consolidate into shared function |
| Function > 40 lines | Extract sub-functions |
| Boolean expressions with > 2 operators | Extract into named variable or function |
| Nested ternary operators | Replace with if/else or switch |
| Unused imports, variables, or parameters | Eliminate dead code |
| Unclear or abbreviated names | Rename for clarity |
| Callback pyramids (3+ levels) | Flatten with async/await or pipeline |
| `if (x === true)` / `if (x === false)` | Simplify boolean expressions |
| Multiple parameters (> 4) | Use parameter object or defaults |

For each opportunity found, note:
- **Location** (file:line)
- **Type** (flatten, extract, rename, consolidate, eliminate, simplify)
- **Risk** (low: cosmetic, medium: structural, high: logic-adjacent)

## Step 3: Classify Each Simplification

**Gate: Each simplification classified with risk level before proceeding to Step 4.**

Categorize every identified target:

| Category | Description | Risk Level |
|----------|-------------|------------|
| **Flatten** | Reduce nesting via early returns, guard clauses | Low-Medium |
| **Extract** | Pull complex expressions into named variables or functions | Low |
| **Rename** | Replace unclear names with descriptive ones | Low |
| **Consolidate** | Merge duplicated code into shared functions | Medium |
| **Eliminate** | Remove dead code (unused imports, unreachable branches) | Low |
| **Simplify** | Reduce boolean/conditional complexity | Low-Medium |
| **Restructure** | Flatten callbacks, reduce parameter counts | Medium |

**High-risk simplifications (any that touch logic flow) require explicit user confirmation before applying.**

## Step 4: Plan Changes

**Gate: User has reviewed and approved the plan before proceeding to Step 5.**

Present the simplification plan to the user. For each change, show:

1. **File and location** — where the change will be made
2. **Category** — what type of simplification (from Step 3)
3. **Before** — the current code (abbreviated if long)
4. **After** — what the simplified code will look like
5. **Why** — one sentence explaining why this is simpler

Use AskUserQuestion if the user needs to choose between alternatives or approve scope.

**Do NOT proceed to Step 5 without user confirmation.** The user must see and approve the plan.

## Step 5: Apply Simplifications

**Gate: All edits applied cleanly before proceeding to Step 6.**

Apply the approved simplifications:

1. Make edits one file at a time using the Edit tool
2. Apply changes in order from lowest-risk to highest-risk
3. After each file, verify the edits are syntactically valid
4. If a simplification creates an unexpected cascade (other code depends on renamed function, etc.), stop and inform the user

**Rules during application:**
- Never change function signatures visible to external callers without user approval
- Never change return values or side effects
- Never remove error handling
- Preserve all existing comments unless they describe removed code
- Follow the project's existing code style (indentation, quotes, semicolons)

## Step 6: Verify Behavior Preserved

**Gate: All tests pass and no type errors before proceeding to Step 7.**

After applying simplifications, verify nothing broke:

1. Run the project's test suite:

```bash
# Run tests (adapt to project)
# npm test / pytest / cargo test / go test ./...
```

2. Run type checking (if applicable):

```bash
# TypeScript: npx tsc --noEmit
# Python: mypy / pyright
# Go: go vet ./...
```

3. Compare test results against the baseline from Step 1
4. If any test fails, **revert the change that caused it** and report to the user

**If tests fail after simplification, the simplification was wrong.** Do not adjust tests to match simplified code — the original behavior is correct.

## Step 7: Report Results

**Gate: Summary complete before marking skill done.**

Present a summary of what was simplified:

For each change made:
- **File:line** — location
- **Category** — type of simplification
- **Before → After** — brief description of the change
- **Lines** — net change in line count (if relevant)

Include overall metrics:
- Total simplifications applied
- Total files modified
- Test results (all passing / any failures)
- Net complexity change (qualitative assessment)

---

## Simplification Patterns Reference

Concrete patterns with before/after examples. Use these as a catalog when identifying targets.

### Pattern 1: Flatten Nested Conditionals

**Before:**
```
if (user) {
  if (user.isActive) {
    if (user.hasPermission('admin')) {
      return doAdminAction(user);
    }
  }
}
return null;
```

**After:**
```
if (!user) return null;
if (!user.isActive) return null;
if (!user.hasPermission('admin')) return null;
return doAdminAction(user);
```

### Pattern 2: Extract Complex Expressions

**Before:**
```
if (items.length > 0 && items.every(i => i.status === 'ready') && !isProcessing && currentUser.role !== 'viewer') {
  startBatch(items);
}
```

**After:**
```
const hasReadyItems = items.length > 0 && items.every(i => i.status === 'ready');
const canProcess = !isProcessing && currentUser.role !== 'viewer';

if (hasReadyItems && canProcess) {
  startBatch(items);
}
```

### Pattern 3: Replace Nested Ternaries

**Before:**
```
const label = status === 'active' ? 'Active' : status === 'pending' ? 'Pending' : status === 'disabled' ? 'Disabled' : 'Unknown';
```

**After:**
```
function getStatusLabel(status) {
  switch (status) {
    case 'active': return 'Active';
    case 'pending': return 'Pending';
    case 'disabled': return 'Disabled';
    default: return 'Unknown';
  }
}
const label = getStatusLabel(status);
```

### Pattern 4: Consolidate Duplicate Logic

**Before:**
```
function createUser(data) {
  validateName(data.name);
  validateEmail(data.email);
  validateAge(data.age);
  return db.users.insert(data);
}

function updateUser(id, data) {
  validateName(data.name);
  validateEmail(data.email);
  validateAge(data.age);
  return db.users.update(id, data);
}
```

**After:**
```
function validateUserData(data) {
  validateName(data.name);
  validateEmail(data.email);
  validateAge(data.age);
}

function createUser(data) {
  validateUserData(data);
  return db.users.insert(data);
}

function updateUser(id, data) {
  validateUserData(data);
  return db.users.update(id, data);
}
```

### Pattern 5: Eliminate Dead Code

**Before:**
```
import { format, parse, isValid, addDays } from 'date-fns';  // parse and addDays unused

function processDate(input) {
  // Old implementation (kept for reference)
  // const parsed = parse(input, 'yyyy-MM-dd', new Date());

  if (isValid(new Date(input))) {
    return format(new Date(input), 'MMM d, yyyy');
  }
  return 'Invalid date';
}
```

**After:**
```
import { format, isValid } from 'date-fns';

function processDate(input) {
  if (isValid(new Date(input))) {
    return format(new Date(input), 'MMM d, yyyy');
  }
  return 'Invalid date';
}
```

### Pattern 6: Simplify Boolean Expressions

**Before:**
```
if (isEnabled === true) { ... }
if (items.length === 0 ? true : false) { ... }
if (!!value) { ... }
return condition ? true : false;
```

**After:**
```
if (isEnabled) { ... }
if (items.length === 0) { ... }
if (value) { ... }
return condition;
```

### Pattern 7: Reduce Function Parameters

**Before:**
```
function sendEmail(to, from, subject, body, cc, bcc, replyTo, isHtml) {
  // ...
}
sendEmail('a@b.com', 'c@d.com', 'Hello', '<p>Hi</p>', null, null, null, true);
```

**After:**
```
function sendEmail({ to, from, subject, body, cc, bcc, replyTo, isHtml = false }) {
  // ...
}
sendEmail({ to: 'a@b.com', from: 'c@d.com', subject: 'Hello', body: '<p>Hi</p>', isHtml: true });
```

### Pattern 8: Flatten Callback Pyramids

**Before:**
```
getUser(id, function(err, user) {
  if (err) return handleError(err);
  getOrders(user.id, function(err, orders) {
    if (err) return handleError(err);
    getInvoices(orders, function(err, invoices) {
      if (err) return handleError(err);
      sendReport(user, invoices);
    });
  });
});
```

**After:**
```
try {
  const user = await getUser(id);
  const orders = await getOrders(user.id);
  const invoices = await getInvoices(orders);
  await sendReport(user, invoices);
} catch (err) {
  handleError(err);
}
```

---

## Safety Rules

| Rule | Reason |
|------|--------|
| Never change behavior | Simplification must preserve all inputs, outputs, and side effects |
| Never simplify without reading first | You must understand code before changing it |
| Never simplify test assertions | Tests define expected behavior; changing them masks bugs |
| Never remove error handling | Error handling exists for a reason, even if verbose |
| Never simplify generated code | It will be overwritten on next generation |
| Never apply changes without user approval | User must see the plan before edits are made |
| Always run tests before AND after | Establishes baseline and catches regressions |
| Always follow project conventions | Read CLAUDE.md; don't impose external style preferences |
| Never add improvements beyond simplification | Scope is clarity, not features or performance |

---

## Quick Reference: Simplification Decision

```
Is the code hard to understand?
├── YES → Is it because of deep nesting?
│          ├── YES → Flatten (early returns, guard clauses)
│          └── NO → Is it because of complex expressions?
│                    ├── YES → Extract (named variables/functions)
│                    └── NO → Is it because of unclear names?
│                              ├── YES → Rename
│                              └── NO → Is it duplicated?
│                                        ├── YES → Consolidate
│                                        └── NO → Is there dead code?
│                                                  ├── YES → Eliminate
│                                                  └── NO → Leave it alone
└── NO → Don't simplify it
```

---

## Step 8: Verification (MANDATORY)

After simplifying, verify complete workflow:

### Check 1: Behavior Preserved
- [ ] All existing tests pass (same results as baseline)
- [ ] No type errors introduced

### Check 2: Scope Respected
- [ ] Only approved simplifications were applied
- [ ] No changes outside the agreed scope

### Check 3: Code Quality
- [ ] Simplified code is genuinely clearer than the original
- [ ] No clever or obscure patterns introduced

### Check 4: Project Standards
- [ ] Changes follow CLAUDE.md conventions (if applicable)
- [ ] No style inconsistencies with surrounding code

### Check 5: Clean State
- [ ] All files are saved
- [ ] No partial edits or leftover debugging code

**Gate:** Do NOT mark simplification complete until all 5 checks pass.

---

## Quality Checklist (Must Score 8/10)

Score yourself honestly before marking simplification complete:

### Context Gathering (0-2 points)
- **0 points:** Simplified without reading the code first
- **1 point:** Read the code but skipped tests/standards check
- **2 points:** Read code, ran tests, checked CLAUDE.md for conventions

### Target Identification (0-2 points)
- **0 points:** Applied random changes without systematic analysis
- **1 point:** Found some opportunities but missed obvious ones
- **2 points:** Systematically identified and classified all targets

### User Communication (0-2 points)
- **0 points:** Applied changes without showing the user
- **1 point:** Showed partial plan, skipped some changes
- **2 points:** Full plan shown with before/after for each change, user approved

### Behavior Preservation (0-2 points)
- **0 points:** Tests fail after simplification
- **1 point:** Tests pass but didn't verify edge cases
- **2 points:** All tests pass, type checks pass, behavior verified identical

### Result Quality (0-2 points)
- **0 points:** Code is not meaningfully clearer
- **1 point:** Some improvements but inconsistent
- **2 points:** Every change genuinely improves clarity without sacrificing readability

**Minimum passing score: 8/10**

---

## Common Rationalizations (All Wrong)

These are excuses. Don't fall for them:

- **"It's obvious what this code does"** → STILL read it thoroughly before simplifying
- **"These tests are slow"** → STILL run them before and after changes
- **"The user wants it simpler, not tested"** → STILL verify behavior is preserved
- **"This is just renaming, it can't break anything"** → STILL check for all references
- **"I'll show the user after I'm done"** → STILL present the plan before applying changes
- **"The code style is bad everywhere"** → STILL only change what was requested
- **"Fewer lines is always better"** → Clarity over brevity; explicit beats compact
- **"This clever one-liner is equivalent"** → Readable code beats clever code every time

---

## Failure Modes

### Failure Mode 1: Behavior Changed

**Symptom:** Tests fail after simplification, or code produces different outputs
**Fix:** Revert the change immediately. Re-read the original code, understand the behavior you missed, and re-plan.

### Failure Mode 2: Over-Simplification

**Symptom:** Code is shorter but harder to understand (dense one-liners, nested ternaries, clever tricks)
**Fix:** Revert and apply the principle: clarity over brevity. Explicit code is simpler than compact code.

### Failure Mode 3: Scope Creep

**Symptom:** Started simplifying one function, ended up refactoring the whole module
**Fix:** Stop. Return to the approved scope. Only simplify what was agreed upon in Step 4.

### Failure Mode 4: Broken References

**Symptom:** Renamed a function or variable but missed some call sites
**Fix:** Use project-wide search (Grep) to find all references before renaming. Apply renames with replace_all.

### Failure Mode 5: Style Inconsistency

**Symptom:** Simplified code follows different conventions than surrounding code
**Fix:** Re-read CLAUDE.md and the surrounding code. Match the project's existing style, not your preferred style.

---

## Quick Workflow Summary

```
STEP 1: GATHER CONTEXT
├── Read target code thoroughly
├── Run existing tests (baseline)
├── Read CLAUDE.md for standards
└── Gate: Code understood

STEP 2: IDENTIFY TARGETS
├── Scan for simplification signals
├── Note location, type, risk for each
└── Gate: All targets identified

STEP 3: CLASSIFY
├── Categorize: flatten, extract, rename, consolidate, eliminate, simplify
├── Assign risk levels
└── Gate: All targets classified

STEP 4: PLAN CHANGES
├── Show before/after for each change
├── Get user approval
└── Gate: User approved plan

STEP 5: APPLY SIMPLIFICATIONS
├── Edit files one at a time
├── Low-risk first, high-risk last
└── Gate: All edits applied cleanly

STEP 6: VERIFY BEHAVIOR
├── Run tests (compare to baseline)
├── Run type checks
└── Gate: All tests pass

STEP 7: REPORT RESULTS
├── Summarize changes made
├── Show metrics
└── Gate: Summary complete

STEP 8: VERIFICATION (MANDATORY)
├── Check 1: Behavior preserved
├── Check 2: Scope respected
├── Check 3: Code quality
├── Check 4: Project standards
├── Check 5: Clean state
└── Gate: All 5 checks pass
```

---

## Completion Announcement

When simplification is complete, announce:

```
Simplification complete.

**Quality Score: X/10**
- Context Gathering: X/2
- Target Identification: X/2
- User Communication: X/2
- Behavior Preservation: X/2
- Result Quality: X/2

**Summary:**
- Files modified: [count]
- Simplifications applied: [count]
- Categories: [list of categories used]
- Net line change: [+/-N lines]

**Verification:**
- Tests pass: ✅
- Type checks pass: ✅
- Behavior preserved: ✅
- Scope respected: ✅

**Next steps:**
[Commit changes, review further files, or continue work]
```

---

## Integration with Other Skills

The `code-simplify` skill integrates with:

- **`commit`** — After simplifying, invoke `commit` to commit the changes
- **`create-pr`** — After committing, invoke `create-pr` to submit for review
- **`plan-to-task-list-with-dag`** — For large-scale simplification spanning many files, use `plan-to-task-list-with-dag` first to design the approach

**Workflow Chain:**

```
User requests simplification
       │
       ▼
code-simplify skill (this skill)
       │
       ▼
commit skill (commit the changes)
       │
       ▼
create-pr skill (if submitting for review)
```

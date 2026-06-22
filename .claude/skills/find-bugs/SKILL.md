---
name: find-bugs
description: Use when the user asks to find bugs, review changes, security audit, or check code quality on the current branch. Analyzes full diffs against the default branch, maps attack surfaces, runs a security checklist against every changed file, verifies findings against context, and reports prioritized issues. Invoke via /find-bugs or when user says "find bugs", "review my changes", "security review", "audit this code".
---

<EXTREMELY-IMPORTANT>
Before reporting ANY bug or vulnerability, you **ABSOLUTELY MUST**:

1. Read the complete diff (every changed line, not just file names)
2. Read surrounding context to verify the issue is real
3. Check if the issue is already handled elsewhere in the changed code
4. Search for existing tests that cover the scenario
5. Never report stylistic issues as bugs — only real defects and vulnerabilities

**Reporting without verification = false positives, wasted developer time, eroded trust**

This is not optional. Every finding requires disciplined verification.
</EXTREMELY-IMPORTANT>

# Find Bugs

## MANDATORY FIRST RESPONSE PROTOCOL

Before reporting ANY findings, you **MUST** complete this checklist:

1. ☐ Get the full diff against the default branch (every changed line)
2. ☐ List all modified files and confirm each was read completely
3. ☐ Identify the default branch name (main/master/develop)
4. ☐ Map attack surfaces for each changed file
5. ☐ Run the security checklist against every changed file
6. ☐ Verify each potential finding against surrounding context
7. ☐ Classify findings by severity (Critical/High/Medium/Low)
8. ☐ Announce: "Reviewing [N] files on branch [name]: [M] findings across [categories]"

**Reporting findings WITHOUT completing this checklist = false positives and missed real bugs.**

## Overview

Analyze all changes on the current branch compared to the default branch. Find bugs, security vulnerabilities, and code quality issues. Report findings with evidence and concrete fix suggestions.

**What this skill does:**
- Reviews every changed line in the branch diff
- Maps attack surfaces (user inputs, DB queries, auth checks, external calls)
- Runs a comprehensive security checklist against all changed files
- Verifies each finding is real (not already handled, not a false positive)
- Reports prioritized findings with severity, evidence, and fix suggestions

**What this skill does NOT do:**
- Make any code changes (report only — the user decides what to fix)
- Report stylistic or formatting issues
- Invent issues when the code is clean
- Review unchanged code (only the branch diff is in scope)
- Run automated security tools (this is manual expert review)

## When to Use

- User says "find bugs", "review changes", "security review", "audit code", "/find-bugs"
- User asks to check their branch for issues before merging
- User wants a security review of recent changes
- $ARGUMENTS provided as review guidance (e.g., `/find-bugs focus on auth changes`)

**Never review proactively.** Only when explicitly requested.

## When NOT to Use

- **No changes on branch** — if the branch is identical to the default branch, there is nothing to review
- **User wants code changes** — this skill reports only; use other skills to fix issues
- **Automated scanning needed** — for SAST/DAST tools, use the project's CI pipeline
- **Full codebase audit** — this skill reviews branch changes only, not the entire codebase
- **Style review** — this skill finds bugs and vulnerabilities, not formatting issues

## Step 1: Gather the Full Diff

**Gate: Every changed line read and understood before proceeding to Step 2.**

Get the complete diff against the default branch:

```bash
# Detect default branch
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'

# Full diff — read EVERY line, not just file names
git diff <default-branch>...HEAD

# List all changed files
git diff --name-only <default-branch>...HEAD
```

If the diff output is large or truncated:
1. Get the file list with `git diff --name-only`
2. Read each changed file individually using the Read tool
3. Compare against the base version: `git show <default-branch>:<file-path>`

**You must read every changed line.** Skimming file names or reading only `--stat` output will miss bugs.

## Step 2: Map Attack Surfaces

**Gate: Attack surface map complete for every changed file before proceeding to Step 3.**

For each changed file, identify and catalog:

| Surface | What to Look For |
|---------|-----------------|
| **User inputs** | Request params, headers, body, URL components, query strings, form data |
| **Database queries** | SQL statements, ORM calls, raw queries, aggregation pipelines |
| **Auth checks** | Authentication verification, authorization gates, role checks |
| **Session/state** | Session reads/writes, cookie operations, token handling |
| **External calls** | HTTP requests, API calls, file system operations, process spawning |
| **Crypto operations** | Hashing, encryption, random number generation, key management |
| **Data serialization** | JSON parsing, XML parsing, deserialization of untrusted data |
| **File operations** | Path construction, file reads/writes, uploads, directory traversal |

Create a file-by-file map. Files with zero attack surfaces (pure UI, config, tests) can be noted as low-risk but must still be checked for logic bugs.

## Step 3: Run Security Checklist

**Gate: Every checklist item evaluated against every changed file before proceeding to Step 4.**

Check **every** item against **every** changed file. Do not skip items because "they probably don't apply."

### 3.1 Injection

- [ ] **SQL injection** — Are user inputs parameterized in all queries? Look for string concatenation in SQL.
- [ ] **Command injection** — Are user inputs passed to shell commands, `exec`, `spawn`, or `system` calls?
- [ ] **Template injection** — Are user inputs rendered in templates without escaping?
- [ ] **Header injection** — Are user inputs used in HTTP headers without sanitization?
- [ ] **Path traversal** — Are user inputs used to construct file paths without validation?

### 3.2 Cross-Site Scripting (XSS)

- [ ] Are all outputs in HTML templates properly escaped?
- [ ] Are user inputs reflected in `innerHTML`, `dangerouslySetInnerHTML`, or equivalent?
- [ ] Are URL parameters rendered without sanitization?

### 3.3 Authentication & Authorization

- [ ] Do all protected operations verify authentication?
- [ ] Is authorization checked (not just authentication)? Can user A access user B's data?
- [ ] Are IDOR vulnerabilities present (direct object references without ownership checks)?
- [ ] Are API endpoints protected consistently with their UI counterparts?

### 3.4 Session & CSRF

- [ ] Are state-changing operations protected against CSRF?
- [ ] Are session tokens regenerated after authentication?
- [ ] Do session cookies have Secure, HttpOnly, SameSite flags?
- [ ] Is session expiration configured?

### 3.5 Race Conditions

- [ ] Are there TOCTOU (time-of-check-time-of-use) patterns in read-then-write operations?
- [ ] Are concurrent modifications handled (optimistic locking, transactions)?
- [ ] Could parallel requests cause double-spending, double-creation, or state corruption?

### 3.6 Cryptography & Secrets

- [ ] Is cryptographically secure random used (not `Math.random()`, not `random.random()`)?
- [ ] Are proper algorithms used (not MD5/SHA1 for security, not ECB mode)?
- [ ] Are secrets absent from logs, error messages, and source code?
- [ ] Are API keys, tokens, or credentials hardcoded?

### 3.7 Information Disclosure

- [ ] Do error messages expose internal details (stack traces, SQL queries, file paths)?
- [ ] Are debug endpoints or verbose logging left enabled?
- [ ] Are timing attacks possible on authentication or comparison operations?

### 3.8 Denial of Service

- [ ] Are there unbounded operations (unbounded loops, unlimited file uploads, no pagination)?
- [ ] Are rate limits present on authentication and expensive operations?
- [ ] Could regex patterns cause ReDoS (catastrophic backtracking)?
- [ ] Are resource limits set for memory, CPU, or connection pools?

### 3.9 Business Logic

- [ ] Are edge cases handled (empty arrays, null values, negative numbers, zero)?
- [ ] Are state machine transitions validated (can't go from "shipped" back to "draft")?
- [ ] Are numeric operations safe (integer overflow, floating-point precision, division by zero)?
- [ ] Are assumptions about data ordering or uniqueness validated?

## Step 4: Find Logic Bugs

**Gate: All logic bug patterns checked before proceeding to Step 5.**

Beyond security, check for common logic bugs in the changed code:

| Bug Pattern | What to Look For |
|-------------|-----------------|
| **Off-by-one errors** | Loop bounds, array indexing, pagination, slice operations |
| **Null/undefined access** | Missing null checks before property access or method calls |
| **Async errors** | Missing `await`, unhandled promise rejections, race conditions |
| **Type coercion** | `==` vs `===`, implicit conversions, truthy/falsy misuse |
| **Resource leaks** | Unclosed connections, file handles, event listeners not removed |
| **Error swallowing** | Empty catch blocks, errors logged but not propagated |
| **Stale closures** | Variables captured by closures that change after capture |
| **Copy-paste errors** | Duplicated code with inconsistent modifications |
| **Boundary conditions** | Empty inputs, maximum values, Unicode, special characters |
| **Missing return** | Functions that should return but fall through |

## Step 5: Verify Each Finding

**Gate: Every finding verified as real (not a false positive) before proceeding to Step 6.**

For each potential issue found in Steps 3-4:

1. **Check surrounding context** — Is the issue already handled by middleware, a wrapper, or a parent function?
2. **Search for existing tests** — Does a test already cover this scenario? If so, the code may be correct.
3. **Check framework guarantees** — Does the framework (React, Django, Rails, etc.) auto-escape or auto-sanitize here?
4. **Read the full function** — Not just the changed lines. The fix might be elsewhere in the same function.
5. **Confirm exploitability** — For security issues, can the vulnerability actually be triggered? What is the attack vector?

**If you cannot confirm the issue is real after these checks, downgrade it to "Potential" or drop it entirely.**

Do not report issues you are not confident about. False positives waste developer time and erode trust.

## Step 6: Classify and Prioritize

**Gate: All findings classified by severity before proceeding to Step 7.**

Assign severity to each verified finding:

| Severity | Criteria | Examples |
|----------|----------|---------|
| **Critical** | Exploitable now, data loss or unauthorized access possible | SQL injection, auth bypass, RCE, hardcoded credentials |
| **High** | Significant risk, requires specific conditions to exploit | XSS with user interaction, IDOR, missing auth on API endpoint |
| **Medium** | Moderate risk, limited impact or requires insider access | CSRF on non-sensitive operation, information disclosure, missing rate limit |
| **Low** | Minor risk, unlikely to be exploited, or minimal impact | Missing security headers, verbose error messages, non-critical race condition |

**Prioritization order:** Critical → High → Medium → Low. Within the same severity, security vulnerabilities before logic bugs before code quality.

## Step 7: Pre-Conclusion Audit

**Gate: Audit checklist complete before proceeding to Step 8.**

Before finalizing findings, you **MUST** verify completeness:

1. **File coverage** — List every changed file and confirm you read it completely
2. **Checklist coverage** — For each security checklist item (3.1–3.9), note whether you found issues or confirmed it clean
3. **Gaps** — List any areas you could NOT fully verify and explain why
4. **False positive check** — Review each finding one more time: is it real? Is the evidence solid?

Only then proceed to report findings.

## Step 8: Report Findings

**Gate: Report delivered before marking review complete.**

Present findings in this format. **Do not make code changes — report only.**

For each finding:

- **File:Line** — Brief description
- **Severity:** Critical / High / Medium / Low
- **Category:** Security (injection, XSS, auth, etc.) / Logic Bug / Code Quality
- **Problem:** What is wrong — specific and concrete
- **Evidence:** Why this is real (not already handled, no existing test, framework doesn't auto-protect)
- **Attack vector** (security issues only): How could this be exploited?
- **Fix:** Concrete suggestion with code snippet if helpful
- **References:** OWASP, CWE, RFC, or other standards (if applicable)

### Report Structure

```
## Findings Summary

| # | Severity | Category | File | Description |
|---|----------|----------|------|-------------|
| 1 | Critical | Security | auth.ts:42 | SQL injection in login query |
| 2 | High | Logic | cart.ts:87 | Race condition on checkout |
| ... | ... | ... | ... | ... |

## Detailed Findings

### Finding 1: [Title]
[Full details per format above]

### Finding 2: [Title]
...

## Files Reviewed
[List every file, confirm read completely]

## Checklist Coverage
[For each section 3.1–3.9, note: clean / finding #N / could not verify]

## Areas Not Fully Verified
[Any gaps and why]
```

**If you find nothing significant, say so explicitly.** Do not invent issues to appear thorough. A clean review is a valid outcome.

---

## Safety Rules

| Rule | Reason |
|------|--------|
| Never make code changes | This is a report-only skill; user decides what to fix |
| Never skip files in the diff | Every changed file must be reviewed |
| Never skip checklist items | Every security check applies to every file |
| Never report unverified findings | False positives waste time and erode trust |
| Never report style issues as bugs | Formatting is not a bug |
| Never invent issues | A clean review is a valid and honest outcome |
| Always read full diff content | File names alone miss bugs |
| Always check surrounding context | Issues may be handled elsewhere |
| Always prioritize security over style | Security vulnerabilities > logic bugs > code quality |

---

## Quick Reference: Severity Classification

```
Can it be exploited remotely without authentication?
├── YES → Is data loss or unauthorized access possible?
│          ├── YES → CRITICAL
│          └── NO → HIGH
└── NO → Does it require specific conditions or insider access?
           ├── YES → Is the impact significant?
           │          ├── YES → MEDIUM
           │          └── NO → LOW
           └── NO → Is it a real defect (not style)?
                      ├── YES → LOW
                      └── NO → Don't report it
```

---

## Step 9: Verification (MANDATORY)

After completing the review, verify the full workflow:

### Check 1: Complete Coverage
- [ ] Every changed file was read completely (not just file names)
- [ ] Every security checklist item (3.1–3.9) was evaluated

### Check 2: Finding Quality
- [ ] Every finding was verified against surrounding context
- [ ] No false positives (each finding has concrete evidence)
- [ ] No invented issues (if nothing found, said so honestly)

### Check 3: Severity Accuracy
- [ ] Severity levels match the classification criteria
- [ ] Prioritization is correct (security > logic > quality)

### Check 4: Report Completeness
- [ ] Files reviewed list is complete
- [ ] Checklist coverage section present
- [ ] Gaps and limitations documented

### Check 5: Scope Discipline
- [ ] Only branch changes were reviewed (not the entire codebase)
- [ ] No code changes were made (report only)

**Gate:** Do NOT mark review complete until all 5 checks pass.

---

## Quality Checklist (Must Score 8/10)

Score yourself honestly before marking review complete:

### Diff Coverage (0-2 points)
- **0 points:** Skimmed file names or read partial diff
- **1 point:** Read most changed files but missed some
- **2 points:** Read every changed line in every file

### Attack Surface Mapping (0-2 points)
- **0 points:** Skipped attack surface analysis
- **1 point:** Mapped some surfaces but missed categories
- **2 points:** Complete map for every changed file (inputs, queries, auth, external calls)

### Checklist Rigor (0-2 points)
- **0 points:** Skipped security checklist or applied it superficially
- **1 point:** Ran checklist but skipped items for some files
- **2 points:** Every checklist item evaluated against every changed file

### Finding Verification (0-2 points)
- **0 points:** Reported findings without checking context
- **1 point:** Checked some findings but not all
- **2 points:** Every finding verified: context checked, tests searched, framework guarantees considered

### Report Quality (0-2 points)
- **0 points:** Vague descriptions, missing severity or evidence
- **1 point:** Findings reported but missing some fields
- **2 points:** Every finding has severity, evidence, fix suggestion, and references where applicable

**Minimum passing score: 8/10**

---

## Common Rationalizations (All Wrong)

These are excuses. Don't fall for them:

- **"The diff is too long to read completely"** → STILL read every changed line; use file-by-file reading if needed
- **"This file is just tests, it can't have bugs"** → STILL check for logic errors in test setup and assertions
- **"The framework handles this automatically"** → STILL verify the framework protection applies to this specific case
- **"I already checked injection for the other file"** → STILL check every checklist item for every file
- **"There's nothing wrong with this code"** → STILL run the full checklist; then say so honestly
- **"This is a minor change, quick review is fine"** → Small changes can introduce critical vulnerabilities
- **"I should find something to be helpful"** → A clean review is more helpful than false positives
- **"The user will catch it in testing"** → YOU are the safety net; report what you find with evidence

---

## Failure Modes

### Failure Mode 1: False Positives

**Symptom:** Reported issues that are already handled by middleware, framework, or surrounding code
**Fix:** Always check surrounding context and framework guarantees before reporting. Read the full function, not just changed lines.

### Failure Mode 2: Missed Critical Vulnerability

**Symptom:** A real security issue was in the diff but not reported
**Fix:** Never skip security checklist items. Run every item against every file, even if it "probably doesn't apply."

### Failure Mode 3: Incomplete Diff Reading

**Symptom:** Bugs in files that were listed but not fully read
**Fix:** If diff output is truncated, read each file individually. Confirm in the report that every file was read completely.

### Failure Mode 4: Severity Inflation

**Symptom:** Low-risk issues reported as Critical/High to appear thorough
**Fix:** Use the severity classification criteria strictly. A missing security header is Low, not High.

### Failure Mode 5: Scope Creep

**Symptom:** Reporting issues in unchanged code or making code changes
**Fix:** Only review the branch diff. Never edit files — this is a report-only skill.

---

## Quick Workflow Summary

```
STEP 1: GATHER FULL DIFF
├── Get default branch name
├── Read complete diff (every changed line)
├── List all changed files
└── Gate: Every line read

STEP 2: MAP ATTACK SURFACES
├── Catalog: inputs, queries, auth, sessions, external calls, crypto
├── File-by-file map
└── Gate: All surfaces mapped

STEP 3: SECURITY CHECKLIST
├── 3.1 Injection (SQL, command, template, header, path)
├── 3.2 XSS (output escaping, innerHTML, URL reflection)
├── 3.3 Auth & Authorization (auth checks, IDOR, API consistency)
├── 3.4 Session & CSRF (CSRF protection, session config)
├── 3.5 Race Conditions (TOCTOU, concurrent modifications)
├── 3.6 Crypto & Secrets (secure random, algorithms, hardcoded keys)
├── 3.7 Information Disclosure (error details, debug endpoints, timing)
├── 3.8 DoS (unbounded ops, rate limits, ReDoS, resource limits)
├── 3.9 Business Logic (edge cases, state machines, numerics)
└── Gate: Every item checked against every file

STEP 4: LOGIC BUGS
├── Off-by-one, null access, async errors, type coercion
├── Resource leaks, error swallowing, stale closures
├── Copy-paste errors, boundary conditions, missing returns
└── Gate: All patterns checked

STEP 5: VERIFY FINDINGS
├── Check surrounding context
├── Search for existing tests
├── Check framework guarantees
├── Confirm exploitability
└── Gate: Every finding verified

STEP 6: CLASSIFY AND PRIORITIZE
├── Assign severity (Critical/High/Medium/Low)
├── Order: security > logic > quality
└── Gate: All findings classified

STEP 7: PRE-CONCLUSION AUDIT
├── Confirm file coverage
├── Confirm checklist coverage
├── Document gaps
└── Gate: Audit complete

STEP 8: REPORT FINDINGS
├── Structured report with evidence
├── Files reviewed list
├── Checklist coverage summary
└── Gate: Report delivered

STEP 9: VERIFICATION (MANDATORY)
├── Check 1: Complete coverage
├── Check 2: Finding quality
├── Check 3: Severity accuracy
├── Check 4: Report completeness
├── Check 5: Scope discipline
└── Gate: All 5 checks pass
```

---

## Completion Announcement

When review is complete, announce:

```
Bug review complete.

**Quality Score: X/10**
- Diff Coverage: X/2
- Attack Surface Mapping: X/2
- Checklist Rigor: X/2
- Finding Verification: X/2
- Report Quality: X/2

**Summary:**
- Files reviewed: [count]
- Findings: [count] ([N] Critical, [N] High, [N] Medium, [N] Low)
- Categories: Security [N], Logic [N], Code Quality [N]
- Clean areas: [checklist sections with no findings]

**Verification:**
- Every changed file read: ✅
- Every checklist item evaluated: ✅
- Every finding verified: ✅
- No code changes made: ✅

**Next steps:**
[Fix critical/high issues first, then address medium/low]
```

---

## Integration with Other Skills

The `find-bugs` skill integrates with:

- **`commit`** — Run `find-bugs` before committing to catch issues early
- **`create-pr`** — Run `find-bugs` before creating a PR for self-review
- **`code-simplify`** — After fixing bugs, use `code-simplify` to clean up the fixes
- **`plan-to-task-list-with-dag`** — For large branches with many findings, use `plan-to-task-list-with-dag` to organize the fix effort

**Workflow Chain:**

```
Changes ready for review
       │
       ▼
find-bugs skill (this skill)
       │
       ▼
Fix reported issues
       │
       ▼
commit skill (commit the fixes)
       │
       ▼
create-pr skill (submit for review)
```

# Pre-Landing Review Checklist

## Instructions

Review the `git diff origin/main` output for the issues listed below. Be specific — cite `file:line` and suggest fixes. Skip anything that's fine. Only flag real problems.

**Two-pass review:**
- **Pass 1 (CRITICAL):** Run Query & Data Safety, Race Conditions & Concurrency, and Auth & Trust Boundaries first. These can block `/ship` and `/create-pr`.
- **Pass 2 (INFORMATIONAL):** Run all remaining categories. These are included in the PR body but do not block.

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

If no issues found: `Branch Review: No issues found.`

Be terse. For each issue: one line describing the problem, one line with the fix. No preamble, no summaries, no "looks good overall."

---

## Review Categories

### Pass 1 — CRITICAL

#### Query & Data Safety
- String interpolation or concatenation in SQL/ORM queries — use parameterized queries, prepared statements, or query builder methods
- TOCTOU races: check-then-set patterns that should be atomic (e.g., read a row, check a value, then update — should be a single `WHERE old_value = ? UPDATE SET new_value`)
- ORM methods that bypass validation on fields with constraints (e.g., `update_column`, `update_attribute`, direct `UPDATE` SQL)
- N+1 queries: associations used in loops/views without eager loading (`.includes()`, `.preload()`, `prefetch_related`, `joinedload`)
- Unvalidated user input written directly to database without sanitization or type checking
- Mass assignment: user-controlled params passed to create/update without allowlisting fields

#### Race Conditions & Concurrency
- Read-check-write without uniqueness constraint or conflict handling — concurrent requests can create duplicates
- Find-or-create patterns on columns without unique DB index — concurrent calls can insert duplicates
- Status/state transitions that don't use atomic conditional updates — concurrent requests can skip or double-apply transitions
- Shared mutable state accessed from async handlers, background jobs, or concurrent requests without synchronization
- Counter updates without atomic increment (`UPDATE SET count = count + 1` vs read-then-write)

#### Auth & Trust Boundaries
- New endpoints or routes without authentication middleware/guards
- Missing authorization checks — authenticated user can access another user's resources (IDOR)
- External/LLM-generated values (emails, URLs, names, structured output) written to DB or passed to services without format validation
- `html_safe`, `raw()`, `dangerouslySetInnerHTML`, or equivalent on user-controlled or external data (XSS)
- Secrets, API keys, or credentials hardcoded in source (not environment variables)
- Webhook/callback endpoints that don't verify request authenticity (missing signature validation)

### Pass 2 — INFORMATIONAL

#### Conditional Side Effects
- Code paths that branch on a condition but forget to apply a side effect on one branch. Example: item promoted to verified status but URL only attached when a secondary condition is true — the other branch promotes without the URL, creating an inconsistent record.
- Log messages that claim an action happened but the action was conditionally skipped. The log should reflect what actually occurred.
- Early returns that skip cleanup, notifications, or cache invalidation that later code paths depend on.

#### Error Handling
- Empty catch/except/rescue blocks that silently swallow errors
- Errors logged but not propagated — caller thinks operation succeeded
- Missing error states in UI (loading shown forever, no error message on failure)
- Retry logic without backoff or max attempts — can amplify failures
- Partial failure in batch operations without rollback or status reporting

#### Dead Code & Consistency
- Variables assigned but never read
- Imports/requires that are no longer used after the diff's changes
- Version mismatch between PR title and VERSION/CHANGELOG files
- CHANGELOG entries that describe changes inaccurately
- Comments/docstrings that describe old behavior after the code changed
- Feature flags checked but never toggled or cleaned up

#### Test Gaps
- New code paths without any test coverage (especially error/failure paths)
- Negative-path tests that assert type/status but not the side effects (data written? notification sent? cache cleared?)
- Security enforcement features (blocking, rate limiting, auth) without integration tests verifying the enforcement path end-to-end
- Mocked dependencies that diverge from real behavior — mock returns different shape than actual service

#### API Contract Changes
- Response shape changes (added/removed/renamed fields) without API versioning
- Changed HTTP status codes for existing endpoints
- Changed error response format that clients may parse
- Removed or renamed query parameters, headers, or path segments
- Breaking changes to event payloads, webhook formats, or message schemas

#### Performance
- O(n*m) lookups in loops (linear search inside a loop — use a hash/map/index instead)
- Database queries inside loops — batch or eager-load instead
- Unbounded queries without pagination or LIMIT
- Large payloads serialized synchronously on the request path — consider async/background processing
- Missing database indexes on columns used in WHERE, JOIN, or ORDER BY clauses in new queries

#### Magic Numbers & String Coupling
- Bare numeric literals used in multiple files — should be named constants
- Error message strings used as identifiers elsewhere (grep for the string — is anything matching on it?)
- Timeout/retry/threshold values duplicated across files that could drift

#### Crypto & Secrets
- `Math.random()`, `random.random()`, `rand()` for security-sensitive values — use cryptographic random
- Non-constant-time comparisons (`==`, `===`) on secrets or tokens — vulnerable to timing attacks
- Truncation of data instead of hashing for uniqueness (last N chars instead of hash) — less entropy, easier collisions

---

## Gate Classification

```
CRITICAL (blocks /ship, /create-pr):      INFORMATIONAL (in PR body):
├─ Query & Data Safety                    ├─ Conditional Side Effects
├─ Race Conditions & Concurrency          ├─ Error Handling
└─ Auth & Trust Boundaries                ├─ Dead Code & Consistency
                                          ├─ Test Gaps
                                          ├─ API Contract Changes
                                          ├─ Performance
                                          ├─ Magic Numbers & String Coupling
                                          └─ Crypto & Secrets
```

---

## Suppressions — DO NOT flag these

- "X is redundant with Y" when the redundancy is harmless and aids readability
- "Add a comment explaining why this threshold/constant was chosen" — thresholds change during tuning, comments rot
- "This assertion could be tighter" when the assertion already covers the behavior
- Suggesting consistency-only changes (formatting one line differently to match a nearby pattern)
- "Regex doesn't handle edge case X" when the input is constrained and X never occurs in practice
- "Test exercises multiple guards simultaneously" — that's fine, tests don't need to isolate every guard
- Harmless no-ops (e.g., filtering an array for elements that are never present)
- Style or formatting differences that don't affect correctness
- ANYTHING already addressed in the diff you're reviewing — read the FULL diff before commenting
- TODO/FIXME comments — these are intentional markers, not bugs
- Type annotations that could be "more precise" — if it compiles and is correct, it's fine

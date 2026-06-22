---
name: run-parallel-agents-feature-debug
description: Automatically orchestrate multiple specialized agents working in parallel to debug, diagnose, and fix independent problems across different subsystems. Use when encountering 3+ unrelated bugs, test failures, or issues in isolated modules that don't share root causes. Match each problem to the right expert agent (Laravel, Next.js, React, Node, NestJS, Remix, Express, Expo, Flutter, Magento) to diagnose and resolve issues concurrently, maximizing debugging efficiency.
---

<EXTREMELY-IMPORTANT>
Before launching parallel debugging agents, you **ABSOLUTELY MUST**:

1. Verify problems are truly independent (no shared root cause, no cascading failures)
2. Match each problem to the correct specialized agent
3. Create complete briefs with error details, affected files, and success criteria
4. Launch ALL agents in a SINGLE message with multiple Task tool calls

**Launching debug agents without verification = wasted time, misdiagnosis, incomplete fixes**

This is not optional. Parallel debugging requires independence verification.
</EXTREMELY-IMPORTANT>

# Run Parallel Agents Feature Debug

## MANDATORY FIRST RESPONSE PROTOCOL

Before launching ANY parallel debugging agents, you **MUST** complete this checklist:

1. ☐ Count problems — are there 3+ independent issues?
2. ☐ Check for shared root cause — could one fix solve multiple issues?
3. ☐ Check for cascading failures — did one failure cause others?
4. ☐ Match agents — assign correct agent type per problem
5. ☐ Prepare briefs — error details, affected files, reproduction steps, success criteria
6. ☐ Announce to user — "Launching N debugging agents in parallel for [issues]"

**Launching agents WITHOUT completing this checklist = misdiagnosis and incomplete fixes.**

## Overview

Automatically detect opportunities for parallel debugging and orchestrate multiple specialized agents working concurrently to diagnose and fix independent problems, bugs, test failures, and issues across different subsystems. Match each problem to the appropriate domain expert and coordinate their troubleshooting work to deliver faster resolutions.

## When to Use This Skill

Use this skill automatically when:

**Problem Indicators:**

- Encountering 3+ unrelated bugs or failures
- Multiple test failures in isolated subsystems (backend, frontend, different services)
- Independent issues that don't share a root cause
- Problems in different technology stacks that can be debugged separately
- Each issue can be understood and fixed without context from others

**User Triggers:**

- "Debug these issues in parallel"
- "Fix these bugs concurrently"
- "Split debugging across agents"
- "Use parallel agents to resolve these failures"
- "Speed up troubleshooting with multiple agents"

**Common Scenarios:**

- Fixing multiple failing tests in different subsystems (Laravel tests, Next.js tests, API tests)
- Debugging independent bugs across microservices
- Resolving linting/type errors in separate modules
- Investigating performance issues in isolated components
- Fixing compilation errors across different parts of the stack
- Addressing security vulnerabilities in independent dependencies

## When NOT to Use This Skill

Do NOT use parallel debugging when:

**Related Failures:**

- Failures are interconnected (fixing one might fix others)
- Issues share a common root cause
- Cascading failures where the first error causes subsequent ones
- Need to understand full system state to diagnose properly

**Sequential Dependencies:**

- Must fix issues in a specific order
- Later fixes depend on earlier fixes being completed
- Shared state or data corruption affecting multiple areas

**Single Root Cause:**

- All symptoms point to one underlying issue
- Database connection problem affecting entire app
- Configuration error propagating through the system
- Single dependency version causing multiple breakages

**Coordination Required:**

- Need careful debugging across layers
- Issues require stepping through interconnected code
- Must maintain consistent state during debugging
- Agents would interfere with each other's diagnostic work

## Core Workflow

### Step 1: Analyze and Cluster the Problems

Examine the failures, bugs, or issues to identify:

1. **Problem isolation** - Are the issues truly independent?
2. **Root cause analysis** - Do they share a common cause?
3. **Subsystem mapping** - Which tech stack/module is each problem in?
4. **Dependency check** - Does fixing one require fixing another first?

**Clustering Strategy:**

Group problems by:

- **Technology stack** (Laravel backend, Next.js frontend, NestJS API)
- **Subsystem** (authentication, payment, user profile)
- **Failure type** (test failures, runtime errors, type errors, build errors)
- **Module** (independent services, separate features)

**Decision Point:**

- If problems cluster into 3+ independent groups → Proceed to parallel debugging
- If problems are related or have shared root cause → Use sequential debugging instead

### Step 2: Match Problems to Specialized Agents

For each independent problem cluster, determine the best agent type:

**Technology Stack Detection:**

- **Laravel backend issues** → `laravel-senior-engineer`
- **Next.js frontend issues** → `nextjs-senior-engineer`
- **React + Vite + Tailwind bugs** → `react-vite-tailwind-engineer`
- **Express.js API issues** → `express-senior-engineer`
- **Node.js CLI issues** → `nodejs-cli-senior-engineer`
- **Python backend issues** → `python-senior-engineer`
- **FastAPI issues** → `fastapi-senior-engineer`
- **Go backend issues** → `go-senior-engineer`
- **Go CLI issues** → `go-cli-senior-engineer`
- **iOS/macOS, Swift issues** → `ios-macos-senior-engineer`
- **Expo mobile bugs** → `expo-react-native-engineer`
- **AWS infrastructure issues** → `devops-aws-senior-engineer`
- **Docker/container issues** → `devops-docker-senior-engineer`
- **General/cross-cutting issues** → `general-purpose`

**Error Pattern Analysis:**

```
PHPUnit test failures → Laravel
Jest/Vitest frontend tests → Next.js or React/Vite/Tailwind
Express middleware/routing errors → Express
pytest/unittest failures → Python or FastAPI
go test failures → Go
Swift/Xcode build errors → iOS/macOS
TypeScript compilation errors → Match to framework
Runtime errors → Match to where error occurs
Performance issues → Match to affected component
```

### Step 3: Prepare Debugging Briefs

For each agent, create a comprehensive debugging brief:

**Required Elements:**

1. **Problem description** - What's failing or broken
2. **Error messages/stack traces** - Complete diagnostic info
3. **Reproduction steps** - How to trigger the issue
4. **Affected files** - Where to look first
5. **Expected vs actual behavior** - What should happen vs what's happening
6. **Success criteria** - How to verify the fix

**Brief Template:**

```
Debug and fix [issue description]:

Problem: [concise problem statement]
Error: [error message or stack trace]
Affected files: [file paths or patterns]
Subsystem: [which part of the app]

Steps to reproduce:
1. [step 1]
2. [step 2]
3. [observed failure]

Expected: [what should happen]
Actual: [what's happening]

Success criteria:
- [how to verify fix - tests passing, error gone, etc.]
```

### Step 4: Launch Debug Agents in Parallel

Execute all agents simultaneously using a **single message with multiple Task tool calls**:

```
Use the Task tool to launch multiple debugging agents in parallel:
- Agent 1: [brief for first issue]
- Agent 2: [brief for second issue]
- Agent 3: [brief for third issue]
```

**Critical Requirements:**

- Send ALL Task tool calls in ONE message
- Do NOT wait for agents to complete before launching others
- Each agent gets complete diagnostic information upfront
- No placeholder values - all error details must be included

### Step 5: Monitor, Validate, and Consolidate Fixes

After agents complete their debugging:

1. **Collect fix reports** from each agent
2. **Verify fixes independently** - Did each issue get resolved?
3. **Check for conflicts** - Do fixes touch overlapping code?
4. **Re-run tests** - Validate that problems are truly fixed
5. **Integration check** - Ensure fixes work together
6. **Report consolidated results** to user

**Validation Checklist:**

- [ ] Original error no longer occurs
- [ ] Tests pass (if test failures were the issue)
- [ ] No new errors introduced
- [ ] No conflicts with other concurrent fixes
- [ ] Changes are coherent and don't contradict each other

**Consolidation Template:**

```
Parallel debugging complete. Results:

**[Issue 1]** (via [agent-type])
- Status: ✅ Fixed / ⚠️ Partial / ❌ Blocked
- Root cause: [what was wrong]
- Solution: [what was changed]
- Files modified: [list]
- Verification: [tests passing, error resolved]

**[Issue 2]** (via [agent-type])
- Status: ✅ Fixed / ⚠️ Partial / ❌ Blocked
- Root cause: [what was wrong]
- Solution: [what was changed]
- Files modified: [list]
- Verification: [tests passing, error resolved]

**Overall:** [X/Y issues resolved, any remaining work, next steps]

**Integration status:** [No conflicts / Conflicts resolved / Needs review]
```

## Example Scenarios

### Example A: Multiple Test Failures Across Subsystems

**User Says:**
"Run parallel agents to debug these failing tests."

**Error Context:**

- 5 Laravel PHPUnit tests failing (authentication module)
- 3 Next.js Jest tests failing (product listing page)
- 2 Express API tests failing (payment service)

**Execution:**

1. **Cluster failures** by subsystem:
   - Laravel backend tests (authentication)
   - Next.js frontend tests (product listing)
   - Express API tests (payment)

2. **Match agents:**
   - `laravel-senior-engineer` for Laravel test failures
   - `nextjs-senior-engineer` for Next.js test failures
   - `express-senior-engineer` for Express test failures

3. **Launch in parallel** with debugging briefs containing:
   - Full test output/error messages
   - Affected test files
   - Related source code files

4. **Each agent independently:**
   - Analyzes test failures
   - Identifies root causes
   - Implements fixes
   - Re-runs tests to verify

5. **Consolidate results:**

   ```
   Parallel debugging complete:
   - Laravel auth tests: ✅ Fixed (5/5 passing) - Missing user factory trait
   - Next.js product tests: ✅ Fixed (3/3 passing) - Incorrect mock data
   - Express payment tests: ✅ Fixed (2/2 passing) - Async timing issue

   All 10 tests now passing. No conflicts detected.
   ```

### Example B: Cross-Stack Bug Fixes

**User Says:**
"Fix these three bugs in parallel: cart total calculation error, user profile image upload failure, and webhook timeout issue."

**Execution:**

1. **Analyze bugs:**
   - Cart total calculation (Laravel backend logic)
   - Image upload (Next.js frontend + storage)
   - Webhook timeout (Express microservice)

2. **Verify independence:**
   - ✅ Different subsystems
   - ✅ Different tech stacks
   - ✅ No shared state
   - ✅ Can be fixed independently

3. **Launch agents:**
   - `laravel-senior-engineer`: Debug cart calculation
   - `nextjs-senior-engineer`: Fix image upload
   - `express-senior-engineer`: Resolve webhook timeout

4. **Aggregate fixes:**

   ```
   3 bugs resolved in parallel:
   - Cart calculation: Fixed rounding error in Tax service
   - Image upload: Added missing CORS headers and size validation
   - Webhook timeout: Increased timeout + added retry logic

   All fixes tested and verified independently.
   ```

### Example C: Build/Compilation Errors

**User Says:**
"I have TypeScript errors in multiple unrelated modules. Fix them in parallel."

**Error Context:**

- 15 type errors in Next.js dashboard components
- 8 type errors in Python FastAPI user service
- 12 type errors in Express API middleware

**Execution:**

1. **Group by module/framework:**
   - Next.js errors (dashboard module)
   - FastAPI errors (user service)
   - Express errors (API middleware)

2. **Spawn agents:**
   - `nextjs-senior-engineer` for Next.js type errors
   - `fastapi-senior-engineer` for FastAPI type errors
   - `express-senior-engineer` for Express type errors

3. **Each agent:**
   - Analyzes errors in their module
   - Fixes type definitions, imports, and interfaces
   - Verifies compilation/validation succeeds

4. **Result:**

   ```
   Compilation now clean:
   - Next.js dashboard: 15 type errors fixed (component props, hooks)
   - FastAPI user service: 8 errors fixed (Pydantic models, type hints)
   - Express middleware: 12 type errors fixed (request/response types)

   Full build successful.
   ```

### Example D: Performance Issue Investigation

**User Says:**
"Investigate these performance problems: slow product search (backend), laggy dashboard UI (frontend), and delayed webhook processing (microservice)."

**Execution:**

1. **Cluster by component:**
   - Product search performance (Laravel)
   - Dashboard UI lag (Next.js)
   - Webhook delay (Express service)

2. **Parallel investigation:**
   - `laravel-senior-engineer`: Profile search queries, identify N+1 problems
   - `nextjs-senior-engineer`: Analyze render performance, identify re-render issues
   - `express-senior-engineer`: Trace webhook processing, identify bottlenecks

3. **Each agent delivers:**
   - Performance analysis
   - Root cause identification
   - Optimization implementation
   - Before/after metrics

4. **Consolidated report:**

   ```
   Performance optimizations complete:
   - Product search: 3.2s → 180ms (eager loading, index added)
   - Dashboard UI: 850ms → 120ms render (memoization, virtual scrolling)
   - Webhook processing: 5s → 800ms (async processing, connection pooling)

   All improvements verified with benchmarks.
   ```

## Agent Type Reference

Quick reference for matching debugging tasks to agents:

| Agent Type                          | Best For Debugging                                    | Key Error Patterns                                              |
| ----------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| `laravel-senior-engineer`           | PHPUnit failures, Eloquent errors, API bugs           | Laravel exceptions, DB query errors, validation failures        |
| `nextjs-senior-engineer`            | Jest/Vitest failures, React errors, hydration issues  | Component errors, RSC issues, build failures                    |
| `react-vite-tailwind-engineer`      | React + Vite + Tailwind component/build issues        | Vite build errors, Tailwind class issues, React hooks bugs      |
| `express-senior-engineer`           | Middleware failures, routing bugs, API errors         | Express errors, middleware stack issues, request handling        |
| `nodejs-cli-senior-engineer`        | CLI tool failures, argument parsing bugs              | Commander errors, prompt failures, output formatting            |
| `python-senior-engineer`            | pytest failures, Django errors, pipeline bugs         | Python exceptions, import errors, async issues                  |
| `fastapi-senior-engineer`           | FastAPI endpoint failures, async DB issues            | Pydantic validation, dependency injection, ASGI errors          |
| `go-senior-engineer`                | Go test failures, service bugs, API errors            | Go panics, goroutine leaks, interface mismatches                |
| `go-cli-senior-engineer`            | Go CLI tool failures, flag parsing bugs               | Cobra errors, flag conflicts, output formatting                 |
| `ios-macos-senior-engineer`         | Swift/Xcode build failures, SwiftUI bugs              | Swift compiler errors, runtime crashes, UI layout issues        |
| `expo-react-native-engineer`        | Mobile crashes, navigation bugs, native module errors | React Native errors, Expo module issues, platform-specific bugs |
| `devops-aws-senior-engineer`        | Infrastructure failures, deployment issues            | CDK synth errors, CloudFormation failures, IAM issues           |
| `devops-docker-senior-engineer`     | Container build/run failures, compose issues          | Dockerfile errors, network issues, volume mount failures        |
| `general-purpose`                   | Cross-cutting issues, config errors, tooling problems | Build tool errors, linting issues, general debugging            |

See `references/debug_patterns.md` for detailed error pattern matching and debugging strategies.
See `references/agent_matching_logic.md` for detailed matching rules and edge cases.

## Best Practices

### Effective Problem Decomposition

**Good Independent Problems:**

- "Laravel auth tests failing (session handling)" + "Next.js checkout tests failing (form validation)" + "NestJS payment tests failing (timeout)"
- Each in different subsystem, different root causes, can be fixed separately

**Poor Decomposition:**

- "All tests failing after dependency update" (likely single root cause - the dependency)
- "Database connection errors throughout the app" (single root cause - DB config/connection)
- "Everything broken after deploy" (need to understand what changed first)

### Root Cause Analysis Before Parallelization

Always do initial triage:

1. **Look for common patterns** - Do all errors mention the same dependency?
2. **Check timing** - Did all failures start at the same time?
3. **Examine stack traces** - Do they share common code paths?
4. **Review recent changes** - Is there a single commit/deploy that broke everything?

If yes to any of these → Single root cause, don't parallelize yet.

### Communication Pattern

Before launching parallel debugging:

```
I've identified 3 independent issues that can be debugged in parallel:

1. Laravel authentication tests (5 failures) - using laravel-senior-engineer
   Root cause appears to be: Session handling

2. Next.js product listing tests (3 failures) - using nextjs-senior-engineer
   Root cause appears to be: Mock data mismatch

3. Express payment service tests (2 failures) - using express-senior-engineer
   Root cause appears to be: Async timing

Launching debugging agents now...
```

### Post-Fix Validation

After parallel fixes are complete:

1. **Run full test suite** - Not just the fixed tests
2. **Check for regressions** - Did fixing one thing break another?
3. **Integration testing** - Do all fixes work together?
4. **Code review** - Are fixes consistent with codebase patterns?

### Handling Partial Success

If some agents succeed and others get blocked:

```
Parallel debugging results (2/3 completed):

✅ Laravel auth tests: Fixed (5/5 passing)
✅ Next.js product tests: Fixed (3/3 passing)
⚠️  NestJS payment tests: Blocked - requires external payment gateway access

Next steps:
- 2 issues resolved and verified
- Payment test issue needs: [specific requirements]
- Recommend: [suggested approach]
```

### Conflict Resolution

If fixes overlap or conflict:

1. **Identify the conflict** - Same file, same function, contradictory changes
2. **Review both solutions** - Which approach is better?
3. **Merge intelligently** - Combine best aspects or choose one
4. **Re-test thoroughly** - Ensure merged fix resolves both issues
5. **Document the decision** - Why this approach was chosen

## Resources

### references/

- **debug_patterns.md** - Comprehensive error pattern recognition guide, debugging strategies for each framework, and root cause analysis techniques

This skill does not require scripts or assets - it orchestrates existing Claude Code agent debugging capabilities.

---

## Step 6: Verification (MANDATORY)

After aggregating results, verify the parallel debugging was successful:

### Check 1: All Agents Completed
- [ ] Every launched agent returned a result
- [ ] No agents timed out or crashed

### Check 2: No Fix Conflicts
- [ ] No two agents modified the same file with conflicting changes
- [ ] If conflicts exist, they are identified and resolved

### Check 3: Fixes Match Problem Descriptions
- [ ] Each agent addressed the assigned problem
- [ ] Root causes were correctly identified
- [ ] Solutions match the problem scope

### Check 4: Verification Tests Pass
- [ ] Original errors no longer occur
- [ ] Tests pass (if test failures were the issue)
- [ ] No new errors introduced

### Check 5: User Informed
- [ ] Completion announced with summary
- [ ] Any blocked or partial fixes documented
- [ ] Next steps provided if issues remain

**Gate:** Do NOT mark debugging complete until all 5 checks pass.

---

## Quality Checklist (Must Score 8/10)

Score yourself honestly before marking parallel debugging complete:

### Problem Decomposition (0-2 points)
- **0 points:** Launched without checking for shared root cause
- **1 point:** Some root cause analysis done
- **2 points:** Full independence verification (no shared root cause, no cascading failures)

### Agent Matching (0-2 points)
- **0 points:** Wrong agents for problems
- **1 point:** Agents assigned without technology justification
- **2 points:** Each problem matched to correct agent with error pattern indicators

### Brief Quality (0-2 points)
- **0 points:** No briefs or generic briefs
- **1 point:** Partial briefs (missing error details or reproduction steps)
- **2 points:** Complete briefs with error, affected files, reproduction, success criteria

### Execution Correctness (0-2 points)
- **0 points:** Agents launched sequentially
- **1 point:** Parallel launch but incomplete briefs
- **2 points:** Single message with all Task tool calls, complete briefs

### Result Aggregation (0-2 points)
- **0 points:** No summary provided
- **1 point:** Partial summary
- **2 points:** Complete summary with status, root cause, fix, verification per issue

**Minimum passing score: 8/10**

---

## Common Rationalizations (All Wrong)

These are excuses. Don't fall for them:

- **"These failures look independent"** → STILL check for shared root cause
- **"I know the right agents"** → STILL document the matching rationale
- **"Briefs are obvious from error messages"** → STILL write complete scope, files, reproduction, success criteria
- **"Sequential is safer for debugging"** → If problems are independent, parallel is FASTER with same quality
- **"I'll merge conflict fixes later"** → Check for conflicts BEFORE marking complete
- **"One message is too long"** → ALL Task tool calls MUST be in one message
- **"The user just wants it fixed"** → Correct execution = faster resolution
- **"Two bugs don't need parallel agents"** → Correct, need 3+ independent problems

---

## Failure Modes

### Failure Mode 1: Debugging Related Failures Separately

**Symptom:** Two agents fix the same underlying issue differently, or one fix breaks the other's solution
**Fix:** Do root cause analysis first. If failures started at the same time or share code paths, treat as single issue.

### Failure Mode 2: Wrong Agent Assignment

**Symptom:** Laravel debugging done by `nextjs-senior-engineer`, poor diagnosis
**Fix:** Use error pattern analysis. Match PHPUnit failures → Laravel agent, Jest failures → Next.js agent.

### Failure Mode 3: Sequential Launch Instead of Parallel

**Symptom:** Sent multiple messages with Task tool calls, agents ran one at a time
**Fix:** ALL Task tool calls in a SINGLE message. This is critical for parallel debugging.

### Failure Mode 4: Incomplete Debugging Briefs

**Symptom:** Agents ask clarifying questions or diagnose wrong issues
**Fix:** Every brief must have Error, Affected files, Reproduction steps, Success criteria. No placeholders.

### Failure Mode 5: No Verification After Fixes

**Symptom:** "Fixes applied" but no confirmation that original errors are gone
**Fix:** After aggregation, verify each fix: re-run failed tests, check error no longer occurs.

---

## Quick Workflow Summary

```
STEP 1: ANALYZE & CLUSTER
├── Count problems (need 3+)
├── Check for shared root cause
├── Check for cascading failures
└── Gate: Problems are independent

STEP 2: MATCH AGENTS
├── Identify error patterns per problem
├── Assign correct agent type
└── Document matching rationale

STEP 3: PREPARE BRIEFS
├── Error details, Affected files, Reproduction, Success criteria
└── No placeholders allowed

STEP 4: LAUNCH PARALLEL
├── Single message with ALL Task tool calls
├── Do NOT wait between launches
└── Gate: All agents launched

STEP 5: AGGREGATE RESULTS
├── Collect fix reports
├── Check for conflicts
└── Merge into summary

STEP 6: VERIFICATION
├── All agents completed
├── No fix conflicts
├── Fixes match problems
├── Verification tests pass
└── Gate: All 5 checks pass
```

---

## Completion Announcement

When parallel debugging is complete, announce:

```
Parallel debugging complete.

**Quality Score: X/10**
- Problem Decomposition: X/2
- Agent Matching: X/2
- Brief Quality: X/2
- Execution Correctness: X/2
- Result Aggregation: X/2

**Results:**
- Issues resolved: X/Y
- Agents used: [list]
- Conflicts: [none/resolved/pending]

**Issue Summary:**

1. [Issue 1] — `agent-type`
   - Status: ✅ Fixed / ⚠️ Partial / ❌ Blocked
   - Root cause: [what was wrong]
   - Fix: [what was changed]
   - Verification: [how verified]

2. [Issue 2] — `agent-type`
   - Status: ✅ Fixed / ⚠️ Partial / ❌ Blocked
   - Root cause: [what was wrong]
   - Fix: [what was changed]
   - Verification: [how verified]

**Next steps:**
[Any remaining work or follow-up needed]
```

---

## Integration with Other Skills

The `run-parallel-agents-feature-debug` skill integrates with:

- **`start`** — Use `start` first to identify if this skill is needed
- **`plan-to-task-list-with-dag`** — If debugging requires a plan, use `plan-to-task-list-with-dag` to structure it
- **`run-parallel-agents-feature-build`** — For building features; use this skill for debugging

**Workflow:** `start` → (optionally) `plan-to-task-list-with-dag` → `run-parallel-agents-feature-debug`

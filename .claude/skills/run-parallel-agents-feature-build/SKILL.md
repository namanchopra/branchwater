---
name: run-parallel-agents-feature-build
description: Automatically orchestrate multiple specialized agents working in parallel when building independent features, modules, or performing separate investigations. Use when the task list contains 3+ unrelated features/tasks that don't share state, don't have execution dependencies, and can be understood independently. Match each feature to the right expert agent (Laravel, Next.js, React, Node, NestJS, Remix, Express, Expo, Flutter, Magento) and run them concurrently to maximize development speed.
---

<EXTREMELY-IMPORTANT>
Before launching parallel agents, you **ABSOLUTELY MUST**:

1. Verify tasks are truly independent (no shared files, no data flow between them)
2. Match each task to the correct specialized agent
3. Create complete briefs with scope, files, output, and success criteria
4. Launch ALL agents in a SINGLE message with multiple Task tool calls

**Launching agents without verification = conflicts, wasted work, merge hell**

This is not optional. Parallel execution requires independence verification.
</EXTREMELY-IMPORTANT>

# Run Parallel Agents Feature Build

## MANDATORY FIRST RESPONSE PROTOCOL

Before launching ANY parallel agents, you **MUST** complete this checklist:

1. ☐ Count tasks — are there 3+ independent tasks?
2. ☐ Check dependencies — do any tasks depend on others?
3. ☐ Check file overlap — do tasks modify the same files?
4. ☐ Match agents — assign correct agent type per task
5. ☐ Prepare briefs — scope, files, output, success criteria for each
6. ☐ Announce to user — "Launching N agents in parallel for [tasks]"

**Launching agents WITHOUT completing this checklist = conflicts and failures.**

## Overview

Automatically detect opportunities for parallel execution and orchestrate multiple specialized agents working concurrently on independent features, modules, or investigations. Match each task to the appropriate domain expert and coordinate their work to deliver faster results without sacrificing quality.

## When to Use This Skill

Use this skill automatically when:

**Task List Indicators:**

- The task list contains 3 or more independent tasks or phases
- Receiving a large plan with multiple unrelated features
- Tasks are clearly scoped and don't overlap
- Each task can be understood without context from others
- No shared state or cross-dependencies between tasks

**User Triggers:**

- "Build in parallel"
- "Split this work across agents"
- "Use multiple agents for this"
- "Speed this up with parallel execution"

**Common Scenarios:**

- Building independent features or endpoints (e.g., wishlist API, checkout flow, user dashboard)
- Implementing multiple UI components or microservices simultaneously
- Generating documentation or schema files for several modules
- Analyzing multiple code files for specific issues
- Debugging failures in isolated subsystems
- Processing multiple data files or resources

## When NOT to Use This Skill

Do NOT use parallel agents when:

**Dependencies Exist:**

- Tasks have sequential dependencies (Task B needs Task A's output)
- Shared state, data, or ownership between tasks
- The sequence of execution affects the outcome
- Agents would interfere with each other's work

**Problem Not Decomposed:**

- The problem isn't yet broken into independent units
- Need to understand full system state first
- Related failures where fixing one might fix others
- Careful coordination or debugging across layers is required

**Single Cohesive Task:**

- Working on a single integrated feature
- Refactoring that touches multiple interconnected parts
- Tasks that require constant communication between components

## Core Workflow

### Step 1: Analyze the Task List or Request

Examine the current task list or user request to identify:

1. **Number of independent work streams** - Are there 3+ separate features/tasks?
2. **Dependencies** - Can each task be completed without waiting for others?
3. **Shared state** - Do tasks modify the same files or data structures?
4. **Scope clarity** - Is each task clearly defined with known requirements?

If all conditions for parallelization are met, proceed to Step 2.

### Step 2: Match Features to Specialized Agents

For each independent task, determine the best agent type based on:

**Technology Stack Detection:**

- **Laravel backend** → `laravel-senior-engineer`
- **Next.js frontend or full-stack** → `nextjs-senior-engineer`
- **React + Vite + Tailwind frontends** → `react-vite-tailwind-engineer`
- **Express.js APIs** → `express-senior-engineer`
- **Node.js CLI tools** → `nodejs-cli-senior-engineer`
- **Python backend, Django, data pipelines** → `python-senior-engineer`
- **FastAPI specifically, async DB, JWT auth** → `fastapi-senior-engineer`
- **Go backend, services** → `go-senior-engineer`
- **Go CLI tools** → `go-cli-senior-engineer`
- **iOS/macOS, Swift, SwiftUI** → `ios-macos-senior-engineer`
- **Expo React Native mobile** → `expo-react-native-engineer`
- **AWS infrastructure, CDK** → `devops-aws-senior-engineer`
- **Docker, containers** → `devops-docker-senior-engineer`
- **General tasks (exploration, research)** → `general-purpose`

**File Pattern Analysis:**

```
*.php + /app/ + /routes/ → Laravel
*.tsx + /app/ or /pages/ + next.config.* → Next.js
*.tsx + vite.config.* + tailwind.config.* → React/Vite/Tailwind
*.ts + express imports → Express
*.ts + commander/inquirer imports → Node CLI
*.py + fastapi imports → FastAPI
*.py + django/flask/general → Python
*.go + go.mod → Go
*.swift + Package.swift or *.xcodeproj → iOS/macOS
*.tsx + app.json (Expo) → Expo React Native
Dockerfile + docker-compose.* → Docker
CDK, CloudFormation, Terraform → AWS DevOps
```

### Step 3: Prepare Agent Briefs

For each agent, create a clear, focused brief containing:

**Required Elements:**

1. **Scope of work** - Exactly what to build/analyze/fix
2. **Expected output** - What deliverables to produce
3. **Context** - Relevant file paths, existing patterns, constraints
4. **Success criteria** - How to verify completion

**Brief Template:**

```
Build [feature name]:
- Scope: [specific feature boundaries]
- Files: [relevant paths or patterns]
- Requirements: [bullet points]
- Output: [expected deliverables]
- Patterns: [existing code patterns to follow]
```

### Step 4: Launch Agents in Parallel

Execute all agents simultaneously using a **single message with multiple Task tool calls**:

```
Use the Task tool to launch multiple agents in parallel:
- Agent 1: [brief for first feature]
- Agent 2: [brief for second feature]
- Agent 3: [brief for third feature]
```

**Critical Requirements:**

- Send ALL Task tool calls in ONE message
- Do NOT wait for agents to complete before launching others
- Each agent gets its complete brief upfront
- No placeholder values - all parameters must be complete

### Step 5: Monitor and Aggregate Results

After agents complete:

1. **Collect outputs** from each agent
2. **Verify deliverables** match expected outputs
3. **Check for conflicts** (e.g., overlapping file changes)
4. **Merge results** into a coherent summary
5. **Report to user** with consolidated findings

**Aggregation Template:**

```
Parallel execution complete. Results:

**[Feature 1]** (via [agent-type])
- Status: [completed/blocked/partial]
- Delivered: [summary]
- Files modified: [list]

**[Feature 2]** (via [agent-type])
- Status: [completed/blocked/partial]
- Delivered: [summary]
- Files modified: [list]

**Overall:** [X/Y features completed, any conflicts, next steps]
```

### Step 6: Verification (MANDATORY)

After aggregating results, verify the parallel execution was successful:

#### Check 1: All Agents Completed
- [ ] Every launched agent returned a result
- [ ] No agents timed out or crashed

#### Check 2: No File Conflicts
- [ ] No two agents modified the same file
- [ ] If conflicts exist, they are resolved

#### Check 3: Deliverables Match Briefs
- [ ] Each agent delivered what was specified
- [ ] Output matches expected format

#### Check 4: No Integration Issues
- [ ] Features work together (if they interact)
- [ ] No broken imports or references

#### Check 5: User Informed
- [ ] Completion announced with summary
- [ ] Any issues or partial results documented

**Gate:** Do NOT mark task complete until all 5 checks pass.

## Example Scenarios

### Example A: Feature Build

**User Says:**
"Build the wishlist API, checkout summary, and user dashboard in parallel."

**Execution:**

1. **Detect** three separate feature scopes
2. **Match agents:**
   - Wishlist API → `laravel-senior-engineer` (backend)
   - Checkout summary → `nextjs-senior-engineer` (frontend)
   - User dashboard → `nextjs-senior-engineer` (frontend/UI)
3. **Launch** all three in a single message with Task tool
4. **Aggregate** results into merged summary

**Output:**

```
Built 3 features in parallel:
- Wishlist API: Complete (app/Http/Controllers/WishlistController.php, routes/api.php)
- Checkout summary: Complete (app/checkout/summary/page.tsx)
- User dashboard: Complete (app/dashboard/page.tsx)
```

### Example B: Debug Parallel Subsystems

**User Says:**
"Run parallel agents to debug these failing tests."

**Execution:**

1. **Cluster failures** by subsystem:
   - Laravel backend tests
   - Next.js frontend tests
   - Node.js API tests
2. **Spawn agents:**
   - `laravel-senior-engineer` for Laravel failures
   - `nextjs-senior-engineer` for Next.js failures
   - `express-senior-engineer` for Node API failures
3. **Let each diagnose and fix** independently
4. **Gather results**, merge patches, re-run tests
5. **Output** consolidated fix report

### Example C: Code Analysis

**User Says:**
"Analyze these 5 code files in parallel for performance bottlenecks."

**Execution:**

1. **Split files** across appropriate agents based on file type
2. **Run analysis** concurrently (each agent gets 1-2 files)
3. **Merge findings** into summarized report with:
   - File-by-file breakdown
   - Common patterns across files
   - Prioritized recommendations

## Agent Type Reference

Quick reference for matching tasks to agents:

| Agent Type                          | Best For                                          | Key Indicators                               |
| ----------------------------------- | ------------------------------------------------- | -------------------------------------------- |
| `laravel-senior-engineer`           | Laravel backends, APIs, Eloquent models           | `*.php`, `/app/`, Eloquent, Artisan          |
| `nextjs-senior-engineer`            | Next.js apps, React Server Components, App Router | `*.tsx`, `/app/`, `/pages/`, `next.config.*` |
| `react-vite-tailwind-engineer`      | React + Vite + Tailwind TypeScript frontends      | `*.tsx`, `vite.config.*`, `tailwind.config.*`|
| `express-senior-engineer`           | Express.js APIs, middleware, REST endpoints       | `*.js/*.ts`, `express` imports               |
| `nodejs-cli-senior-engineer`        | Node.js CLI tools, commander.js, inquirer         | `commander`, `inquirer`, `ora`, CLI patterns |
| `python-senior-engineer`            | Python backends, Django, data pipelines           | `*.py`, `requirements.txt`, `pyproject.toml` |
| `fastapi-senior-engineer`           | FastAPI, async DB, JWT auth                       | `*.py`, `fastapi` imports, `uvicorn`         |
| `go-senior-engineer`                | Go backends, services, APIs                       | `*.go`, `go.mod`, `go.sum`                   |
| `go-cli-senior-engineer`            | Go CLI tools, cobra, viper                        | `*.go`, `cobra` imports, CLI patterns        |
| `ios-macos-senior-engineer`         | Swift, SwiftUI, Xcode, SPM, StoreKit             | `*.swift`, `Package.swift`, `*.xcodeproj`    |
| `expo-react-native-engineer`        | Expo mobile apps, cross-platform                  | `*.tsx`, `app.json`, Expo modules            |
| `devops-aws-senior-engineer`        | AWS infrastructure, CDK, CloudFormation           | CDK, CloudFormation, Terraform, AWS          |
| `devops-docker-senior-engineer`     | Docker, Docker Compose, containerization          | `Dockerfile`, `docker-compose.*`             |
| `general-purpose`                   | Exploration, research, general tasks              | Non-framework-specific work                  |

See `references/agent_matching_logic.md` for detailed matching rules and edge cases.

## Best Practices

### Scoping Tasks Effectively

**Good Task Scopes:**

- "Build user authentication endpoint with JWT"
- "Create product listing page with filters"
- "Implement cart total calculation service"

**Poor Task Scopes:**

- "Build the entire checkout flow" (too broad, likely has dependencies)
- "Fix the app" (undefined, not decomposed)
- "Refactor database layer" (touches too many interconnected parts)

### Handling Conflicts

If agents modify overlapping files:

1. **Review changes** from each agent
2. **Identify conflicts** (same lines modified)
3. **Merge intelligently** or ask user for guidance
4. **Re-test** affected areas

### Communication Pattern

Always inform the user BEFORE launching parallel agents:

```
I've identified 3 independent features that can be built in parallel:
1. [Feature 1] - using [agent-type]
2. [Feature 2] - using [agent-type]
3. [Feature 3] - using [agent-type]

Launching agents now...
```

### Handling Partial Success

If an agent fails or gets blocked:

- Continue with successful agents
- Report partial results
- Provide clear next steps for blocked work
- Don't retry automatically without user input

---

## Quality Checklist (Must Score 8/10)

Score yourself honestly before marking parallel execution complete:

### Independence Verification (0-2 points)
- **0 points:** Launched without checking dependencies
- **1 point:** Checked some dependencies
- **2 points:** Full dependency check (files, data flow, state)

### Agent Matching (0-2 points)
- **0 points:** Wrong agents for tasks
- **1 point:** Agents assigned without justification
- **2 points:** Each task matched to correct agent with indicators

### Brief Quality (0-2 points)
- **0 points:** No briefs or generic briefs
- **1 point:** Partial briefs (missing fields)
- **2 points:** Complete briefs with scope, files, output, success criteria

### Execution Correctness (0-2 points)
- **0 points:** Agents launched sequentially
- **1 point:** Parallel launch but incomplete briefs
- **2 points:** Single message with all Task tool calls, complete briefs

### Result Aggregation (0-2 points)
- **0 points:** No summary provided
- **1 point:** Partial summary
- **2 points:** Complete summary with status, deliverables, conflicts, next steps

**Minimum passing score: 8/10**

---

## Common Rationalizations (All Wrong)

These are excuses. Don't fall for them:

- **"These tasks look independent"** → STILL check for file overlap
- **"I know the right agents"** → STILL document the matching rationale
- **"Briefs are obvious"** → STILL write complete scope, files, output, success criteria
- **"Sequential is safer"** → If tasks are independent, parallel is FASTER with no downside
- **"I'll merge conflicts later"** → Check for conflicts BEFORE launching
- **"One message is too long"** → ALL Task tool calls MUST be in one message
- **"The user just wants it done"** → Correct execution = faster completion
- **"Two tasks don't need parallel agents"** → Correct, need 3+ tasks

---

## Failure Modes

### Failure Mode 1: Launching Dependent Tasks in Parallel

**Symptom:** Agents fail or produce conflicting output because Task B needed Task A's result
**Fix:** Run dependency checks. If Output(A) ∈ Input(B), execute sequentially.

### Failure Mode 2: Wrong Agent Assignment

**Symptom:** Laravel work done by nextjs-senior-engineer, poor results
**Fix:** Use technology detection patterns. Match `*.php` → Laravel agent.

### Failure Mode 3: Sequential Launch Instead of Parallel

**Symptom:** Sent multiple messages with Task tool calls, agents ran one at a time
**Fix:** ALL Task tool calls in a SINGLE message. This is critical for parallel execution.

### Failure Mode 4: Incomplete Briefs

**Symptom:** Agents ask clarifying questions or deliver wrong output
**Fix:** Every brief must have Scope, Files, Output, Success criteria. No placeholders.

### Failure Mode 5: No Conflict Check After Completion

**Symptom:** Agents modified same files, changes overwrite each other
**Fix:** After aggregation, check file overlap. If conflicts, merge intelligently.

---

## Quick Workflow Summary

```
STEP 1: ANALYZE
├── Count tasks (need 3+)
├── Check dependencies
├── Check file overlap
└── Gate: Tasks are independent

STEP 2: MATCH AGENTS
├── Identify technology per task
├── Assign correct agent type
└── Document matching rationale

STEP 3: PREPARE BRIEFS
├── Scope, Files, Output, Success criteria
└── No placeholders allowed

STEP 4: LAUNCH PARALLEL
├── Single message with ALL Task tool calls
├── Do NOT wait between launches
└── Gate: All agents launched

STEP 5: AGGREGATE RESULTS
├── Collect outputs
├── Check for conflicts
└── Merge into summary

STEP 6: VERIFICATION
├── All agents completed
├── No file conflicts
├── Deliverables match briefs
└── Gate: All 5 checks pass
```

---

## Completion Announcement

When parallel execution is complete, announce:

```
Parallel execution complete.

**Quality Score: X/10**
- Independence Verification: X/2
- Agent Matching: X/2
- Brief Quality: X/2
- Execution Correctness: X/2
- Result Aggregation: X/2

**Results:**
- Features completed: X/Y
- Agents used: [list]
- Conflicts: [none/resolved/pending]

**Summary:**
[Brief description of what was delivered]

**Next steps:**
[Any remaining work or follow-up needed]
```

---

## Integration with Other Skills

The `run-parallel-agents-feature-build` skill integrates with:

- **`plan-to-task-list-with-dag`** — Use to generate a structured plan, then this skill to execute it
- **`plan-founder-review`** — Review the plan before execution (quality gate)
- **`start`** — Use `start` to identify if parallel agents are appropriate
- **`run-parallel-agents-feature-debug`** — For debugging, use the debug variant instead

**Workflow:** `start` → `plan-to-task-list-with-dag` → `plan-founder-review` → `run-parallel-agents-feature-build`

---

## Resources

### references/

- **agent_matching_logic.md** - Detailed rules for matching features to agent types, edge cases, and technology detection patterns

This skill does not require scripts or assets - it orchestrates existing Claude Code agent capabilities.

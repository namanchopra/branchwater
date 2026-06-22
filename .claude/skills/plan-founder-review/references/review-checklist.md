# Founder Review Checklist

## Instructions

Review the plan file from `plans/<name>.md` against the checks listed below. Be specific — cite plan section + codebase evidence for each finding. Skip anything that's fine. Only flag real problems.

**Review mode determines which sections to run:**
- **QUICK mode:** Sections 1-3 only
- **FULL mode:** All 6 sections

**Output classifications:**
- **BLOCK** — Must be fixed before execution (any 1 → REJECT verdict)
- **CONCERN** — Should be fixed (3+ → REVISE verdict)
- **OBSERVATION** — Informational, no action required

---

## Section 1: Codebase Reality Check

### File Path Verification

- [ ] Every `filesToModify` path exists in the codebase (Glob each one)
- [ ] Every `filesToCreate` path has a valid parent directory (or a prior task creates it)
- [ ] No phantom paths — if a path doesn't exist and the plan says "modify", it's a BLOCK
- [ ] File extensions match the project's tech stack (e.g., `.ts` not `.js` in a TypeScript project)

### Existing Code Search

- [ ] For each task that creates new files, search (Grep/Glob) for similar functionality in the codebase
- [ ] If a function/class/module with the same purpose already exists → BLOCK (building what exists)
- [ ] If similar code exists that could be extended → OBSERVATION (reuse opportunity)
- [ ] Check imports/dependencies referenced in the plan actually exist in `package.json`, `requirements.txt`, etc.

### Naming Conventions

- [ ] New file names match the project's existing patterns (check 3-5 similar files for reference)
- [ ] kebab-case vs camelCase vs PascalCase — consistent with project
- [ ] File suffixes match conventions (`.service.ts`, `.controller.ts`, `.test.ts`, etc.)
- [ ] Directory placement matches the project's organizational pattern

---

## Section 2: Scope & Strategy

### Mode Validation

- [ ] EXPANSION mode: plan introduces genuinely new functionality, not just extending existing code
- [ ] HOLD mode: plan builds on existing patterns, reuses existing code where possible
- [ ] REDUCTION mode: plan is minimal, no P3 tasks, no docs-only tasks, maximum reuse
- [ ] Task count aligns with mode: EXPANSION (5+), HOLD (3-8), REDUCTION (1-4)
- [ ] If mode doesn't match scope → CONCERN

### Goal Alignment

- [ ] Plan overview describes a clear goal
- [ ] Every task title contributes to the stated goal (read each one)
- [ ] No "infrastructure for infrastructure's sake" tasks that don't serve the goal
- [ ] The plan achieves the goal — if all tasks complete, is the feature done?
- [ ] If tasks don't serve the goal → CONCERN (unnecessary scope)

### Scope Creep Signals

- [ ] Tasks labeled P2/P3 that are actually prerequisites for the goal → should be P0/P1
- [ ] Tasks labeled P0/P1 that are nice-to-haves → should be P2/P3 or removed in REDUCTION mode
- [ ] Refactoring tasks bundled into a feature plan without clear justification
- [ ] Documentation tasks in a REDUCTION mode plan
- [ ] "While we're here" tasks — changes to nearby code not required by the goal

### Reuse Audit Validation

- [ ] "Existing Code Leverage" table exists in the plan
- [ ] Each "Reuse as-is" entry — verify the code actually handles the plan's use case
- [ ] Each "Build new" entry — verify no existing code handles this (cross-reference with Section 1)
- [ ] Each "Extend" entry — verify the existing code is actually extensible for this purpose

---

## Section 3: Architecture & Integration

### Diagram Completeness

- [ ] Architecture diagram exists in the plan
- [ ] Every TASK-NNN appears in the diagram (cross-reference task list)
- [ ] Diagram shows component relationships, not just a task list
- [ ] Data flow direction is indicated (arrows or labels)
- [ ] If tasks are missing from diagram → CONCERN

### Data Flow Validation

- [ ] Trace data from entry point through transformation to storage/output
- [ ] Every data transformation has a corresponding task
- [ ] No "magic" connections — every arrow in the diagram maps to an explicit integration point
- [ ] Data formats are consistent between producer and consumer tasks

### Integration Boundaries

- [ ] Where does plan code interact with existing systems? List each boundary.
- [ ] Each boundary has a task responsible for handling it
- [ ] External service interactions have error handling consideration
- [ ] Database schema changes are handled before code that depends on them

### API Contract Consistency

- [ ] If plan creates API endpoints: request/response shapes defined or referenced
- [ ] Producer tasks and consumer tasks agree on data shapes
- [ ] Error response formats are consistent across endpoints
- [ ] If contracts are inconsistent between tasks → CONCERN

### Dependency JSON Validation

- [ ] Every task ID appears as a key in the dependency JSON
- [ ] Dependency targets exist as task IDs (no dangling references)
- [ ] Data-flow dependencies are captured (if task B uses task A's output, B depends on A)
- [ ] No circular dependencies
- [ ] Dependencies match the architecture diagram's data flow
- [ ] If critical dependency is missing → BLOCK

---

## Section 4: Risk & Recovery (FULL only)

### Failure Modes Coverage

- [ ] "Failure Modes" table exists in the plan
- [ ] For each task: what happens if it fails? Is there a row covering it?
- [ ] System-level risks covered: external service unavailable, migration failure, auth provider down
- [ ] Data integrity risks covered: concurrent writes, partial updates, cascade deletes
- [ ] Performance risks covered: N+1 queries, unbounded operations, missing indexes
- [ ] If no failure modes table at all → BLOCK

### Mitigation Quality

- [ ] Each mitigation is actionable (not "be careful" or "test thoroughly")
- [ ] Mitigations specify what to do, not just what to avoid
- [ ] Rollback strategies are included for irreversible operations (data migration, schema changes)
- [ ] If mitigations are vague → CONCERN

### Error Boundary Coverage

- [ ] Tasks that produce output consumed by other tasks: what if output is malformed?
- [ ] Tasks that call external services: what if the service is down?
- [ ] Tasks that modify database schema: what if migration fails halfway?
- [ ] Error propagation paths are considered (not just local error handling)

### Rollback Strategy

- [ ] If plan includes database migration: rollback migration defined?
- [ ] If plan modifies shared state: can changes be reverted?
- [ ] If plan has side effects (emails, webhooks, external API calls): are they idempotent or guarded?
- [ ] Partial completion scenario: if task 3 of 6 fails, what state is the system in?

---

## Section 5: Test Coverage Gaps (FULL only)

### Coverage Map Completeness

- [ ] "Test Coverage Map" exists in the plan
- [ ] List every new codepath introduced by the plan
- [ ] Each codepath has a covering task in the map
- [ ] Each codepath has a test type (unit/integration/e2e)
- [ ] If codepaths are missing from map → CONCERN

### Test Type Appropriateness

- [ ] Pure logic/utility functions → unit tests
- [ ] API endpoints → integration tests
- [ ] Database interactions → integration tests
- [ ] Critical user flows → e2e tests
- [ ] Auth/security paths → integration tests (not just unit)
- [ ] If integration-worthy path tested only with unit → CONCERN

### Edge Case Coverage

- [ ] Each task has 2-3 acceptance criteria
- [ ] At least 1 criterion per task covers a failure or edge case
- [ ] Edge cases include: empty input, null values, concurrent access, large payloads
- [ ] If all criteria are happy-path only → CONCERN

### Security-Sensitive Paths

- [ ] Authentication paths have integration test coverage
- [ ] Authorization/IDOR paths have integration test coverage
- [ ] Payment/billing paths have integration test coverage
- [ ] Data mutation paths (create/update/delete) have test coverage
- [ ] If security path has zero test coverage → BLOCK

---

## Section 6: Execution Feasibility (FULL only)

### DAG Efficiency

- [ ] Calculate critical path length (longest dependency chain)
- [ ] Identify tasks that could be parallel but are unnecessarily sequential
- [ ] Parallelism ratio: (number of parallel groups) / (total tasks) — higher is better
- [ ] P0 tasks have zero dependencies (they are the roots of the DAG)
- [ ] If DAG is over-constrained → CONCERN

### Agent Assignment

- [ ] Every task has an `**Agent:**` field
- [ ] Agent matches the task's technology domain:
  - React/frontend → `react-vite-tailwind-engineer` or `nextjs-senior-engineer`
  - Python/FastAPI → `python-senior-engineer` or `fastapi-senior-engineer`
  - Node.js API → `express-senior-engineer`
  - CLI tool → `nodejs-cli-senior-engineer`
  - Mobile → `expo-react-native-engineer`
  - AWS/infra → `devops-aws-senior-engineer`
  - Docker → `devops-docker-senior-engineer`
  - Laravel → `laravel-senior-engineer`
  - iOS/macOS → `ios-macos-senior-engineer`
  - General/research → `general-purpose`
- [ ] If agent doesn't match domain → CONCERN
- [ ] If agent field is missing → CONCERN

### Effort Calibration

- [ ] S: 1 file, simple change (add a field, update a constant)
- [ ] M: 1-2 files, moderate complexity (new endpoint, new component)
- [ ] L: 2-3 files, significant complexity (new feature with tests)
- [ ] XL: 3+ files or high complexity — should this be split into smaller tasks?
- [ ] If XL task can be decomposed → CONCERN
- [ ] If effort doesn't match task description → CONCERN

### P0 Foundation Validation

- [ ] P0 tasks create types, schemas, configs, or other foundations
- [ ] P0 tasks have zero dependencies (empty arrays in dependency JSON)
- [ ] Other tasks depend on P0 tasks (they are actually foundational)
- [ ] If P0 task has dependencies → CONCERN
- [ ] If P0 task is not depended on by anyone → OBSERVATION (is it really P0?)

---

## Suppressions — DO NOT flag these

- Stylistic choices in the architecture diagram (box-drawing style, layout preference)
- Plan formatting variations that don't affect content (extra blank lines, heading style)
- Task ordering within the same priority level when dependencies are correctly captured
- Agent assignment when multiple agents could work (e.g., `python-senior-engineer` vs `fastapi-senior-engineer` for a FastAPI task)
- Effort estimates that are off by one level (S vs M) — only flag 2+ level mismatches
- Test coverage for pure configuration or documentation tasks
- Naming conventions when the project has no consistent pattern to reference
- Missing `filesToCreate` for test files — test files are often created alongside implementation
- P3 tasks in EXPANSION mode — they're expected
- Verbose task descriptions — more detail is better for agents

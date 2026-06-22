# Examples

## Example 1: Simple Feature — CRUD Endpoint

**Input:** "Add a `/api/projects` CRUD endpoint"

**Output (abbreviated):**

```markdown
# Plan: Projects CRUD API

> Generated: 2026-02-26
> Branch: `feat/projects-crud`

## Overview

Add a complete CRUD API for projects, including type definitions, route handlers,
and tests. Projects are a core entity for organizing work in the dashboard.

## Tasks

### TASK-001: Define Project types and Zod schemas

Create the Project type definitions and Zod validation schemas.

- Create `src/types/project.ts` with `ProjectSchema`, `CreateProjectSchema`, `UpdateProjectSchema`
- Export from `src/types/index.ts`

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] `ProjectSchema` validates id, name, description, createdAt, updatedAt fields
- [ ] `CreateProjectSchema` omits auto-generated fields (id, timestamps)
- [ ] Types are exported from shared types module

**Agent:** express-senior-engineer

**Priority:** P0

---

### TASK-002: Implement project persistence functions

Create the data access layer for projects using the existing persistence patterns.

- Add project CRUD functions in `src/persistence/projects.ts`
- Follow existing patterns for list, get, create, update, delete

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `listProjects()`, `getProject(id)`, `createProject(data)`, `updateProject(id, data)`, `deleteProject(id)` implemented
- [ ] Functions use the validated Zod types from TASK-001
- [ ] Error handling follows existing persistence patterns

**Agent:** express-senior-engineer

**Depends on:** TASK-001
**Priority:** P1

---

### TASK-003: Create project route handlers

Wire up the HTTP route handlers for the projects API.

- Create `src/routes/projects.ts` with GET, POST, PUT, DELETE handlers
- Register routes in `src/main.ts`

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `GET /api/projects` returns paginated list
- [ ] `POST /api/projects` creates with validation, returns 201
- [ ] `PUT /api/projects/:id` updates, returns 200; `DELETE` returns 204
- [ ] Input validation uses Zod schemas from TASK-001

**Agent:** express-senior-engineer

**Depends on:** TASK-001, TASK-002
**Priority:** P1

---

### TASK-004: Add tests for project routes

Write integration tests for the projects API routes.

- Create `src/routes/projects.test.ts`
- Test all CRUD operations and error cases

**Type:** test
**Effort:** M

**Acceptance Criteria:**
- [ ] Tests cover all 4 CRUD operations with success and error cases
- [ ] Tests validate response shapes against Zod schemas
- [ ] `vitest run` passes with all tests green

**Agent:** express-senior-engineer

**Depends on:** TASK-003
**Priority:** P2

---

## Task Dependencies

```json
{
  "TASK-001": [],
  "TASK-002": ["TASK-001"],
  "TASK-003": ["TASK-001", "TASK-002"],
  "TASK-004": ["TASK-003"]
}
```
```

---

## Example 2: Complex Multi-Layer Feature — Webhook System

**Input:** "Add a webhook notification system — users configure webhook URLs, events trigger POST requests"

**Output (abbreviated):**

```markdown
# Plan: Webhook Notification System

> Generated: 2026-02-26
> Branch: `feat/webhook-notifications`
> Mode: HOLD

## Overview

Implement a webhook notification system that allows users to configure webhook URLs
for specific events. When events fire, the system sends POST requests with event
payloads to registered webhooks, with retry logic and delivery tracking.

## Scope Challenge

Considered building a full async queue-based dispatcher but existing event bus pattern
in `src/services/events.ts` already handles pub/sub. HTTP dispatch can layer on top.
User selected HOLD mode — build the webhook layer, reuse event bus, skip admin analytics dashboard.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ Event Bus   │────▶│ Webhook Listener │────▶│ Webhook Dispatcher  │
│ (existing)  │     │ TASK-004         │     │ TASK-003            │
└─────────────┘     └──────────────────┘     └────────┬────────────┘
                                                      │ POST + HMAC
                    ┌──────────────────┐               ▼
                    │ Webhook Routes   │     ┌─────────────────────┐
                    │ TASK-005         │     │ External Endpoints  │
                    └────────┬─────────┘     └─────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │ Webhook Config   │◀── TASK-001 (types)
                    │ Persistence      │    TASK-002 (CRUD)
                    └──────────────────┘
```

## Existing Code Leverage

| Sub-problem | Existing Code | Action |
|------------|---------------|--------|
| Event subscription | `src/services/events.ts` | Reuse as-is |
| HTTP dispatching | (none) | Build new |
| Config persistence | `src/persistence/` pattern | Extend pattern |
| Route handlers | `src/routes/` pattern | Extend pattern |
| HMAC signing | (none) | Build new |

## Tasks

### TASK-001: Define webhook types and Zod schemas

**Type:** feature | **Effort:** S | **Agent:** express-senior-engineer | **Priority:** P0

- Create `src/types/webhook.ts`
- Export from barrel

**Acceptance Criteria:**
- [ ] `WebhookConfigSchema` with url, events array, secret, enabled flag
- [ ] `WebhookDeliverySchema` with status, attempts, response code
- [ ] Types exported from shared types module

---

### TASK-002: Implement webhook config persistence

**Type:** feature | **Effort:** M | **Agent:** express-senior-engineer | **Priority:** P1
**Depends on:** TASK-001

- Add webhook CRUD in `src/persistence/webhooks.ts`

**Acceptance Criteria:**
- [ ] CRUD for webhook configurations
- [ ] Lookup by event type for dispatch

---

### TASK-003: Create webhook dispatcher

**Type:** feature | **Effort:** L | **Agent:** express-senior-engineer | **Priority:** P1
**Depends on:** TASK-001

- Create `src/services/webhook-dispatcher.ts`
- HMAC signature generation, retry with exponential backoff

**Acceptance Criteria:**
- [ ] Sends POST with JSON payload and HMAC signature header
- [ ] Retries up to 3 times with exponential backoff
- [ ] Records delivery status

---

### TASK-004: Wire webhook dispatcher to event bus

**Type:** feature | **Effort:** M | **Agent:** express-senior-engineer | **Priority:** P1
**Depends on:** TASK-002, TASK-003

- Integrate in `src/services/webhook-listener.ts`

**Acceptance Criteria:**
- [ ] Listens to configured event types via event bus
- [ ] Dispatches to all matching webhook URLs
- [ ] Follows existing service patterns

---

### TASK-005: Create webhook management API routes

**Type:** feature | **Effort:** M | **Agent:** express-senior-engineer | **Priority:** P1
**Depends on:** TASK-002

- Add routes in `src/routes/webhooks.ts`

**Acceptance Criteria:**
- [ ] CRUD endpoints for webhook configs
- [ ] GET delivery history endpoint
- [ ] Test endpoint that sends a ping

---

### TASK-006: Add webhook dashboard UI

**Type:** feature | **Effort:** M | **Agent:** react-vite-tailwind-engineer | **Priority:** P2
**Depends on:** TASK-005

- Create page in `src/app/webhooks/page.tsx`

**Acceptance Criteria:**
- [ ] List/create/edit/delete webhook configs
- [ ] Show delivery history with status indicators
- [ ] Test button sends ping and shows result

---

### TASK-007: Write tests for webhook dispatcher

**Type:** test | **Effort:** M | **Agent:** express-senior-engineer | **Priority:** P2
**Depends on:** TASK-003

- Create `src/services/webhook-dispatcher.test.ts`

**Acceptance Criteria:**
- [ ] Tests successful delivery, retry on failure, HMAC signature
- [ ] Uses `vi.stubGlobal("fetch", mockFetch)` for HTTP mocking
- [ ] `vitest run` passes

---

### TASK-008: Write tests for webhook API routes

**Type:** test | **Effort:** M | **Agent:** express-senior-engineer | **Priority:** P2
**Depends on:** TASK-005

- Create `src/routes/webhooks.test.ts`

**Acceptance Criteria:**
- [ ] Tests all CRUD operations and delivery history
- [ ] Validates response shapes against Zod schemas
- [ ] `vitest run` passes

---

## Failure Modes

| Risk | Affected Tasks | Mitigation |
|------|---------------|------------|
| Webhook endpoint returns 5xx | TASK-003 | Retry with exponential backoff, max 3 attempts |
| HMAC secret rotation | TASK-003 | Support multiple active secrets during rotation window |
| Event bus backpressure | TASK-004 | Async dispatch — don't block event bus on HTTP calls |
| Webhook URL is unreachable | TASK-003 | Timeout after 10s, record delivery failure |

## Test Coverage Map

| New Codepath | Covering Task | Test Type |
|-------------|--------------|-----------|
| Webhook config CRUD | TASK-008 | integration |
| HMAC signature generation | TASK-007 | unit |
| Retry with backoff | TASK-007 | unit |
| Event → dispatch flow | TASK-007 | integration |
| Webhook management API | TASK-008 | integration |

## Task Dependencies

```json
{
  "TASK-001": [],
  "TASK-002": ["TASK-001"],
  "TASK-003": ["TASK-001"],
  "TASK-004": ["TASK-002", "TASK-003"],
  "TASK-005": ["TASK-002"],
  "TASK-006": ["TASK-005"],
  "TASK-007": ["TASK-003"],
  "TASK-008": ["TASK-005"]
}
```
```

**Parallel execution plan:**
- Layer 0: TASK-001 (P0, no deps)
- Layer 1: TASK-002, TASK-003 (P1, both depend only on TASK-001)
- Layer 2: TASK-004, TASK-005 (P1, different dep chains)
- Layer 3: TASK-006, TASK-007, TASK-008 (P2, independent within layer)

---

## Example 3: Cross-Package Feature — New Plugin

**Input:** "Create a Linear issue tracker plugin"

**Output (abbreviated):**

```markdown
# Plan: Linear Issue Tracker Plugin

> Generated: 2026-02-26
> Branch: `feat/tracker-linear`

## Overview

Create a new tracker plugin for Linear integration, following the existing tracker plugin pattern
(tracker-github, tracker-json). The plugin syncs tasks with Linear issues.

## Tasks

### TASK-001: Define Linear tracker types

**Type:** feature | **Effort:** S | **Agent:** nodejs-cli-senior-engineer | **Priority:** P0

- Add Linear-specific types in `src/plugins/tracker-linear/types.ts`
- Reference existing tracker contract in `src/types/tracker.ts`

**Acceptance Criteria:**
- [ ] `LinearConfig` type with apiKey, teamId, projectId
- [ ] Types extend base `TrackerPlugin` interface from contracts
- [ ] No modifications to shared contracts needed

---

### TASK-002: Implement Linear API client

**Type:** feature | **Effort:** M | **Agent:** nodejs-cli-senior-engineer | **Priority:** P1
**Depends on:** TASK-001

- Create `src/plugins/tracker-linear/client.ts`
- Uses Linear GraphQL API via fetch

**Acceptance Criteria:**
- [ ] `createIssue()`, `updateIssue()`, `getIssue()`, `listIssues()` implemented
- [ ] Uses `execFileSync`-safe patterns (no shell template injection)
- [ ] Handles rate limiting with exponential backoff

---

### TASK-003: Create plugin entry point with manifest

**Type:** feature | **Effort:** M | **Agent:** nodejs-cli-senior-engineer | **Priority:** P1
**Depends on:** TASK-001, TASK-002

- Create `src/plugins/tracker-linear/index.ts`
- Follow plugin pattern from `tracker-github`

**Acceptance Criteria:**
- [ ] Exports `{ manifest, create }` matching the plugin interface
- [ ] `manifest` includes name, version, slot, description
- [ ] `create()` returns tracker instance with all required methods

---

### TASK-004: Add package scaffolding

**Type:** infra | **Effort:** S | **Agent:** nodejs-cli-senior-engineer | **Priority:** P0

- Create `src/plugins/tracker-linear/package.json`
- Create `src/plugins/tracker-linear/tsconfig.json`

**Acceptance Criteria:**
- [ ] `package.json` has correct name `tracker-linear`, ESM config, build/test scripts
- [ ] `tsconfig.json` extends base config
- [ ] Build succeeds including new package

---

### TASK-005: Write plugin tests

**Type:** test | **Effort:** M | **Agent:** nodejs-cli-senior-engineer | **Priority:** P2
**Depends on:** TASK-003

- Create `src/plugins/tracker-linear/index.test.ts`
- Create `src/plugins/tracker-linear/vitest.config.ts`

**Acceptance Criteria:**
- [ ] Tests plugin creation, manifest shape, and method stubs
- [ ] Mocks Linear API with `vi.stubGlobal("fetch", mockFetch)`
- [ ] `vitest run` passes

---

### TASK-006: Register plugin in plugin registry

**Type:** feature | **Effort:** S | **Agent:** nodejs-cli-senior-engineer | **Priority:** P1
**Depends on:** TASK-003

- Update `src/core/plugin-registry/` to discover `tracker-linear`
- Add to catalog in `src/config/`

**Acceptance Criteria:**
- [ ] Plugin discoverable via registry's scan mechanism
- [ ] `tracker-linear` appears in available tracker plugins
- [ ] No breaking changes to existing plugin discovery

---

## Task Dependencies

```json
{
  "TASK-001": [],
  "TASK-002": ["TASK-001"],
  "TASK-003": ["TASK-001", "TASK-002"],
  "TASK-004": [],
  "TASK-005": ["TASK-003"],
  "TASK-006": ["TASK-003"]
}
```
```

**Note:** TASK-001 and TASK-004 are both P0 with no dependencies — they run in parallel as Layer 0.

---

## Example 4: Bug Fix Decomposition

**Input:** "WebSocket connections drop after 30 seconds of inactivity"

**Output (abbreviated):**

```markdown
# Plan: Fix WebSocket Idle Timeout

> Generated: 2026-02-26
> Branch: `fix/ws-idle-timeout`

## Overview

WebSocket connections are being dropped after 30 seconds of inactivity. Investigate the root cause
(likely missing ping/pong keepalive) and implement a fix with proper heartbeat mechanism.

## Tasks

### TASK-001: Investigate WebSocket timeout root cause

**Type:** bug | **Effort:** S | **Agent:** express-senior-engineer | **Priority:** P0

- Examine `src/transport/` for WS transport implementation
- Check `src/main.ts` for WS server configuration
- Look for missing ping/pong or keepalive configuration

**Acceptance Criteria:**
- [ ] Root cause identified and documented in task description (add as code comment)
- [ ] Affected files listed with specific line numbers
- [ ] Reproduction steps confirmed

---

### TASK-002: Implement WebSocket keepalive heartbeat

**Type:** bug | **Effort:** M | **Agent:** express-senior-engineer | **Priority:** P1
**Depends on:** TASK-001

- Modify the WS transport in `src/transport/ws.ts`
- Add server-side ping interval and client-side pong handler

**Acceptance Criteria:**
- [ ] Server sends ping every 15 seconds
- [ ] Client responds with pong automatically
- [ ] Connections that miss 2 consecutive pongs are terminated and cleaned up
- [ ] Configurable interval via options

---

### TASK-003: Add WebSocket keepalive tests

**Type:** test | **Effort:** M | **Agent:** express-senior-engineer | **Priority:** P2
**Depends on:** TASK-002

- Create or update tests in `src/transport/ws.test.ts`

**Acceptance Criteria:**
- [ ] Test that ping is sent at configured interval
- [ ] Test that connection survives idle period > 30 seconds
- [ ] Test that dead connections (no pong) are cleaned up
- [ ] `vitest run` passes

---

## Task Dependencies

```json
{
  "TASK-001": [],
  "TASK-002": ["TASK-001"],
  "TASK-003": ["TASK-002"]
}
```
```
